import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { DistributedLockService } from 'src/redis/distributed-lock.service';
import { v4 as uuidv4 } from 'uuid';
import { SystemConfigService } from 'src/system-config/system-config.service';
import {
  CommercialObligationBatch,
  BatchStatus,
} from './entities/commercial-obligation-batch.entity';
import {
  CallTask,
  CallTaskCategory,
  CallTaskStatus,
} from './entities/call-task.entity';
import { Contact, ClientCategory } from 'src/contact/entities/contact.entity';
import { WhatsappChat, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';

const REQUIRED_PER_CATEGORY = 5;
const MIN_CALL_DURATION_SECONDS = 90;

/** Map ClientCategory → CallTaskCategory */
const CATEGORY_MAP: Partial<Record<ClientCategory, CallTaskCategory>> = {
  [ClientCategory.COMMANDE_ANNULEE]:        CallTaskCategory.COMMANDE_ANNULEE,
  [ClientCategory.COMMANDE_AVEC_LIVRAISON]: CallTaskCategory.COMMANDE_AVEC_LIVRAISON,
  [ClientCategory.JAMAIS_COMMANDE]:         CallTaskCategory.JAMAIS_COMMANDE,
  // COMMANDE_SANS_LIVRAISON → même bucket que JAMAIS_COMMANDE (venu sans commande livrée)
  [ClientCategory.COMMANDE_SANS_LIVRAISON]: CallTaskCategory.JAMAIS_COMMANDE,
};

export interface ObligationStatus {
  batchId: string;
  batchNumber: number;
  status: BatchStatus;
  annulee:      { done: number; required: number };
  livree:       { done: number; required: number };
  sansCommande: { done: number; required: number };
  qualityCheckPassed: boolean;
  readyForRotation: boolean;
}

@Injectable()
export class CallObligationService {
  private readonly logger = new Logger(CallObligationService.name);

  constructor(
    @InjectRepository(CommercialObligationBatch)
    private readonly batchRepo: Repository<CommercialObligationBatch>,

    @InjectRepository(CallTask)
    private readonly taskRepo: Repository<CallTask>,

    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepo: Repository<WhatsappPoste>,

    @InjectRepository(ClientIdentityMapping)
    private readonly clientMappingRepo: Repository<ClientIdentityMapping>,

    @InjectRepository(CommercialIdentityMapping)
    private readonly commercialMappingRepo: Repository<CommercialIdentityMapping>,

    private readonly systemConfig: SystemConfigService,

    @Optional()
    private readonly lockService: DistributedLockService | null = null,
  ) {}

  // ── Feature flag ─────────────────────────────────────────────────────────

  async isEnabled(): Promise<boolean> {
    const val = await this.systemConfig.get('FF_CALL_OBLIGATIONS_ENABLED');
    return val === 'true';
  }

  // ── Gestion du batch actif ──────────────────────────────────────────────

  async getOrCreateActiveBatch(posteId: string): Promise<CommercialObligationBatch> {
    // OBL-010 — Lock distribué pour éviter deux créations simultanées sur le même poste
    const doCreate = async (): Promise<CommercialObligationBatch> => {
      const existing = await this.batchRepo.findOne({
        where: { posteId, status: BatchStatus.PENDING },
      });
      if (existing) return existing;

      const lastBatch = await this.batchRepo.findOne({
        where: { posteId },
        order: { batchNumber: 'DESC' },
      });

      const batchNumber = (lastBatch?.batchNumber ?? 0) + 1;

      const batch = await this.batchRepo.save(
        this.batchRepo.create({
          id: uuidv4(),
          posteId,
          batchNumber,
          status: BatchStatus.PENDING,
        }),
      );

      const tasks: Partial<CallTask>[] = [
        ...Array(REQUIRED_PER_CATEGORY).fill(null).map(() => ({
          id: uuidv4(), batchId: batch.id, posteId,
          category: CallTaskCategory.COMMANDE_ANNULEE,
          status: CallTaskStatus.PENDING,
        })),
        ...Array(REQUIRED_PER_CATEGORY).fill(null).map(() => ({
          id: uuidv4(), batchId: batch.id, posteId,
          category: CallTaskCategory.COMMANDE_AVEC_LIVRAISON,
          status: CallTaskStatus.PENDING,
        })),
        ...Array(REQUIRED_PER_CATEGORY).fill(null).map(() => ({
          id: uuidv4(), batchId: batch.id, posteId,
          category: CallTaskCategory.JAMAIS_COMMANDE,
          status: CallTaskStatus.PENDING,
        })),
      ];

      await this.taskRepo.save(tasks as CallTask[]);
      this.logger.log(`CALL_OBLIGATION_BATCH_CREATED posteId=${posteId} batchId=${batch.id} batchNumber=${batchNumber} tasks=15`);
      return batch;
    };

    if (this.lockService) {
      const { acquired, result } = await this.lockService.tryWithLock(
        `call-obligation-batch:${posteId}`,
        10_000,
        doCreate,
      );
      if (acquired && result) return result;
      // Lock non acquis → un autre processus crée le batch : on relit
      return (await this.batchRepo.findOne({ where: { posteId, status: BatchStatus.PENDING } }))
        ?? (await doCreate());
    }

    return doCreate();
  }

  async getActiveBatch(posteId: string): Promise<CommercialObligationBatch | null> {
    return this.batchRepo.findOne({ where: { posteId, status: BatchStatus.PENDING } });
  }

  // ── Correspondance appel → tâche ────────────────────────────────────────

  /**
   * Tente de valider une tâche d'appel à partir d'un événement GICOP.
   * Conditions :
   *   - durée ≥ 90 secondes
   *   - le contact a une catégorie mappée à une tâche ouverte
   *   - il reste une tâche PENDING de cette catégorie dans le batch actif
   */
  async tryMatchCallToTask(params: {
    callEventId: string;
    durationSeconds: number | null;
    /** Catégorie déjà résolue en amont (bypasse toute résolution client). */
    resolvedCategory?: CallTaskCategory | null;
    /** Résolution directe via DB2 (prioritaire). */
    idCommercialDb2?: number | null;
    idClientDb2?: number | null;
    /** Fallback par téléphone quand les IDs DB2 ne sont pas disponibles. */
    clientPhone?: string;
    commercialPhone?: string;
    posteId?: string | null;
  }): Promise<{ matched: boolean; taskId?: string; reason?: string }> {

    if (!await this.isEnabled()) {
      return { matched: false, reason: 'feature_disabled' };
    }

    // 1. Vérifier la durée minimale
    if (!params.durationSeconds || params.durationSeconds < MIN_CALL_DURATION_SECONDS) {
      this.logger.log(`CALL_OBLIGATION_REJECTED callEventId=${params.callEventId} reason=duree_insuffisante duration=${params.durationSeconds ?? 0}s`);
      return { matched: false, reason: 'duree_insuffisante' };
    }

    // 2. Résoudre le poste — ID DB2 si mapping dispo, sinon fallback téléphone
    let posteId = params.posteId ?? null;
    if (!posteId && params.idCommercialDb2 != null) {
      posteId = await this.resolvePosteByCommercialId(params.idCommercialDb2);
    }
    if (!posteId && params.commercialPhone) {
      posteId = await this.resolvePosteByCommercialPhone(params.commercialPhone);
    }
    if (!posteId) {
      this.logger.log(`CALL_OBLIGATION_REJECTED callEventId=${params.callEventId} reason=poste_introuvable`);
      return { matched: false, reason: 'poste_introuvable' };
    }

    // 3. Trouver la catégorie du contact
    // Priorité : catégorie résolue en amont (DB2 commandes) > ID DB2 mapping > téléphone DB1
    let taskCategory: CallTaskCategory | null = params.resolvedCategory ?? null;
    if (!taskCategory && params.idClientDb2 != null) {
      taskCategory = await this.resolveContactCategoryById(params.idClientDb2);
    }
    if (!taskCategory && params.clientPhone) {
      taskCategory = await this.resolveContactCategory(params.clientPhone);
    }
    // Client non identifié → bucket JAMAIS_COMMANDE par défaut
    if (!taskCategory) {
      taskCategory = CallTaskCategory.JAMAIS_COMMANDE;
    }

    // 4. Trouver le batch actif
    const batch = await this.getActiveBatch(posteId);
    if (!batch) {
      this.logger.log(`CALL_OBLIGATION_REJECTED callEventId=${params.callEventId} posteId=${posteId} reason=aucun_batch_actif`);
      return { matched: false, reason: 'aucun_batch_actif' };
    }

    // 4b. OBL-008 — Idempotence : vérifier que cet appel n'a pas déjà validé une tâche
    const alreadyUsed = await this.taskRepo.findOne({
      where: { batchId: batch.id, callEventId: params.callEventId },
    });
    if (alreadyUsed) {
      this.logger.log(`CALL_OBLIGATION_REJECTED callEventId=${params.callEventId} posteId=${posteId} batchId=${batch.id} reason=appel_deja_traite`);
      return { matched: false, reason: 'appel_deja_traite' };
    }

    // 5. Trouver une tâche PENDING de cette catégorie
    const task = await this.taskRepo.findOne({
      where: { batchId: batch.id, category: taskCategory, status: CallTaskStatus.PENDING },
    });
    if (!task) {
      this.logger.log(`CALL_OBLIGATION_REJECTED callEventId=${params.callEventId} posteId=${posteId} batchId=${batch.id} reason=quota_categorie_atteint category=${taskCategory}`);
      return { matched: false, reason: 'quota_categorie_atteint' };
    }

    // 6. Valider la tâche
    task.status = CallTaskStatus.DONE;
    task.clientPhone = params.clientPhone ?? null;
    task.callEventId = params.callEventId;
    task.durationSeconds = params.durationSeconds;
    task.completedAt = new Date();
    await this.taskRepo.save(task);

    // 7. Mettre à jour le compteur du batch
    const counterField = this.batchCounterField(taskCategory);
    batch[counterField] = (batch[counterField] as number) + 1;

    // 8. Vérifier si le batch est complet
    const callsComplete =
      batch.annuleeDone >= REQUIRED_PER_CATEGORY &&
      batch.livreeDone >= REQUIRED_PER_CATEGORY &&
      batch.sansCommandeDone >= REQUIRED_PER_CATEGORY;

    if (callsComplete) {
      batch.status = BatchStatus.COMPLETE;
      batch.completedAt = new Date();
      this.logger.log(`CALL_OBLIGATION_BATCH_CALLS_COMPLETE posteId=${posteId} batchId=${batch.id} batchNumber=${batch.batchNumber}`);
    }
    await this.batchRepo.save(batch);

    this.logger.log(`CALL_OBLIGATION_MATCHED callEventId=${params.callEventId} posteId=${posteId} batchId=${batch.id} batchNumber=${batch.batchNumber} category=${taskCategory} durationSeconds=${params.durationSeconds}`);
    return { matched: true, taskId: task.id };
  }

  // ── Contrôle qualité messages ────────────────────────────────────────────

  /**
   * Vérifie que le commercial a le dernier message sur chaque conversation active.
   * last_poste_message_at doit être ≥ last_client_message_at.
   */
  async checkAndRecordQuality(posteId: string, activeConvs: WhatsappChat[]): Promise<boolean> {
    const passed = activeConvs.every((c) => {
      if (!c.last_client_message_at) return true;
      if (!c.last_poste_message_at) return false;
      return c.last_poste_message_at >= c.last_client_message_at;
    });

    const batch = await this.getActiveBatch(posteId);
    if (batch) {
      batch.qualityCheckPassed = passed;
      await this.batchRepo.save(batch);
    }

    this.logger.log(`${passed ? 'CALL_OBLIGATION_QUALITY_PASSED' : 'CALL_OBLIGATION_QUALITY_FAILED'} posteId=${posteId} blockSize=${activeConvs.length}`);
    return passed;
  }

  // ── Statut et rotation ───────────────────────────────────────────────────

  async getStatus(posteId: string): Promise<ObligationStatus | null> {
    const batch = await this.getActiveBatch(posteId);
    if (!batch) return null;

    const readyForRotation = this.isBatchReady(batch);
    if (readyForRotation) {
      this.logger.log(`CALL_OBLIGATION_READY_FOR_ROTATION posteId=${posteId} batchId=${batch.id} batchNumber=${batch.batchNumber}`);
    }
    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      annulee:      { done: batch.annuleeDone,      required: REQUIRED_PER_CATEGORY },
      livree:       { done: batch.livreeDone,        required: REQUIRED_PER_CATEGORY },
      sansCommande: { done: batch.sansCommandeDone,  required: REQUIRED_PER_CATEGORY },
      qualityCheckPassed: batch.qualityCheckPassed,
      readyForRotation,
    };
  }

  // ── Détail tâches par poste ──────────────────────────────────────────────

  async getTasksByPoste(posteId: string): Promise<{
    batchId: string | null;
    batchNumber: number | null;
    tasks: CallTask[];
  }> {
    const batch = await this.getActiveBatch(posteId);
    if (!batch) return { batchId: null, batchNumber: null, tasks: [] };

    const tasks = await this.taskRepo.find({
      where: { batchId: batch.id },
      order: { category: 'ASC', status: 'ASC' },
    });
    return { batchId: batch.id, batchNumber: batch.batchNumber, tasks };
  }

  // ── Postes avec batch actif ──────────────────────────────────────────────

  async getActivePosteIds(): Promise<string[]> {
    if (!await this.isEnabled()) return [];
    const batches = await this.batchRepo.find({
      where: { status: BatchStatus.PENDING },
      select: ['posteId'],
    });
    return [...new Set(batches.map((b) => b.posteId))];
  }

  // ── Initialisation batch pour tous les postes ────────────────────────────

  async initAllBatches(): Promise<{ created: number; alreadyActive: number }> {
    const postes = await this.posteRepo.find({ select: ['id'] });
    let created = 0;
    let alreadyActive = 0;
    for (const poste of postes) {
      const active = await this.getActiveBatch(poste.id);
      if (active) { alreadyActive++; continue; }
      await this.getOrCreateActiveBatch(poste.id);
      created++;
    }
    this.logger.log(`initAllBatches — créés: ${created}, déjà actifs: ${alreadyActive}`);
    return { created, alreadyActive };
  }

  // ── Bloc actif ───────────────────────────────────────────────────────────

  /**
   * OBL-001 — Retourne uniquement les conversations du bloc actif courant.
   * Seules les conversations window_status=ACTIVE (premier bloc) comptent pour
   * le contrôle qualité — les conversations LOCKED sont hors scope.
   */
  async getActiveBlockConversations(posteId: string): Promise<WhatsappChat[]> {
    return this.chatRepo.find({
      where: {
        poste_id:      posteId,
        window_status: WindowStatus.ACTIVE,
        window_slot:   Not(IsNull()),
      },
      select: ['id', 'last_client_message_at', 'last_poste_message_at'],
      order:  { window_slot: 'ASC' },
    });
  }

  // ── Contrôle qualité à la demande ────────────────────────────────────────

  /**
   * OBL-002 — Contrôle qualité limité au bloc actif (10 conversations ACTIVE).
   * N'évalue plus toutes les conversations actives du poste.
   */
  async runQualityCheck(posteId: string): Promise<boolean> {
    const blockConvs = await this.getActiveBlockConversations(posteId);
    return this.checkAndRecordQuality(posteId, blockConvs);
  }

  isReadyForRotation(batch: CommercialObligationBatch): boolean {
    return this.isBatchReady(batch);
  }

  async isPosteReadyForRotation(posteId: string): Promise<boolean> {
    const batch = await this.getActiveBatch(posteId);
    if (!batch) return true; // Pas de batch actif → pas de blocage
    return this.isBatchReady(batch);
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private isBatchReady(batch: CommercialObligationBatch): boolean {
    return (
      batch.annuleeDone >= REQUIRED_PER_CATEGORY &&
      batch.livreeDone >= REQUIRED_PER_CATEGORY &&
      batch.sansCommandeDone >= REQUIRED_PER_CATEGORY &&
      batch.qualityCheckPassed
    );
  }

  private batchCounterField(
    category: CallTaskCategory,
  ): 'annuleeDone' | 'livreeDone' | 'sansCommandeDone' {
    switch (category) {
      case CallTaskCategory.COMMANDE_ANNULEE:        return 'annuleeDone';
      case CallTaskCategory.COMMANDE_AVEC_LIVRAISON: return 'livreeDone';
      case CallTaskCategory.JAMAIS_COMMANDE:         return 'sansCommandeDone';
    }
  }

  private async resolveContactCategory(clientPhone: string): Promise<CallTaskCategory | null> {
    const normalized = clientPhone.replace(/\D/g, '');
    const contact = await this.contactRepo.findOne({
      where: { phone: normalized },
      select: ['client_category'],
    });
    if (!contact?.client_category) return null;
    return CATEGORY_MAP[contact.client_category] ?? null;
  }

  private async resolvePosteByCommercialPhone(phone: string): Promise<string | null> {
    const normalized = phone.replace(/\D/g, '');
    const commercial = await this.commercialRepo.findOne({
      where: { phone: normalized },
      relations: { poste: true },
    });
    return commercial?.poste?.id ?? null;
  }

  private async resolvePosteByCommercialId(idCommercialDb2: number): Promise<string | null> {
    const mapping = await this.commercialMappingRepo.findOne({
      where: { external_id: idCommercialDb2 },
      select: ['commercial_id'],
    });
    if (!mapping) return null;
    const commercial = await this.commercialRepo.findOne({
      where: { id: mapping.commercial_id },
      relations: { poste: true },
    });
    return commercial?.poste?.id ?? null;
  }

  private async resolveContactCategoryById(idClientDb2: number): Promise<CallTaskCategory | null> {
    const mapping = await this.clientMappingRepo.findOne({
      where: { external_id: idClientDb2 },
      select: ['contact_id'],
    });
    if (!mapping) return null;
    const contact = await this.contactRepo.findOne({
      where: { id: mapping.contact_id },
      select: ['client_category'],
    });
    if (!contact?.client_category) return null;
    return CATEGORY_MAP[contact.client_category] ?? null;
  }
}
