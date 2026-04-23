import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
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
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

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
  ) {}

  // ── Gestion du batch actif ──────────────────────────────────────────────

  async getOrCreateActiveBatch(posteId: string): Promise<CommercialObligationBatch> {
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

    // Créer 15 tâches vides (5 × 3 catégories)
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
    this.logger.log(`Batch #${batchNumber} créé pour poste ${posteId} — 15 tâches`);
    return batch;
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
    clientPhone: string;
    commercialPhone: string;
    callEventId: string;
    durationSeconds: number | null;
    posteId?: string | null;
  }): Promise<{ matched: boolean; taskId?: string; reason?: string }> {

    // 1. Vérifier la durée minimale
    if (!params.durationSeconds || params.durationSeconds < MIN_CALL_DURATION_SECONDS) {
      return { matched: false, reason: `durée_insuffisante (${params.durationSeconds ?? 0}s < ${MIN_CALL_DURATION_SECONDS}s)` };
    }

    // 2. Résoudre le poste
    const posteId = params.posteId ?? await this.resolvePosteByCommercialPhone(params.commercialPhone);
    if (!posteId) {
      return { matched: false, reason: 'poste_introuvable' };
    }

    // 3. Trouver la catégorie du contact
    const taskCategory = await this.resolveContactCategory(params.clientPhone);
    if (!taskCategory) {
      return { matched: false, reason: 'categorie_contact_inconnue' };
    }

    // 4. Trouver le batch actif
    const batch = await this.getActiveBatch(posteId);
    if (!batch) {
      return { matched: false, reason: 'aucun_batch_actif' };
    }

    // 5. Trouver une tâche PENDING de cette catégorie
    const task = await this.taskRepo.findOne({
      where: { batchId: batch.id, category: taskCategory, status: CallTaskStatus.PENDING },
    });
    if (!task) {
      return { matched: false, reason: `quota_${taskCategory}_atteint` };
    }

    // 6. Valider la tâche
    task.status = CallTaskStatus.DONE;
    task.clientPhone = params.clientPhone;
    task.callEventId = params.callEventId;
    task.durationSeconds = params.durationSeconds;
    task.completedAt = new Date();
    await this.taskRepo.save(task);

    // 7. Mettre à jour le compteur du batch
    const counterField = this.batchCounterField(taskCategory);
    batch[counterField] = (batch[counterField] as number) + 1;

    // 8. Vérifier si le batch est complet
    if (
      batch.annuleeDone >= REQUIRED_PER_CATEGORY &&
      batch.livreeDone >= REQUIRED_PER_CATEGORY &&
      batch.sansCommandeDone >= REQUIRED_PER_CATEGORY
    ) {
      batch.status = BatchStatus.COMPLETE;
      batch.completedAt = new Date();
      this.logger.log(`Batch #${batch.batchNumber} COMPLÉTÉ pour poste ${posteId}`);
    }
    await this.batchRepo.save(batch);

    this.logger.log(
      `Tâche validée: poste=${posteId} catégorie=${taskCategory} durée=${params.durationSeconds}s (batch #${batch.batchNumber})`,
    );
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

    this.logger.log(`Contrôle qualité poste ${posteId} : ${passed ? 'PASSÉ' : 'ÉCHOUÉ'}`);
    return passed;
  }

  // ── Statut et rotation ───────────────────────────────────────────────────

  async getStatus(posteId: string): Promise<ObligationStatus | null> {
    const batch = await this.getActiveBatch(posteId);
    if (!batch) return null;

    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      annulee:      { done: batch.annuleeDone,      required: REQUIRED_PER_CATEGORY },
      livree:       { done: batch.livreeDone,        required: REQUIRED_PER_CATEGORY },
      sansCommande: { done: batch.sansCommandeDone,  required: REQUIRED_PER_CATEGORY },
      qualityCheckPassed: batch.qualityCheckPassed,
      readyForRotation: this.isBatchReady(batch),
    };
  }

  // ── Postes avec batch actif ──────────────────────────────────────────────

  async getActivePosteIds(): Promise<string[]> {
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

  // ── Contrôle qualité à la demande ────────────────────────────────────────

  async runQualityCheck(posteId: string): Promise<boolean> {
    const activeConvs = await this.chatRepo.find({
      where: { poste_id: posteId, status: WhatsappChatStatus.ACTIF },
      select: ['id', 'last_client_message_at', 'last_poste_message_at'],
    });
    return this.checkAndRecordQuality(posteId, activeConvs);
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
}
