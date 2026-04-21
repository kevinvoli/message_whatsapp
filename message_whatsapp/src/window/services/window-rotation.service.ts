import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { WhatsappChat, WindowStatus, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationCapacityService } from 'src/conversation-capacity/conversation-capacity.service';
import { ValidationEngineService } from './validation-engine.service';

export const WINDOW_ROTATED_EVENT         = 'window.rotated';
export const WINDOW_CRITERION_VALIDATED_EVENT = 'window.criterion_validated';

export interface WindowRotatedPayload {
  posteId: string;
  releasedChatIds: string[];
  promotedChatIds: string[];
}

export interface WindowCriterionValidatedPayload {
  posteId: string;
  chatId?: string;
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
    const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

    // 1. Libérer les slots des conversations fermées (auto-close cron ou fermeture directe)
    await this.releaseSlotsOfClosedConversations(posteId);

    // 2. Lire les conversations slottées restantes (non fermées, non released)
    const slottedChats = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.window_slot IS NOT NULL')
      .andWhere('c.window_status != :released', { released: WindowStatus.RELEASED })
      .andWhere('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.window_slot', 'ASC')
      .getMany();

    const needed = quotaTotal - slottedChats.length;
    if (needed <= 0) {
      this.logger.log(`Fenêtre complète pour poste ${posteId} (${slottedChats.length} slots actifs)`);
      return;
    }

    const slottedIds = new Set(slottedChats.map((c) => c.id));

    // 3. Candidats non encore slottés
    const unslotted = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
      .orderBy('c.last_activity_at', 'DESC')
      .take(needed + slottedChats.length + 5)
      .getMany();

    const candidates = unslotted.filter((c) => !slottedIds.has(c.id)).slice(0, needed);

    if (candidates.length === 0 && slottedChats.length > 0) {
      this.logger.log(`Fenêtre stable pour poste ${posteId} (${slottedChats.length} slots, aucun nouveau candidat)`);
      return;
    }

    // 4. Réassigner les slots 1…N pour tous (existants + nouveaux), en batch
    const all = [...slottedChats, ...candidates];
    const toInit: string[] = [];

    // Calculer les valeurs cibles pour chaque conversation
    const assignments = all.map((chat, i) => {
      const slot = i + 1;
      const status = slot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
      const isLocked = status === WindowStatus.LOCKED;
      const wasActive = chat.window_status === WindowStatus.ACTIVE;
      if (status === WindowStatus.ACTIVE && !wasActive) toInit.push(chat.chat_id);
      return { id: chat.id, slot, status, isLocked };
    });

    // Un seul UPDATE par groupe de statut (évite N aller-retours DB)
    await this.batchUpdateSlots(assignments);

    // Initialiser les validations pour les nouvelles conversations actives (bulk)
    await this.validationEngine.initConversationValidationBulk(toInit);

    this.logger.log(
      `Fenêtre construite pour poste ${posteId} : ${slottedChats.length} existantes + ${candidates.length} nouvelles (total ${all.length})`,
    );
  }

  /**
   * Libère les slots des conversations fermées (status=fermé) qui ont encore un slot assigné.
   * Gère le cas de l'auto-fermeture par cron sans événement.
   */
  private async releaseSlotsOfClosedConversations(posteId: string): Promise<void> {
    const closedWithSlot = await this.chatRepo
      .createQueryBuilder('c')
      .select('c.id')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.window_slot IS NOT NULL')
      .andWhere('c.status = :ferme', { ferme: WhatsappChatStatus.FERME })
      .getMany();

    if (closedWithSlot.length === 0) return;

    // Un seul UPDATE pour tous les slots à libérer
    const ids = closedWithSlot.map((c) => c.id);
    await this.chatRepo
      .createQueryBuilder()
      .update()
      .set({ window_slot: null as any, window_status: WindowStatus.RELEASED, is_locked: false })
      .whereInIds(ids)
      .execute();

    this.logger.log(`${ids.length} slot(s) libéré(s) (conversations fermées) pour poste ${posteId}`);
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

    // Mode glissant : moteur de validation + rotation éventuelle
    const allRequiredMet = await this.validationEngine.onConversationResultSet(payload.chatId);

    if (allRequiredMet) {
      await this.onConversationValidated(payload.chatId, payload.posteId);
    }

    this.eventEmitter.emit(WINDOW_CRITERION_VALIDATED_EVENT, {
      posteId: payload.posteId,
      chatId: payload.chatId,
    } satisfies WindowCriterionValidatedPayload);
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
   * Libère son slot et réinjecte une conversation en fin de fenêtre.
   */
  @OnEvent('conversation.status_changed', { async: true })
  async handleConversationStatusChanged(payload: {
    chatId: string;
    newStatus: string;
  }): Promise<void> {
    if (payload.newStatus !== 'fermé') return;

    const chat = await this.chatRepo.findOne({ where: { chat_id: payload.chatId } });
    if (!chat?.poste_id || chat.window_slot == null) return;

    const posteId = chat.poste_id;
    const releasedSlot = chat.window_slot;

    // Libère le slot
    await this.chatRepo.update(
      { id: chat.id },
      { window_slot: null, window_status: WindowStatus.RELEASED, is_locked: false },
    );
    this.logger.log(`Slot ${releasedSlot} libéré (conv ${payload.chatId} fermée) pour poste ${posteId}`);

    // Réassigne les slots pour compresser le vide
    await this.compactSlots(posteId);
  }

  /**
   * Appelé quand une conversation passe à l'état "validé".
   * Met à jour window_status et vérifie si la rotation est possible.
   */
  async onConversationValidated(chatId: string, posteId: string): Promise<void> {
    const chat = await this.chatRepo.findOne({ where: { chat_id: chatId, poste_id: posteId } });
    if (!chat || chat.window_status !== WindowStatus.ACTIVE) return;

    await this.chatRepo.update({ id: chat.id }, { window_status: WindowStatus.VALIDATED });
    this.logger.log(`Conv ${chatId} marquée VALIDATED dans la fenêtre du poste ${posteId}`);

    await this.checkAndTriggerRotation(posteId);
  }

  /**
   * Vérifie si toutes les conversations actives sont validées.
   * Si oui, déclenche la rotation.
   */
  async checkAndTriggerRotation(posteId: string): Promise<void> {
    if (this.rotatingPostes.has(posteId)) return;

    const modeEnabled = await this.capacityService.isWindowModeEnabled();
    if (!modeEnabled) return;

    const [{ quotaActive }, rawThreshold] = await Promise.all([
      this.capacityService.getQuotas(),
      this.capacityService.getValidationThreshold(),
    ]);

    const activeGroup = await this.chatRepo.find({
      where: {
        poste_id: posteId,
        window_status: In([WindowStatus.ACTIVE, WindowStatus.VALIDATED]),
      },
      order: { window_slot: 'ASC' },
    });

    if (activeGroup.length === 0) return;

    const validatedCount = activeGroup.filter((c) => c.window_status === WindowStatus.VALIDATED).length;

    // Seuil de déclenchement : 0 = toutes requises, sinon valeur absolue configurée
    const requiredCount = rawThreshold > 0
      ? Math.min(rawThreshold, activeGroup.length)
      : activeGroup.length;

    if (validatedCount < requiredCount) return;

    // Tolérance minimum si le poste a peu de conversations
    if (activeGroup.length < quotaActive && activeGroup.length < 3) return;

    this.logger.log(
      `Rotation déclenchée pour poste ${posteId} (${validatedCount}/${activeGroup.length} validées, seuil: ${requiredCount})`,
    );
    await this.performRotation(posteId);
  }

  /**
   * Effectue la rotation complète du bloc :
   * 1. Retire les conversations validées (released)
   * 2. Promeut les 10 premières verrouillées en actives
   * 3. Injecte de nouvelles conversations en fin de fenêtre
   * 4. Émet l'événement de rotation
   */
  async performRotation(posteId: string): Promise<{ releasedChatIds: string[]; promotedChatIds: string[] }> {
    this.rotatingPostes.add(posteId);
    try {
      const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

      // 1. Conversations validées à libérer
      const validated = await this.chatRepo.find({
        where: { poste_id: posteId, window_status: WindowStatus.VALIDATED },
        order: { window_slot: 'ASC' },
      });

      // 1. Libérer les conversations validées en un seul UPDATE
      const releasedChatIds = validated.map((c) => c.chat_id);
      await this.batchRelease(validated.map((c) => c.id));

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

      if (slotsAvailable > 0) {
        const excludedIds = new Set([
          ...remaining.map((c) => c.id),
          ...validated.map((c) => c.id),
        ]);

        const newCandidates = await this.chatRepo.find({
          where: {
            poste_id: posteId,
            deletedAt: IsNull(),
            status: Not(In([WhatsappChatStatus.FERME])),
          },
          order: { last_activity_at: 'DESC' },
          take: slotsAvailable + validated.length,
        });

        const toInject = newCandidates.filter((c) => !excludedIds.has(c.id)).slice(0, slotsAvailable);
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

      this.logger.log(
        `Rotation complète poste ${posteId} — libérées: ${releasedChatIds.length}, promues: ${promotedChatIds.length}`,
      );

      this.eventEmitter.emit(WINDOW_ROTATED_EVENT, {
        posteId,
        releasedChatIds,
        promotedChatIds,
      } satisfies WindowRotatedPayload);

      return { releasedChatIds, promotedChatIds };
    } finally {
      this.rotatingPostes.delete(posteId);
    }
  }

  /**
   * Réassigne les slots consécutivement après une fermeture de conversation.
   * Compresse les trous dans la numérotation et injecte une nouvelle conversation si possible.
   */
  private async compactSlots(posteId: string): Promise<void> {
    const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

    // Libérer d'abord les fermées
    await this.releaseSlotsOfClosedConversations(posteId);

    const current = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.window_slot IS NOT NULL')
      .andWhere('c.window_status != :released', { released: WindowStatus.RELEASED })
      .andWhere('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.window_slot', 'ASC')
      .getMany();

    // Réassigner slots 1…N en batch
    const toInit: string[] = [];
    const compactAssignments = current.map((chat, i) => {
      const newSlot = i + 1;
      const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
      if (chat.window_status === WindowStatus.LOCKED && newStatus === WindowStatus.ACTIVE) {
        toInit.push(chat.chat_id);
      }
      return { id: chat.id, slot: newSlot, status: newStatus, isLocked: newStatus === WindowStatus.LOCKED };
    });
    await this.batchUpdateSlots(compactAssignments);
    await this.validationEngine.initConversationValidationBulk(toInit);

    // Injecter une nouvelle conversation si de la place est disponible
    const slotsUsed = current.length;
    if (slotsUsed < quotaTotal) {
      const existingIds = new Set(current.map((c) => c.id));
      const candidates = await this.chatRepo.find({
        where: {
          poste_id: posteId,
          deletedAt: IsNull(),
          status: Not(In([WhatsappChatStatus.FERME])),
        },
        order: { last_activity_at: 'DESC' },
        take: slotsUsed + 5,
      });

      const toInject = candidates.filter((c) => !existingIds.has(c.id)).slice(0, quotaTotal - slotsUsed);
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
  }
}
