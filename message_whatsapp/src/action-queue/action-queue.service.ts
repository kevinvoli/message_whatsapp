import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommercialActionTask } from './entities/commercial-action-task.entity';
export type { ActionTaskSource, ActionTaskStatus } from './entities/commercial-action-task.entity';
import { ActionTaskSource, ActionTaskStatus } from './entities/commercial-action-task.entity';
import { WhatsappChat, WhatsappChatStatus, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage, MessageDirection } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

const CALL_MSG_TYPES = ['call', 'voice_call', 'video_call', 'missed_call'];

export interface ActionTaskItem {
  taskId:       string | null;
  source:       ActionTaskSource;
  priority:     number;
  entityId:     string;
  contactName:  string | null;
  contactPhone: string | null;
  status:       ActionTaskStatus;
  dueAt:        Date | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextAction:   string | null;
  formData:     Record<string, unknown> | null;
  notes:        string | null;
  /** Données contextuelles live (ex: unread count) */
  context:      Record<string, unknown>;
}

export interface PostCallFormDto {
  contactName?:     string;
  ville?:           string;
  commune?:         string;
  quartier?:        string;
  productCategory?: string;
  otherPhones?:     string[];
  followUpAt?:      string;
  clientNeed?:      string;
  interestScore?:   number;
  isMaleNotInterested?: boolean;
  audioUrl?:        string;
  notes?:           string;
  nextAction?:      string;
  outcome?:         string;
}

@Injectable()
export class ActionQueueService {
  private readonly logger = new Logger(ActionQueueService.name);

  constructor(
    @InjectRepository(CommercialActionTask)
    private readonly taskRepo: Repository<CommercialActionTask>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  // ── Récupération du posteId ──────────────────────────────────────────────

  private async getPosteId(commercialId: string): Promise<string | null> {
    const c = await this.commercialRepo.findOne({
      where: { id: commercialId },
      relations: ['poste'],
    });
    return c?.poste?.id ?? null;
  }

  // ── File globale ─────────────────────────────────────────────────────────

  async getMyQueue(commercialId: string): Promise<ActionTaskItem[]> {
    const posteId = await this.getPosteId(commercialId);

    const [missedCalls, unanswered, prospects] = await Promise.all([
      this.getMissedCallItems(posteId),
      this.getUnansweredItems(posteId),
      this.getProspectItems(commercialId, posteId),
    ]);

    const all = [...missedCalls, ...unanswered, ...prospects];
    all.sort((a, b) => b.priority - a.priority);
    return all;
  }

  // ── E06-T06 : Appels en absence ──────────────────────────────────────────

  async getMissedCallItems(posteId: string | null): Promise<ActionTaskItem[]> {
    if (!posteId) return [];

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .innerJoin(
        'whatsapp_message', 'm',
        `m.chat_id = c.chat_id AND m.direction = '${MessageDirection.IN}' AND m.type IN ('${CALL_MSG_TYPES.join("','")}') AND m.deletedAt IS NULL`,
      )
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.unread_count > 0')
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.status != :closed', { closed: WhatsappChatStatus.FERME })
      .select(['c.chat_id', 'c.name', 'c.contact_client', 'c.unread_count'])
      .distinct(true)
      .limit(50)
      .getRawMany<{ c_chat_id: string; c_name: string; c_contact_client: string; c_unread_count: number }>();

    return this.mergeWithPersisted(chats.map((row) => ({
      source:       'missed_call' as ActionTaskSource,
      priority:     90,
      entityId:     row.c_chat_id,
      contactName:  row.c_name,
      contactPhone: row.c_contact_client,
      context:      { unreadCount: row.c_unread_count },
    })));
  }

  // ── E06-T06 : Messages entrants non répondus ──────────────────────────────

  async getUnansweredItems(posteId: string | null): Promise<ActionTaskItem[]> {
    if (!posteId) return [];

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.unread_count > 0')
      .andWhere('c.status = :status', { status: WhatsappChatStatus.ACTIF })
      .andWhere('c.window_status = :ws', { ws: WindowStatus.ACTIVE })
      .andWhere('c.last_client_message_at IS NOT NULL')
      .andWhere('c.deletedAt IS NULL')
      .select(['c.chat_id', 'c.name', 'c.contact_client', 'c.unread_count', 'c.last_client_message_at'])
      .orderBy('c.last_client_message_at', 'ASC')
      .limit(50)
      .getRawMany<{
        c_chat_id: string;
        c_name: string;
        c_contact_client: string;
        c_unread_count: number;
        c_last_client_message_at: string;
      }>();

    return this.mergeWithPersisted(chats.map((row) => ({
      source:       'unanswered_message' as ActionTaskSource,
      priority:     80,
      entityId:     row.c_chat_id,
      contactName:  row.c_name,
      contactPhone: row.c_contact_client,
      context:      {
        unreadCount:      row.c_unread_count,
        lastClientMsgAt: row.c_last_client_message_at,
      },
    })));
  }

  // ── E06-T02 : Prospects sans commande ────────────────────────────────────

  async getProspectItems(commercialId: string, posteId: string | null): Promise<ActionTaskItem[]> {
    if (!posteId) return [];

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoin(
        'conversation_report', 'r',
        'r.chat_id = c.chat_id AND r.is_submitted = 1',
      )
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.status = :status', { status: WhatsappChatStatus.ACTIF })
      .andWhere('c.window_status = :ws', { ws: WindowStatus.ACTIVE })
      .andWhere('c.conversation_result IS NULL')
      .andWhere('r.id IS NULL')
      .andWhere('c.deletedAt IS NULL')
      .select(['c.chat_id', 'c.name', 'c.contact_client', 'c.last_activity_at'])
      .orderBy('c.last_activity_at', 'ASC')
      .limit(30)
      .getRawMany<{
        c_chat_id: string;
        c_name: string;
        c_contact_client: string;
        c_last_activity_at: string;
      }>();

    return this.mergeWithPersisted(chats.map((row) => ({
      source:       'prospect_no_order' as ActionTaskSource,
      priority:     60,
      entityId:     row.c_chat_id,
      contactName:  row.c_name,
      contactPhone: row.c_contact_client,
      context:      { lastActivityAt: row.c_last_activity_at },
    })));
  }

  // ── Merge données live + état persisté ──────────────────────────────────

  private async mergeWithPersisted(
    items: Array<{
      source:       ActionTaskSource;
      priority:     number;
      entityId:     string;
      contactName:  string | null;
      contactPhone: string | null;
      context:      Record<string, unknown>;
    }>,
  ): Promise<ActionTaskItem[]> {
    if (items.length === 0) return [];

    const entityIds  = items.map((i) => i.entityId);
    const sources    = [...new Set(items.map((i) => i.source))];

    const persistedList = await this.taskRepo
      .createQueryBuilder('t')
      .where('t.entity_id IN (:...ids)', { ids: entityIds })
      .andWhere('t.source IN (:...sources)', { sources })
      .getMany();

    const persistedMap = new Map(
      persistedList.map((t) => [`${t.entityId}::${t.source}`, t]),
    );

    const result: ActionTaskItem[] = [];

    for (const item of items) {
      const key       = `${item.entityId}::${item.source}`;
      const persisted = persistedMap.get(key);

      if (persisted?.status === 'done' || persisted?.status === 'skipped') continue;

      result.push({
        taskId:        persisted?.id ?? null,
        source:        item.source,
        priority:      item.priority,
        entityId:      item.entityId,
        contactName:   item.contactName,
        contactPhone:  item.contactPhone,
        status:        (persisted?.status ?? 'pending') as ActionTaskStatus,
        dueAt:         persisted?.dueAt ?? null,
        attemptCount:  persisted?.attemptCount ?? 0,
        lastAttemptAt: persisted?.lastAttemptAt ?? null,
        nextAction:    persisted?.nextAction ?? null,
        formData:      persisted?.formData ?? null,
        notes:         persisted?.notes ?? null,
        context:       item.context,
      });
    }

    return result;
  }

  // ── CRUD persistance ─────────────────────────────────────────────────────

  async saveTask(params: {
    source:        ActionTaskSource;
    entityId:      string;
    commercialId:  string;
    posteId?:      string | null;
    contactName?:  string;
    contactPhone?: string;
    status:        ActionTaskStatus;
    nextAction?:   string;
    dueAt?:        Date | null;
    formData?:     Record<string, unknown>;
    notes?:        string;
    audioUrl?:     string;
  }): Promise<CommercialActionTask> {
    const existing = await this.taskRepo.findOne({
      where: { entityId: params.entityId, source: params.source },
    });

    if (existing) {
      existing.status           = params.status;
      existing.lastAttemptAt    = new Date();
      existing.attemptCount     = existing.attemptCount + 1;
      if (params.nextAction   !== undefined) existing.nextAction    = params.nextAction ?? null;
      if (params.dueAt        !== undefined) existing.dueAt         = params.dueAt;
      if (params.formData     !== undefined) existing.formData      = params.formData ?? null;
      if (params.notes        !== undefined) existing.notes         = params.notes ?? null;
      if (params.audioUrl     !== undefined) existing.audioRecordingUrl = params.audioUrl ?? null;
      return this.taskRepo.save(existing);
    }

    return this.taskRepo.save(
      this.taskRepo.create({
        source:              params.source,
        entityId:            params.entityId,
        assignedCommercialId: params.commercialId,
        assignedPosteId:     params.posteId ?? null,
        contactName:         params.contactName ?? null,
        contactPhone:        params.contactPhone ?? null,
        status:              params.status,
        nextAction:          params.nextAction ?? null,
        dueAt:               params.dueAt ?? null,
        formData:            params.formData ?? null,
        notes:               params.notes ?? null,
        audioRecordingUrl:   params.audioUrl ?? null,
        attemptCount:        1,
        lastAttemptAt:       new Date(),
      }),
    );
  }
}
