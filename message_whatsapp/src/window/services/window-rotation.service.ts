import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WhatsappChat, WindowStatus, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationCapacityService } from 'src/conversation-capacity/conversation-capacity.service';
import { ValidationEngineService } from './validation-engine.service';
import { CallObligationService } from 'src/call-obligations/call-obligation.service';
import { ConversationReportService } from 'src/gicop-report/conversation-report.service';
import { DistributedLockService } from 'src/redis/distributed-lock.service';

export const WINDOW_ROTATED_EVENT             = 'window.rotated';
export const WINDOW_REPORT_SUBMITTED_EVENT    = 'window.report_submitted';
export const WINDOW_ROTATION_BLOCKED_EVENT    = 'window.rotation_blocked';

export interface WindowRotatedPayload {
  posteId: string;
  releasedChatIds: string[];
  promotedChatIds: string[];
}

export interface WindowReportSubmittedPayload {
  posteId: string;
  chatId?: string;
}

export interface WindowRotationBlockedPayload {
  posteId: string;
  reason: 'quality_check_failed' | 'call_obligations_incomplete';
  progress: { submitted: number; total: number };
  obligations?: object | null;
}

@Injectable()
export class WindowRotationService {
  private readonly logger = new Logger(WindowRotationService.name);
  private readonly rotatingPostes = new Set<string>();

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly capacityService: ConversationCapacityService,
    private readonly validationEngine: ValidationEngineService,
    private readonly eventEmitter: EventEmitter2,
    private readonly reportService: ConversationReportService,
    private readonly lockService: DistributedLockService,

    @Optional()
    private readonly obligationService: CallObligationService,
  ) {}

  /**
   * Construit ou répare la fenêtre de 50 conversations pour un poste.
   * Appelé à la connexion d'un commercial.
   * Nettoie d'abord les slots des conversations fermées avant d'assigner.
   * Ignoré si le mode fenêtre glissante est désactivé.
   */
  async buildWindowForPoste(posteId: string): Promise<void> {
    const modeEnabled = await this.capacityService.isWindowModeEnabled();
    if (!modeEnabled) {
      this.logger.debug(`buildWindowForPoste ignoré pour poste ${posteId} (mode glissant désactivé)`);
      return;
    }

    // S'assurer qu'un batch d'obligations est actif pour ce poste
    if (await this.obligationService?.isEnabled()) {
      await this.obligationService.getOrCreateActiveBatch(posteId);
    }
    const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

    // Les conversations FERMÉ conservent leur slot jusqu'à la rotation.
    // Elles disparaissent seulement quand tous les rapports du bloc sont soumis.

    // 2. Lire les conversations slottées restantes (non fermées, non released)
    const slottedChats = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.window_slot IS NOT NULL')
      .andWhere('c.window_status != :released', { released: WindowStatus.RELEASED })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.window_slot', 'ASC')
      .getMany();

    const needed = quotaTotal - slottedChats.length;
    if (needed <= 0) {
      this.logger.log(`Fenêtre complète pour poste ${posteId} (${slottedChats.length} slots actifs)`);
      await this.checkAndTriggerRotation(posteId);
      return;
    }

    const slottedIds = new Set(slottedChats.map((c) => c.id));

    // 3. Candidats non encore slottés (hors FERMÉ en premier lieu)
    const unslotted = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
      .andWhere('c.is_priority = 0')
      .orderBy('c.last_activity_at', 'DESC')
      .take(needed + slottedChats.length + 5)
      .getMany();

    let candidates = unslotted.filter((c) => !slottedIds.has(c.id)).slice(0, needed);

    // Cas : pas assez de convs non-FERMÉ pour remplir la fenêtre.
    // On inclut les FERMÉ sans rapport (même celles RELEASED par l'ancien code) pour que
    // l'utilisateur puisse soumettre leurs rapports. Les FERMÉ ayant déjà un rapport sont
    // exclues pour ne pas déclencher une rotation immédiate en boucle.
    if (candidates.length < needed) {
      const fermeChats = await this.chatRepo
        .createQueryBuilder('c')
        .where('c.poste_id = :posteId', { posteId })
        .andWhere('c.status = :ferme', { ferme: WhatsappChatStatus.FERME })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('c.is_priority = 0')
        .orderBy('c.last_activity_at', 'DESC')
        .take((needed - candidates.length) * 2)
        .getMany();
      const fermeCandidates = fermeChats.filter((c) => !slottedIds.has(c.id));
      if (fermeCandidates.length > 0) {
        const submittedMap = await this.reportService.getSubmittedMapBulk(
          fermeCandidates.map((c) => c.chat_id),
        );
        const fermeWithoutReport = fermeCandidates.filter((c) => !submittedMap.get(c.chat_id));
        if (fermeWithoutReport.length > 0) {
          this.logger.log(
            `buildWindowForPoste poste=${posteId} : ${fermeWithoutReport.length} conv FERMÉ sans rapport incluses dans la fenêtre`,
          );
          candidates = [...candidates, ...fermeWithoutReport].slice(0, needed);
        }
      }
    }

    if (candidates.length === 0 && slottedChats.length > 0) {
      this.logger.log(`Fenêtre stable pour poste ${posteId} (${slottedChats.length} slots, aucun nouveau candidat)`);
      await this.checkAndTriggerRotation(posteId);
      return;
    }

    // 4. Réassigner les slots 1…N pour tous (existants + nouveaux), en batch
    const all = [...slottedChats, ...candidates];
    const toInit: string[] = [];

    // Calculer les valeurs cibles pour chaque conversation.
    // Le statut de fenetre reste strictement ACTIVE/LOCKED/RELEASED.
    // La soumission du rapport est lue dans conversation_report, pas dans window_status.
    const assignments = all.map((chat, i) => {
      const slot = i + 1;
      const status = slot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
      const isLocked = status === WindowStatus.LOCKED;
      // N'initialiser la validation que pour les conversations nouvellement promues LOCKED→ACTIVE
      if (chat.window_status === WindowStatus.LOCKED && status === WindowStatus.ACTIVE) {
        toInit.push(chat.chat_id);
      }
      return { id: chat.id, slot, status, isLocked };
    });

    // Un seul UPDATE par groupe de statut (évite N aller-retours DB)
    await this.batchUpdateSlots(assignments);

    // Initialiser les validations pour les nouvelles conversations actives (bulk)
    await this.validationEngine.initConversationValidationBulk(toInit);

    // Réinitialiser le statut de soumission pour les nouvelles entrées non-FERMÉ et les promotions
    // LOCKED→ACTIVE afin qu'un rapport soumis dans un bloc précédent ne déclenche
    // pas la rotation du nouveau bloc prématurément.
    // Les convs FERMÉ sont exclues : leur rapport soumis doit être conservé pour la rotation.
    const resetChatIds = [
      ...candidates.filter((c) => c.status !== WhatsappChatStatus.FERME).map((c) => c.chat_id),
      ...toInit,
    ];
    await this.reportService.resetSubmissionBulk(resetChatIds);

    this.logger.log(
      `Fenêtre construite pour poste ${posteId} : ${slottedChats.length} existantes + ${candidates.length} nouvelles (total ${all.length})`,
    );

    // Déclencher la rotation si les rapports des 10 conversations actives sont déjà soumis.
    await this.checkAndTriggerRotation(posteId);
  }

  /**
   * Batch update de slots — updates en parallèle sans transaction explicite.
   * Évite les problèmes de manager.transaction dans certaines configurations TypeORM.
   */
  private async batchUpdateSlots(
    assignments: Array<{ id: string; slot: number | null; status: WindowStatus; isLocked: boolean }>,
  ): Promise<void> {
    if (assignments.length === 0) return;

    await Promise.all(
      assignments.map((a) =>
        this.chatRepo.update(
          { id: a.id },
          { window_slot: a.slot, window_status: a.status, is_locked: a.isLocked },
        ),
      ),
    );
  }

  /**
   * Libère les slots de plusieurs conversations en un seul UPDATE.
   */
  private async batchRelease(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.chatRepo
      .createQueryBuilder()
      .update()
      .set({ window_slot: null as any, window_status: WindowStatus.RELEASED, is_locked: false })
      .whereInIds(ids)
      .execute();
  }

  /**
   * Écoute l'événement conversation.result_set émis par WhatsappChatService.
   * Marque le critère 'result_set' et déclenche éventuellement la rotation.
   */
  @OnEvent('conversation.result_set', { async: true })
  async handleConversationResultSet(payload: { chatId: string; posteId: string | null | undefined }): Promise<void> {
    if (!payload.posteId) return;

    const modeEnabled = await this.capacityService.isWindowModeEnabled();

    if (!modeEnabled) {
      // Mode classique : déverrouiller la conversation suivante
      await this.capacityService.onConversationQualifiedLegacy(payload.posteId);
      return;
    }

    // ── Auto-init fenêtre si jamais construite (commercial connecté avant déploiement) ─
    const hasWindow = await this.chatRepo.findOne({
      where: [
        { poste_id: payload.posteId, window_status: WindowStatus.ACTIVE },
        { poste_id: payload.posteId, window_status: WindowStatus.LOCKED },
      ],
      select: ['id'],
    });
    if (!hasWindow) {
      this.logger.log(`Fenêtre non initialisée pour poste ${payload.posteId} — auto-build au dépôt du rapport`);
      await this.buildWindowForPoste(payload.posteId);
    }

    // Mode glissant : marquer le critere result_set pour l'affichage/progression historique,
    // puis verifier la rotation uniquement depuis conversation_report.
    await this.validationEngine.onConversationResultSet(payload.chatId);

    try {
      await this.checkAndTriggerRotation(payload.posteId);
    } catch (err) {
      this.logger.error(
        `Erreur lors de la rotation pour poste ${payload.posteId} / chat ${payload.chatId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    this.eventEmitter.emit(WINDOW_REPORT_SUBMITTED_EVENT, {
      posteId: payload.posteId,
      chatId: payload.chatId,
    } satisfies WindowReportSubmittedPayload);
  }

  /**
   * Écoute la demande de compactage après réassignation de conversation.
   */
  @OnEvent('window.compact_requested', { async: true })
  async handleCompactRequested(payload: { posteId: string }): Promise<void> {
    await this.compactSlots(payload.posteId);
    this.logger.log(`Compactage effectué pour poste ${payload.posteId} (réassignation)`);
  }

  /**
   * Écoute la fermeture d'une conversation.
   * La conversation conserve son slot pour que l'utilisateur puisse soumettre son rapport.
   * La rotation libèrera toutes les convs du bloc quand les N rapports seront soumis.
   */
  @OnEvent('conversation.status_changed', { async: true })
  async handleConversationStatusChanged(payload: {
    chatId: string;
    newStatus: string;
  }): Promise<void> {
    if (payload.newStatus !== 'fermé') return;

    const chat = await this.chatRepo.findOne({ where: { chat_id: payload.chatId } });
    if (!chat?.poste_id || chat.window_slot == null) return;

    // La conv FERMÉ conserve son slot : l'utilisateur peut encore soumettre le rapport.
    // La rotation libèrera toutes les convs du bloc quand les 10 rapports seront soumis.
    await this.checkAndTriggerRotation(chat.poste_id);
  }

  /**
   * Vérifie si les rapports des conversations actives sont soumis.
   * Si oui, déclenche la rotation.
   */
  async checkAndTriggerRotation(posteId: string): Promise<void> {
    if (this.rotatingPostes.has(posteId)) return;

    const modeEnabled = await this.capacityService.isWindowModeEnabled();
    if (!modeEnabled) return;

    const { quotaActive } = await this.capacityService.getQuotas();

    let activeGroup = await this.chatRepo.find({
      where: {
        poste_id: posteId,
        window_status: WindowStatus.ACTIVE,
        window_slot: Not(IsNull()),
      },
      order: { window_slot: 'ASC' },
    });

    // Si moins de quotaActive conversations actives, compacter pour promouvoir les LOCKED.
    // On ne quitte PAS si après compactage il en reste encore moins : on calcule
    // le seuil sur le nombre réel (cas d'un poste avec peu de conversations au total).
    if (activeGroup.length < quotaActive) {
      await this.compactSlots(posteId);
      activeGroup = await this.chatRepo.find({
        where: {
          poste_id: posteId,
          window_status: WindowStatus.ACTIVE,
          window_slot: Not(IsNull()),
        },
        order: { window_slot: 'ASC' },
      });
    }

    if (activeGroup.length === 0) return;

    const activeSlots = activeGroup.slice(0, quotaActive);
    const submittedMap = await this.reportService.getSubmittedMapBulk(
      activeSlots.map((c) => c.chat_id),
    );
    const submittedCount = activeSlots.filter((c) => submittedMap.get(c.chat_id) === true).length;

    // Seuil = nombre réel de slots actifs (plafonné à quotaActive).
    // Ceci couvre le cas où le poste a moins de quotaActive conversations au total.
    const requiredCount = Math.min(quotaActive, activeSlots.length);

    this.logger.log(
      `checkAndTriggerRotation poste=${posteId} : ${submittedCount}/${activeSlots.length} soumis, seuil=${requiredCount}`,
    );

    if (submittedCount < requiredCount) return;

    // Vérifier les obligations d'appel du poste avant de déclencher la rotation.
    if (await this.obligationService?.isEnabled()) {
      // OBL-003 — Rafraîchir le contrôle qualité sur le bloc actif (activeSlots déjà en mémoire)
      // avant de lire le statut persisté, pour éviter une valeur périmée.
      await this.obligationService.checkAndRecordQuality(posteId, activeSlots);
      const obligationStatus = await this.obligationService.getStatus(posteId);
      if (obligationStatus && !obligationStatus.readyForRotation) {
        const validatedCount =
          obligationStatus.annulee.done +
          obligationStatus.livree.done +
          obligationStatus.sansCommande.done;
        const totalRequired =
          obligationStatus.annulee.required +
          obligationStatus.livree.required +
          obligationStatus.sansCommande.required;
        const reason: WindowRotationBlockedPayload['reason'] =
          validatedCount < totalRequired ? 'call_obligations_incomplete' : 'quality_check_failed';
        this.logger.log(
          `Rotation bloquée poste=${posteId} : obligations ${validatedCount}/${totalRequired}, qualité=${obligationStatus.qualityCheckPassed}`,
        );
        this.eventEmitter.emit(WINDOW_ROTATION_BLOCKED_EVENT, {
          posteId,
          reason,
          progress: { submitted: validatedCount, total: totalRequired },
          obligations: obligationStatus,
        } satisfies WindowRotationBlockedPayload);
        return;
      }
    }

    this.logger.log(
      `Rotation déclenchée pour poste ${posteId} (${submittedCount}/${activeSlots.length} rapports soumis, seuil: ${requiredCount})`,
    );
    await this.performRotation(posteId);
  }

  /**
   * Rattrapage automatique toutes les minutes :
   * 1. Vérifie la rotation pour les postes dont la fenêtre est déjà construite.
   * 2. Initialise la fenêtre des postes qui ont des conversations sans window_slot
   *    (cas : mode activé après connexion du commercial, ou buildWindowForPoste raté).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async autoCheckRotations(): Promise<void> {
    const modeEnabled = await this.capacityService.isWindowModeEnabled();
    if (!modeEnabled) return;

    // ── 1. Postes avec fenêtre déjà construite → vérifier la rotation ──────────
    const slottedRows = await this.chatRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.poste_id', 'posteId')
      .where('c.poste_id IS NOT NULL')
      .andWhere('c.window_slot IS NOT NULL')
      .andWhere('c.window_status != :released', { released: WindowStatus.RELEASED })
      .andWhere('c.deletedAt IS NULL')
      .getRawMany<{ posteId: string }>();

    const slottedPosteIds = new Set(slottedRows.map((r) => r.posteId));

    for (const row of slottedRows) {
      if (!row.posteId) continue;
      try {
        await this.checkAndTriggerRotation(row.posteId);
      } catch (err) {
        this.logger.warn(
          `autoCheckRotations: rotation check échoué pour poste ${row.posteId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    // ── 2. Postes sans window_slot → construire la fenêtre (rattrapage) ────────
    // Pas de filtre sur status : si toutes les convs sont FERMÉ (cron 24h),
    // buildWindowForPoste les slotte quand même pour permettre la rotation.
    // On exclut les RELEASED (window_slot=null après rotation) pour éviter la boucle infinie.
    const uninitRows = await this.chatRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.poste_id', 'posteId')
      .where('c.poste_id IS NOT NULL')
      .andWhere('c.window_slot IS NULL')
      .andWhere('(c.window_status IS NULL OR c.window_status != :released)', { released: WindowStatus.RELEASED })
      .andWhere('c.deletedAt IS NULL')
      .getRawMany<{ posteId: string }>();

    for (const row of uninitRows) {
      if (!row.posteId || slottedPosteIds.has(row.posteId)) continue;
      this.logger.log(`autoCheckRotations: fenêtre non initialisée pour poste ${row.posteId} — build automatique`);
      try {
        await this.buildWindowForPoste(row.posteId);
      } catch (err) {
        this.logger.warn(
          `autoCheckRotations: buildWindowForPoste échoué pour poste ${row.posteId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  /**
   * Retourne l'état détaillé de la fenêtre pour un poste — lecture seule, sans modifier.
   * Utilisé par l'endpoint admin GET /window/debug/:posteId.
   */
  async getDebugState(posteId: string): Promise<object> {
    const modeEnabled = await this.capacityService.isWindowModeEnabled();
    const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();
    const rotationLocked = this.rotatingPostes.has(posteId);

    const allSlotted = await this.chatRepo.find({
      where: { poste_id: posteId },
      order: { window_slot: 'ASC' },
    });

    const withSlot = allSlotted.filter((c) => c.window_slot != null);
    const chatIds = withSlot.map((c) => c.chat_id);
    const submittedMap = chatIds.length > 0
      ? await this.reportService.getSubmittedMapBulk(chatIds)
      : new Map<string, boolean>();

    const activeConvs = withSlot.filter((c) => c.window_status === WindowStatus.ACTIVE);
    const lockedConvs = withSlot.filter((c) => c.window_status === WindowStatus.LOCKED);

    const activeSlots = activeConvs.slice(0, quotaActive);
    const submittedCount = activeSlots.filter((c) => submittedMap.get(c.chat_id) === true).length;
    const requiredCount = Math.min(quotaActive, activeSlots.length);

    return {
      posteId,
      modeEnabled,
      quotaActive,
      quotaTotal,
      rotationLocked,
      rotationWouldTrigger: submittedCount >= requiredCount && activeSlots.length > 0,
      submittedCount,
      requiredCount,
      activeCount: activeConvs.length,
      lockedCount: lockedConvs.length,
      conversations: withSlot.map((c) => ({
        chat_id:      c.chat_id,
        window_slot:  c.window_slot,
        window_status: c.window_status,
        chat_status:  c.status,
        is_locked:    c.is_locked,
        submitted:    submittedMap.get(c.chat_id) ?? false,
      })),
    };
  }

  /**
   * E01-T01 — Effectue la rotation sous verrou distribué (Redlock + fallback in-process).
   * Garantit qu'une seule instance exécute la rotation pour un poste donné à la fois.
   * Logs : LOCK_ACQUIRED / LOCK_SKIPPED / LOCK_RELEASED.
   */
  async performRotation(posteId: string): Promise<{ releasedChatIds: string[]; promotedChatIds: string[] }> {
    // Guard in-process (même instance) — fast path
    if (this.rotatingPostes.has(posteId)) {
      this.logger.log(`LOCK_SKIPPED poste=${posteId} (rotation en cours sur cette instance)`);
      return { releasedChatIds: [], promotedChatIds: [] };
    }

    const { acquired, result } = await this.lockService.tryWithLock(
      `window:rotation:${posteId}`,
      120_000,
      async () => {
        this.rotatingPostes.add(posteId);
        this.logger.log(`LOCK_ACQUIRED poste=${posteId}`);
        try {
          return await this._executeRotation(posteId);
        } finally {
          this.rotatingPostes.delete(posteId);
          this.logger.log(`LOCK_RELEASED poste=${posteId}`);
        }
      },
    );

    if (!acquired) {
      this.logger.log(`LOCK_SKIPPED poste=${posteId} (rotation en cours sur autre instance)`);
      return { releasedChatIds: [], promotedChatIds: [] };
    }

    return result ?? { releasedChatIds: [], promotedChatIds: [] };
  }

  private async _executeRotation(posteId: string): Promise<{ releasedChatIds: string[]; promotedChatIds: string[] }> {
    try {
      const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

      // 1. Conversations du bloc actif dont le rapport est soumis a liberer.
      // Le statut metier (actif/ferme) ne bloque pas la rotation.
      const activeGroup = await this.chatRepo.find({
        where: {
          poste_id: posteId,
          window_status: WindowStatus.ACTIVE,
          window_slot: Not(IsNull()),
        },
        order: { window_slot: 'ASC' },
      });
      const activeSlots = activeGroup.slice(0, quotaActive);
      const submittedMap = await this.reportService.getSubmittedMapBulk(
        activeSlots.map((c) => c.chat_id),
      );
      const submitted = activeSlots.filter((c) => submittedMap.get(c.chat_id) === true);

      // 1. Liberer les conversations soumises en un seul UPDATE
      const releasedChatIds = submitted.map((c) => c.chat_id);
      await this.batchRelease(submitted.map((c) => c.id));

      // 2. Conversations verrouillées/actives restantes — réassigner les slots
      const remaining = await this.chatRepo.find({
        where: {
          poste_id: posteId,
          window_status: In([WindowStatus.LOCKED, WindowStatus.ACTIVE]),
          window_slot: Not(IsNull()),
        },
        order: { window_slot: 'ASC' },
      });

      const promotedChatIds: string[] = [];
      const remainingAssignments = remaining.map((chat, i) => {
        const newSlot = i + 1;
        const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
        if (chat.window_status === WindowStatus.LOCKED && newStatus === WindowStatus.ACTIVE) {
          promotedChatIds.push(chat.chat_id);
        }
        return { id: chat.id, slot: newSlot, status: newStatus, isLocked: newStatus === WindowStatus.LOCKED };
      });
      await this.batchUpdateSlots(remainingAssignments);

      // Initialiser les validations pour les conversations promues (bulk)
      await this.validationEngine.initConversationValidationBulk(promotedChatIds);

      // 3. Injecter de nouvelles conversations (non encore dans la fenêtre)
      const slotsUsed = remaining.length;
      const slotsAvailable = quotaTotal - slotsUsed;
      const injectChatIds: string[] = [];

      if (slotsAvailable > 0) {
        const excludedIds = new Set([
          ...remaining.map((c) => c.id),
          ...submitted.map((c) => c.id),
        ]);

        // Convs non-RELEASED + toutes les FERME (même RELEASED par l'ancien code sans rapport).
        const newCandidates = await this.chatRepo
          .createQueryBuilder('c')
          .where('c.poste_id = :posteId', { posteId })
          .andWhere('c.deletedAt IS NULL')
          .andWhere('c.is_priority = 0')
          .andWhere('(c.window_status IS NULL OR c.window_status != :released OR c.status = :ferme)', {
            released: WindowStatus.RELEASED,
            ferme: WhatsappChatStatus.FERME,
          })
          .orderBy('c.last_activity_at', 'DESC')
          .take(slotsAvailable + submitted.length)
          .getMany();

        const unexcluded = newCandidates.filter((c) => !excludedIds.has(c.id));

        // Les FERMÉ avec rapport soumis ne doivent pas être ré-injectées (cycle déjà terminé).
        const fermeCandidates = unexcluded.filter((c) => c.status === WhatsappChatStatus.FERME);
        let fermeEligible: typeof fermeCandidates = [];
        if (fermeCandidates.length > 0) {
          const fermeSubmittedMap = await this.reportService.getSubmittedMapBulk(
            fermeCandidates.map((c) => c.chat_id),
          );
          fermeEligible = fermeCandidates.filter((c) => !fermeSubmittedMap.get(c.chat_id));
        }
        const nonFerme = unexcluded.filter((c) => c.status !== WhatsappChatStatus.FERME);
        const toInject = [...nonFerme, ...fermeEligible].slice(0, slotsAvailable);
        injectChatIds.push(...toInject.map((c) => c.chat_id));
        const injectAssignments = toInject.map((chat, i) => {
          const newSlot = slotsUsed + i + 1;
          const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
          return { id: chat.id, slot: newSlot, status: newStatus, isLocked: newStatus === WindowStatus.LOCKED };
        });
        await this.batchUpdateSlots(injectAssignments);

        // Initialiser les validations pour les nouvelles actives (bulk)
        const newActiveChatIds = injectAssignments
          .filter((a) => a.status === WindowStatus.ACTIVE)
          .map((a) => toInject.find((c) => c.id === a.id)?.chat_id)
          .filter(Boolean) as string[];
        await this.validationEngine.initConversationValidationBulk(newActiveChatIds);

        this.logger.log(`${toInject.length} nouvelles conversations injectées pour poste ${posteId}`);
      }

      // Réinitialiser le statut de soumission des nouvelles entrées et des promotions
      // LOCKED→ACTIVE pour éviter qu'un ancien rapport déclenche la rotation du nouveau bloc.
      await this.reportService.resetSubmissionBulk([...injectChatIds, ...promotedChatIds]);

      this.logger.log(
        `Rotation complète poste ${posteId} — libérées: ${releasedChatIds.length}, promues: ${promotedChatIds.length}`,
      );

      // Créer le prochain batch d'obligations pour ce poste (non-bloquant)
      if (await this.obligationService?.isEnabled()) {
        this.obligationService.getOrCreateActiveBatch(posteId).catch((err) =>
          this.logger.warn(`Impossible de créer le batch d'obligations pour poste ${posteId}`, err),
        );
      }

      this.eventEmitter.emit(WINDOW_ROTATED_EVENT, {
        posteId,
        releasedChatIds,
        promotedChatIds,
      } satisfies WindowRotatedPayload);

      return { releasedChatIds, promotedChatIds };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Réassigne les slots consécutivement après une fermeture de conversation.
   * Compresse les trous dans la numérotation et injecte une nouvelle conversation si possible.
   */
  private async compactSlots(posteId: string): Promise<void> {
    const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

    const current = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.window_slot IS NOT NULL')
      .andWhere('c.window_status != :released', { released: WindowStatus.RELEASED })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.window_slot', 'ASC')
      .getMany();

    // Réassigner slots 1…N en batch.
    // Le statut de fenetre reste strictement ACTIVE/LOCKED/RELEASED.
    const toInit: string[] = [];
    const compactAssignments = current.map((chat, i) => {
      const newSlot = i + 1;
      const status = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
      const isLocked = status === WindowStatus.LOCKED;
      if (chat.window_status === WindowStatus.LOCKED && status === WindowStatus.ACTIVE) {
        toInit.push(chat.chat_id);
      }
      return { id: chat.id, slot: newSlot, status, isLocked };
    });
    await this.batchUpdateSlots(compactAssignments);
    await this.validationEngine.initConversationValidationBulk(toInit);

    // Injecter une nouvelle conversation si de la place est disponible
    const slotsUsed = current.length;
    const injectChatIds: string[] = [];
    if (slotsUsed < quotaTotal) {
      const existingIds = new Set(current.map((c) => c.id));
      // Convs non-RELEASED + toutes les FERME (même RELEASED par l'ancien code sans rapport).
      const rawCandidates = await this.chatRepo
        .createQueryBuilder('c')
        .where('c.poste_id = :posteId', { posteId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('c.is_priority = 0')
        .andWhere('(c.window_status IS NULL OR c.window_status != :released OR c.status = :ferme)', {
          released: WindowStatus.RELEASED,
          ferme: WhatsappChatStatus.FERME,
        })
        .orderBy('c.last_activity_at', 'DESC')
        .take(slotsUsed + 5)
        .getMany();

      const unexcluded = rawCandidates.filter((c) => !existingIds.has(c.id));

      // Les FERMÉ avec rapport soumis ne doivent pas être ré-injectées.
      const compactFerme = unexcluded.filter((c) => c.status === WhatsappChatStatus.FERME);
      let compactFermeEligible: typeof compactFerme = [];
      if (compactFerme.length > 0) {
        const compactFermeSubmittedMap = await this.reportService.getSubmittedMapBulk(
          compactFerme.map((c) => c.chat_id),
        );
        compactFermeEligible = compactFerme.filter((c) => !compactFermeSubmittedMap.get(c.chat_id));
      }
      const compactNonFerme = unexcluded.filter((c) => c.status !== WhatsappChatStatus.FERME);
      const toInject = [...compactNonFerme, ...compactFermeEligible].slice(0, quotaTotal - slotsUsed);
      injectChatIds.push(...toInject.map((c) => c.chat_id));
      const injectAssignments = toInject.map((chat, i) => {
        const newSlot = slotsUsed + i + 1;
        const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
        return { id: chat.id, slot: newSlot, status: newStatus, isLocked: newStatus === WindowStatus.LOCKED };
      });
      await this.batchUpdateSlots(injectAssignments);
      const compactActiveChatIds = injectAssignments
        .filter((a) => a.status === WindowStatus.ACTIVE)
        .map((a) => toInject.find((x) => x.id === a.id)?.chat_id)
        .filter(Boolean) as string[];
      await this.validationEngine.initConversationValidationBulk(compactActiveChatIds);

      if (toInject.length > 0) {
        this.logger.log(`${toInject.length} conversation(s) injectée(s) après compactage pour poste ${posteId}`);
      }
    }

    // Réinitialiser le statut de soumission des nouvelles entrées et des promotions
    // LOCKED→ACTIVE pour éviter qu'un ancien rapport déclenche la rotation du nouveau bloc.
    await this.reportService.resetSubmissionBulk([...injectChatIds, ...toInit]);
  }
}
