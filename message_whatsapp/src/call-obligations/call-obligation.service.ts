import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
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
import { normalizePhone } from 'src/shared/utils/normalize-phone';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationReportService } from 'src/gicop-report/conversation-report.service';

const REQUIRED_PER_CATEGORY = 5;
const MIN_CALL_DURATION_SECONDS = 90;

/** Map ClientCategory -> CallTaskCategory */
const CATEGORY_MAP: Partial<Record<ClientCategory, CallTaskCategory>> = {
  [ClientCategory.COMMANDE_ANNULEE]:        CallTaskCategory.COMMANDE_ANNULEE,
  [ClientCategory.COMMANDE_AVEC_LIVRAISON]: CallTaskCategory.COMMANDE_AVEC_LIVRAISON,
  [ClientCategory.JAMAIS_COMMANDE]:         CallTaskCategory.JAMAIS_COMMANDE,
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
  reportsRequired: number;
  reportsSubmitted: number;
  calledPhones: string[];
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

    private readonly systemConfig: SystemConfigService,

    @Optional()
    private readonly lockService: DistributedLockService | null = null,

    @Optional()
    private readonly conversationReportService: ConversationReportService | null = null,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  async isEnabled(): Promise<boolean> {
    const val = await this.systemConfig.get('FF_CALL_OBLIGATIONS_ENABLED');
    return val === 'true';
  }

  async getOrCreateActiveBatch(posteId: string): Promise<CommercialObligationBatch> {
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
      // FIX-C2: Protection race condition — catch ER_DUP_ENTRY si deux processus créent simultanément
      let batch: CommercialObligationBatch;
      try {
        batch = await this.batchRepo.save(
          this.batchRepo.create({
            id: uuidv4(),
            posteId,
            batchNumber,
            status: BatchStatus.PENDING,
          }),
        );
      } catch (insertErr: any) {
        if (insertErr?.code === 'ER_DUP_ENTRY') {
          // Un autre processus a cree le batch en meme temps
          this.logger.warn('FIX-C2: ER_DUP_ENTRY batch posteId=' + posteId + ' — recuperation batch existant');
          const found = await this.batchRepo.findOne({ where: { posteId, status: BatchStatus.PENDING } });
          if (found) return found;
        }
        throw insertErr;
      }

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
      this.logger.log('CALL_OBLIGATION_BATCH_CREATED posteId=' + posteId + ' batchId=' + batch.id + ' batchNumber=' + batchNumber + ' tasks=15');
      return batch;
    };

    if (this.lockService) {
      const { acquired, result } = await this.lockService.tryWithLock(
        'call-obligation-batch:' + posteId,
        10_000,
        doCreate,
      );
      if (acquired && result) return result;
      return (await this.batchRepo.findOne({ where: { posteId, status: BatchStatus.PENDING } }))
        ?? (await doCreate());
    }

    return doCreate();
  }

  async getActiveBatch(posteId: string): Promise<CommercialObligationBatch | null> {
    const pending = await this.batchRepo.findOne({ where: { posteId, status: BatchStatus.PENDING } });
    if (pending) return pending;
    return this.batchRepo.findOne({
      where: { posteId, status: BatchStatus.COMPLETE },
      order: { batchNumber: 'DESC' },
    });
  }

  async tryMatchCallToTask(params: {
    callEventId: string;
    durationSeconds: number | null;
    resolvedCategory?: CallTaskCategory | null;
    clientPhone?: string;
    commercialPhone?: string;
    posteId?: string | null;
    skipDurationCheck?: boolean;
  }): Promise<{ matched: boolean; taskId?: string; reason?: string }> {

    if (!await this.isEnabled()) {
      return { matched: false, reason: 'feature_disabled' };
    }

    if (!params.skipDurationCheck && (!params.durationSeconds || params.durationSeconds < MIN_CALL_DURATION_SECONDS)) {
      this.logger.log('CALL_OBLIGATION_REJECTED callEventId=' + params.callEventId + ' reason=duree_insuffisante duration=' + (params.durationSeconds ?? 0) + 's');
      return { matched: false, reason: 'duree_insuffisante' };
    }

    let posteId = params.posteId ?? null;
    if (!posteId && params.commercialPhone) {
      posteId = await this.resolvePosteByCommercialPhone(params.commercialPhone);
    }
    if (!posteId) {
      this.logger.log('CALL_OBLIGATION_REJECTED callEventId=' + params.callEventId + ' reason=poste_introuvable');
      return { matched: false, reason: 'poste_introuvable' };
    }

    let taskCategory: CallTaskCategory | null = params.resolvedCategory ?? null;
    if (!taskCategory && params.clientPhone) {
      taskCategory = await this.resolveContactCategory(params.clientPhone);
    }
    if (!taskCategory) {
      taskCategory = CallTaskCategory.JAMAIS_COMMANDE;
    }

    const batch = await this.batchRepo.findOne({ where: { posteId, status: BatchStatus.PENDING } });
    if (!batch) {
      this.logger.log('CALL_OBLIGATION_REJECTED callEventId=' + params.callEventId + ' posteId=' + posteId + ' reason=aucun_batch_actif');
      return { matched: false, reason: 'aucun_batch_actif' };
    }

    const alreadyUsed = await this.taskRepo.findOne({
      where: { batchId: batch.id, callEventId: params.callEventId },
    });
    if (alreadyUsed) {
      this.logger.log('CALL_OBLIGATION_REJECTED callEventId=' + params.callEventId + ' posteId=' + posteId + ' batchId=' + batch.id + ' reason=appel_deja_traite');
      return { matched: false, reason: 'appel_deja_traite' };
    }

    const task = await this.taskRepo.findOne({
      where: { batchId: batch.id, category: taskCategory, status: CallTaskStatus.PENDING },
    });
    if (!task) {
      this.logger.log('CALL_OBLIGATION_REJECTED callEventId=' + params.callEventId + ' posteId=' + posteId + ' batchId=' + batch.id + ' reason=quota_categorie_atteint category=' + taskCategory);
      return { matched: false, reason: 'quota_categorie_atteint' };
    }

    // FIX-M2: Protection race condition — deux appels simultanés peuvent valider la meme tâche
    // L'index UNIQUE UQ_call_task_call_event_id garantit qu'un callEventId est utilisé une seule fois
    task.status = CallTaskStatus.DONE;
    task.clientPhone = params.clientPhone ?? null;
    task.callEventId = params.callEventId;
    task.durationSeconds = params.durationSeconds;
    task.completedAt = new Date();
    try {
      await this.taskRepo.save(task);
    } catch (saveErr: any) {
      if (saveErr?.code === 'ER_DUP_ENTRY') {
        this.logger.warn(
          'FIX-M2: ER_DUP_ENTRY tryMatchCallToTask callEventId=' + params.callEventId + ' — appel deja utilise dans une autre tache',
        );
        return { matched: false, reason: 'appel_deja_traite' };
      }
      throw saveErr;
    }
    const counterField = this.batchCounterField(taskCategory);
    batch[counterField] = (batch[counterField] as number) + 1;

    const callsComplete =
      batch.annuleeDone >= REQUIRED_PER_CATEGORY &&
      batch.livreeDone >= REQUIRED_PER_CATEGORY &&
      batch.sansCommandeDone >= REQUIRED_PER_CATEGORY;

    if (callsComplete) {
      batch.status = BatchStatus.COMPLETE;
      batch.completedAt = new Date();
      this.logger.log('CALL_OBLIGATION_BATCH_CALLS_COMPLETE posteId=' + posteId + ' batchId=' + batch.id + ' batchNumber=' + batch.batchNumber);
    }
    await this.batchRepo.save(batch);

    const obligationStatus = await this.getStatus(posteId);
    this.eventEmitter.emit('call_obligation.matched', { posteId, obligationStatus });

    this.logger.log('CALL_OBLIGATION_MATCHED callEventId=' + params.callEventId + ' posteId=' + posteId + ' batchId=' + batch.id + ' batchNumber=' + batch.batchNumber + ' category=' + taskCategory + ' durationSeconds=' + params.durationSeconds);
    return { matched: true, taskId: task.id };
  }

  async checkAndRecordQuality(posteId: string, activeConvs: WhatsappChat[]): Promise<boolean> {
    const thresholdStr = await this.systemConfig.get('CALL_QUALITY_THRESHOLD_PCT');
    const threshold = thresholdStr ? parseInt(thresholdStr, 10) : 80;

    const okCount = activeConvs.filter((c) => {
      if (!c.last_client_message_at) return true;
      if (!c.last_poste_message_at) return false;
      return c.last_poste_message_at >= c.last_client_message_at;
    }).length;

    const pct = activeConvs.length > 0
      ? Math.round((okCount / activeConvs.length) * 100)
      : 100;

    const passed = pct >= threshold;

    const batch = await this.getActiveBatch(posteId);
    if (batch) {
      batch.qualityCheckPassed = passed;
      await this.batchRepo.save(batch);
    }

    this.logger.log(
      (passed ? 'CALL_OBLIGATION_QUALITY_PASSED' : 'CALL_OBLIGATION_QUALITY_FAILED') + ' posteId=' + posteId + ' score=' + okCount + '/' + activeConvs.length + ' (' + pct + '% >= ' + threshold + '%)',
    );
    return passed;
  }

  async getStatus(posteId: string): Promise<ObligationStatus | null> {
    const batch = await this.getActiveBatch(posteId);
    if (!batch) return null;

    const readyForRotation = await this.isPosteReadyForRotation(posteId);

    let reportsRequired = 0;
    let reportsSubmitted = 0;

    if (batch.status === BatchStatus.COMPLETE && this.conversationReportService) {
      const activeConvs = await this.getActiveBlockConversations(posteId);
      reportsRequired = activeConvs.length;
      if (activeConvs.length > 0) {
        const submittedMap = await this.conversationReportService.getSubmittedMapBulk(
          activeConvs.map(c => c.chat_id),
        );
        reportsSubmitted = activeConvs.filter(c => submittedMap.get(c.chat_id) === true).length;
      }
    }

    if (readyForRotation) {
      this.logger.log('CALL_OBLIGATION_READY_FOR_ROTATION posteId=' + posteId + ' batchId=' + batch.id + ' batchNumber=' + batch.batchNumber);
    }

    const doneTasks = await this.taskRepo.find({
      where: { batchId: batch.id, status: CallTaskStatus.DONE },
      select: ['clientPhone'],
    });
    const calledPhones = doneTasks
      .map(t => t.clientPhone)
      .filter((p): p is string => !!p);

    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      annulee:      { done: batch.annuleeDone,      required: REQUIRED_PER_CATEGORY },
      livree:       { done: batch.livreeDone,        required: REQUIRED_PER_CATEGORY },
      sansCommande: { done: batch.sansCommandeDone,  required: REQUIRED_PER_CATEGORY },
      qualityCheckPassed: batch.qualityCheckPassed,
      readyForRotation,
      reportsRequired,
      reportsSubmitted,
      calledPhones,
    };
  }

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

  async getActivePosteIds(): Promise<string[]> {
    if (!await this.isEnabled()) return [];
    const batches = await this.batchRepo.find({
      where: { status: BatchStatus.PENDING },
      select: ['posteId'],
    });
    return [...new Set(batches.map((b) => b.posteId))];
  }

  async getStuckBatches(olderThanDays: number): Promise<CommercialObligationBatch[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    return this.batchRepo.find({
      where: {
        status: BatchStatus.PENDING,
        createdAt: LessThan(cutoff),
      },
    });
  }

  async initAllBatches(): Promise<{ created: number; alreadyActive: number }> {
    const postes = await this.posteRepo.find({ select: ['id'] });

    const activeBatches = await this.batchRepo.find({
      where: { status: In([BatchStatus.PENDING, BatchStatus.COMPLETE]) },
      select: ['posteId'],
    });
    const coveredPosteIds = new Set(activeBatches.map((b) => b.posteId));

    let created = 0;
    let alreadyActive = 0;
    for (const poste of postes) {
      if (coveredPosteIds.has(poste.id)) { alreadyActive++; continue; }
      await this.getOrCreateActiveBatch(poste.id);
      created++;
    }
    this.logger.log('initAllBatches — créés: ' + created + ', déjà actifs: ' + alreadyActive);
    return { created, alreadyActive };
  }

  async getActiveBlockConversations(posteId: string): Promise<WhatsappChat[]> {
    return this.chatRepo.find({
      where: {
        poste_id:      posteId,
        window_status: WindowStatus.ACTIVE,
        window_slot:   Not(IsNull()),
      },
      select: ['id', 'chat_id', 'last_client_message_at', 'last_poste_message_at'],
      order:  { window_slot: 'ASC' },
    });
  }

  async runQualityCheck(posteId: string): Promise<boolean> {
    const blockConvs = await this.getActiveBlockConversations(posteId);
    return this.checkAndRecordQuality(posteId, blockConvs);
  }

  isReadyForRotation(batch: CommercialObligationBatch): boolean {
    return this.isBatchReady(batch);
  }

  async isPosteReadyForRotation(posteId: string): Promise<boolean> {
    const batch = await this.getActiveBatch(posteId);
    if (!batch) return true;
    if (!this.isBatchReady(batch)) return false;
    if (batch.status === BatchStatus.COMPLETE) {
      const activeConvs = await this.getActiveBlockConversations(posteId);
      if (activeConvs.length === 0) return true;
      if (!this.conversationReportService) return true;
      const submittedMap = await this.conversationReportService.getSubmittedMapBulk(
        activeConvs.map(c => c.chat_id),
      );
      return activeConvs.every(c => submittedMap.get(c.chat_id) === true);
    }
    return true;
  }

  private isBatchReady(batch: CommercialObligationBatch): boolean {
    return (
      batch.annuleeDone >= REQUIRED_PER_CATEGORY &&
      batch.livreeDone >= REQUIRED_PER_CATEGORY &&
      batch.sansCommandeDone >= REQUIRED_PER_CATEGORY
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
    const normalized = normalizePhone(clientPhone);
    const contact = await this.contactRepo.findOne({
      where: { phone: normalized },
      select: ['client_category'],
    });
    if (!contact?.client_category) return null;
    return CATEGORY_MAP[contact.client_category] ?? null;
  }

  private async resolvePosteByCommercialPhone(phone: string): Promise<string | null> {
    const normalized = normalizePhone(phone);
    const commercial = await this.commercialRepo.findOne({
      where: { phone: normalized },
      relations: { poste: true },
    });
    return commercial?.poste?.id ?? null;
  }

}
