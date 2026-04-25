/**
 * TICKET-06-B — Service de lecture centralisé pour `whatsapp_chat`.
 *
 * Responsabilité unique : exécuter les requêtes SELECT sur `whatsapp_chat`
 * (avec enrichissements depuis `whatsapp_message` et `whatsapp_poste`).
 * Toutes les mutations restent dans `WhatsappChatService`.
 *
 * Index utilisés (documentés par requête) :
 *  - IDX_chat_poste_activity        (poste_id, last_activity_at)  → findByPosteId
 *  - UQ_whatsapp_chat_tenant_chat_id (tenant_id, chat_id)          → findByChatId, findBulkByChatIds
 *  - IDX_chat_analytics_status_time (status, createdAt, deletedAt) → getStatsByPoste
 *  - IDX_chat_poste_time            (poste_id, createdAt, deletedAt) → findAll (filtre posteId)
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

export interface FindAllResult {
  data: WhatsappChat[];
  total: number;
  totalAll: number;
  totalActifs: number;
  totalEnAttente: number;
  totalUnread: number;
  totalFermes: number;
}

export interface PosteStats {
  poste_id: string;
  poste_name: string;
  poste_code: string;
  total: number;
  actif: number;
  en_attente: number;
  ferme: number;
  unread_total: number;
}

export interface CommercialStats {
  commercial_id: string;
  commercial_name: string;
  commercial_email: string;
  poste_id: string | null;
  poste_name: string | null;
  conversations_count: number;
  messages_sent: number;
  isConnected: boolean;
}

@Injectable()
export class ConversationReadQueryService {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
  ) {}

  /**
   * Conversations d'un poste, paginées par keyset.
   * Index : IDX_chat_poste_activity (poste_id, last_activity_at DESC, chat_id DESC)
   */
  async findByPosteId(
    poste_id: string,
    excludeStatuses: string[] = ['fermé', 'converti'],
    limit = 300,
    cursor?: { activityAt: string; chatId: string },
    excludeWindowStatus?: string,
    onlySlotted = false,
  ): Promise<{ chats: WhatsappChat[]; hasMore: boolean }> {
    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .where('chat.poste_id = :poste_id', { poste_id })
      .andWhere('chat.deletedAt IS NULL')
      .orderBy('chat.last_activity_at', 'DESC')
      .addOrderBy('chat.chat_id', 'DESC')
      .limit(limit + 1); // +1 pour détecter hasMore

    if (onlySlotted) {
      qb.andWhere('chat.window_slot IS NOT NULL');
    }

    if (excludeStatuses.length > 0) {
      qb.andWhere('chat.status NOT IN (:...excludeStatuses)', { excludeStatuses });
    }

    if (excludeWindowStatus) {
      qb.andWhere(
        '(chat.window_status IS NULL OR chat.window_status != :excludeWindowStatus)',
        { excludeWindowStatus },
      );
    }

    if (cursor) {
      qb.andWhere(
        '(chat.last_activity_at < :activityAt OR (chat.last_activity_at = :activityAt AND chat.chat_id < :chatId))',
        { activityAt: new Date(cursor.activityAt), chatId: cursor.chatId },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    return { chats: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

  /**
   * Nombre de conversations avec au moins 1 message entrant non lu (status sent/delivered).
   * Cohérent avec le badge "non lus" du frontend.
   */
  async getTotalUnreadForPoste(poste_id: string): Promise<number> {
    const result = await this.messageRepository
      .createQueryBuilder('m')
      .select('COUNT(DISTINCT m.chat_id)', 'total')
      .innerJoin('whatsapp_chat', 'c', 'c.chat_id = m.chat_id')
      .where('c.poste_id = :poste_id', { poste_id })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('m.from_me = :fromMe', { fromMe: false })
      .andWhere('m.status IN (:...statuses)', { statuses: ['sent', 'delivered'] })
      .andWhere('m.deletedAt IS NULL')
      .getRawOne<{ total: string }>();
    return parseInt(result?.total ?? '0') || 0;
  }

  /**
   * Liste paginée avec filtres + statistiques globales.
   * Usage : admin et vues analytiques.
   * Index : IDX_chat_poste_time (filtre posteId), IDX_chat_analytics_status_time (stats).
   */
  async findAll(
    chat_id?: string,
    limit = 50,
    offset = 0,
    dateStart?: Date,
    posteId?: string,
    commercialId?: string,
  ): Promise<FindAllResult> {
    if (chat_id) {
      const data = await this.chatRepository
        .createQueryBuilder('chat')
        .leftJoinAndSelect('chat.poste', 'poste')
        .leftJoinAndSelect('chat.channel', 'channel')
        .leftJoinAndMapOne('chat.contact', Contact, 'contact', 'contact.chat_id = chat.chat_id')
        .where('chat.chat_id = :chat_id', { chat_id })
        .getMany();
      return { data, total: data.length, totalAll: data.length, totalActifs: 0, totalEnAttente: 0, totalUnread: 0, totalFermes: 0 };
    }

    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .leftJoinAndMapOne('chat.contact', Contact, 'contact', 'contact.chat_id = chat.chat_id')
      .orderBy('chat.last_activity_at', 'DESC');

    if (dateStart) {
      qb.andWhere(
        '(chat.last_activity_at >= :dateStart OR chat.unread_count > 0)',
        { dateStart },
      );
    }
    if (posteId) {
      qb.andWhere('chat.poste_id = :posteId', { posteId });
    }
    if (commercialId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM whatsapp_message m
          WHERE m.chat_id = chat.chat_id
            AND m.commercial_id = :commercialId
            AND m.direction = 'OUT'
            AND m.deletedAt IS NULL
        )`,
        { commercialId },
      );
    }

    const [data, total] = await qb.take(limit).skip(offset).getManyAndCount();

    // Enrichissement : unread réel depuis whatsapp_message (cohérence badge frontend)
    if (data.length > 0) {
      const chatIds = data.map((c) => c.chat_id);
      const unreadRows: Array<{ chat_id: string; cnt: string }> = await this.messageRepository
        .createQueryBuilder('m')
        .select('m.chat_id', 'chat_id')
        .addSelect('COUNT(*)', 'cnt')
        .where('m.chat_id IN (:...chatIds)', { chatIds })
        .andWhere('m.from_me = :fromMe', { fromMe: false })
        .andWhere('m.status IN (:...statuses)', { statuses: ['sent', 'delivered'] })
        .andWhere('m.deletedAt IS NULL')
        .groupBy('m.chat_id')
        .getRawMany();
      const unreadMap = new Map(unreadRows.map((r) => [r.chat_id, parseInt(r.cnt) || 0]));
      for (const chat of data) {
        const computed = unreadMap.get(chat.chat_id);
        if (computed !== undefined) chat.unread_count = computed;
      }
    }

    // Enrichissement : dernier message par conversation (1 seule requête)
    if (data.length > 0) {
      const chatIds = data.map((c) => c.chat_id);
      const lastMessages = await this.messageRepository
        .createQueryBuilder('m')
        .innerJoin(
          (sub) =>
            sub
              .select('m2.chat_id', 'cid')
              .addSelect('MAX(m2.timestamp)', 'max_ts')
              .from(WhatsappMessage, 'm2')
              .where('m2.chat_id IN (:...chatIds)', { chatIds })
              .andWhere('m2.deletedAt IS NULL')
              .groupBy('m2.chat_id'),
          'latest',
          'm.chat_id = latest.cid AND m.timestamp = latest.max_ts AND m.deletedAt IS NULL',
        )
        .where('m.chat_id IN (:...chatIds)', { chatIds })
        .getMany();

      const lastMsgMap = new Map(lastMessages.map((m) => [m.chat_id, m]));
      for (const chat of data) {
        (chat as any).last_message = lastMsgMap.get(chat.chat_id) ?? null;
      }
    }

    // Statistiques globales (indépendantes de la pagination et du filtre de date)
    const statsQb = this.chatRepository
      .createQueryBuilder('chat')
      .select('COUNT(*)', 'totalAll')
      .addSelect("SUM(CASE WHEN chat.status = 'actif' THEN 1 ELSE 0 END)", 'totalActifs')
      .addSelect("SUM(CASE WHEN chat.status = 'en attente' THEN 1 ELSE 0 END)", 'totalEnAttente')
      .addSelect(
        `SUM(CASE WHEN EXISTS (
           SELECT 1 FROM whatsapp_message m
           WHERE m.chat_id = chat.chat_id
             AND m.from_me = 0
             AND m.status IN ('sent','delivered')
             AND m.deletedAt IS NULL
         ) THEN 1 ELSE 0 END)`,
        'totalUnread',
      )
      .addSelect("SUM(CASE WHEN chat.status = 'fermé' THEN 1 ELSE 0 END)", 'totalFermes')
      .where('chat.deletedAt IS NULL');

    if (posteId) statsQb.andWhere('chat.poste_id = :posteId', { posteId });
    if (commercialId) {
      statsQb.andWhere(
        `EXISTS (
          SELECT 1 FROM whatsapp_message m
          WHERE m.chat_id = chat.chat_id
            AND m.commercial_id = :commercialId
            AND m.direction = 'OUT'
            AND m.deletedAt IS NULL
        )`,
        { commercialId },
      );
    }

    const stats = await statsQb.getRawOne<{
      totalAll: string;
      totalActifs: string;
      totalEnAttente: string;
      totalUnread: string;
      totalFermes: string;
    }>();

    return {
      data,
      total,
      totalAll: parseInt(stats?.totalAll ?? '0') || 0,
      totalActifs: parseInt(stats?.totalActifs ?? '0') || 0,
      totalEnAttente: parseInt(stats?.totalEnAttente ?? '0') || 0,
      totalUnread: parseInt(stats?.totalUnread ?? '0') || 0,
      totalFermes: parseInt(stats?.totalFermes ?? '0') || 0,
    };
  }

  /**
   * Conversation par chat_id avec relations (poste, channel, contact).
   * Index : UQ_whatsapp_chat_tenant_chat_id
   */
  async findByChatId(chat_id: string): Promise<WhatsappChat | null> {
    return (
      (await this.chatRepository
        .createQueryBuilder('chat')
        .leftJoinAndSelect('chat.poste', 'poste')
        .leftJoinAndSelect('chat.channel', 'channel')
        .leftJoinAndMapOne('chat.contact', Contact, 'contact', 'contact.chat_id = chat.chat_id')
        .where('chat.chat_id = :chat_id', { chat_id })
        .getOne()) ?? null
    );
  }

  /**
   * Chargement en lot par chat_ids.
   * Index : UQ_whatsapp_chat_tenant_chat_id
   */
  async findBulkByChatIds(chatIds: string[]): Promise<Map<string, WhatsappChat>> {
    if (chatIds.length === 0) return new Map();
    const chats = await this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .leftJoinAndMapOne('chat.contact', Contact, 'contact', 'contact.chat_id = chat.chat_id')
      .where('chat.chat_id IN (:...chatIds)', { chatIds })
      .getMany();
    return new Map(chats.map((c) => [c.chat_id, c]));
  }

  /**
   * Conversation par UUID (clé primaire), avec messages inclus.
   */
  async findOneById(id: string): Promise<WhatsappChat | null> {
    return (
      (await this.chatRepository
        .createQueryBuilder('chat')
        .leftJoinAndSelect('chat.poste', 'poste')
        .leftJoinAndSelect('chat.channel', 'channel')
        .leftJoinAndSelect('chat.messages', 'messages')
        .leftJoinAndMapOne('chat.contact', Contact, 'contact', 'contact.chat_id = chat.chat_id')
        .where('chat.id = :id', { id })
        .getOne()) ?? null
    );
  }

  /**
   * Statistiques agrégées par poste (total, actif, en_attente, fermé, unread).
   * Index : IDX_chat_analytics_status_time
   */
  async getStatsByPoste(): Promise<PosteStats[]> {
    const postes = await this.posteRepository.find({ order: { name: 'ASC' } });

    const rows: Array<{
      poste_id: string;
      status: string;
      count: string;
      unread_sum: string;
    }> = await this.chatRepository
      .createQueryBuilder('chat')
      .select('chat.poste_id', 'poste_id')
      .addSelect('chat.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(chat.unread_count)', 'unread_sum')
      .where('chat.poste_id IS NOT NULL')
      .andWhere('chat.deletedAt IS NULL')
      .groupBy('chat.poste_id')
      .addGroupBy('chat.status')
      .getRawMany();

    return postes.map((poste) => {
      const posteRows = rows.filter((r) => r.poste_id === poste.id);
      const get = (status: string) =>
        Number(posteRows.find((r) => r.status === status)?.count ?? 0);
      const total = posteRows.reduce((s, r) => s + Number(r.count), 0);
      const unread = posteRows.reduce((s, r) => s + Number(r.unread_sum ?? 0), 0);
      return {
        poste_id: poste.id,
        poste_name: poste.name,
        poste_code: poste.code,
        total,
        actif: get(WhatsappChatStatus.ACTIF),
        en_attente: get(WhatsappChatStatus.EN_ATTENTE),
        ferme: get(WhatsappChatStatus.FERME),
        unread_total: unread,
      };
    });
  }

  /**
   * Statistiques agrégées par commercial (conversations + messages envoyés).
   */
  async getStatsByCommercial(): Promise<CommercialStats[]> {
    const commerciaux = await this.commercialRepository.find({
      relations: ['poste'],
      order: { name: 'ASC' },
    });

    const statsRows: Array<{
      commercial_id: string;
      conv_count: string;
      msg_count: string;
    }> = await this.messageRepository
      .createQueryBuilder('msg')
      .select('msg.commercial_id', 'commercial_id')
      .addSelect('COUNT(DISTINCT msg.chat_id)', 'conv_count')
      .addSelect('COUNT(*)', 'msg_count')
      .where("msg.direction = 'OUT'")
      .andWhere('msg.commercial_id IS NOT NULL')
      .andWhere('msg.deletedAt IS NULL')
      .groupBy('msg.commercial_id')
      .getRawMany();

    const statsMap = new Map(statsRows.map((r) => [r.commercial_id, r]));

    return commerciaux.map((c) => {
      const row = statsMap.get(c.id);
      return {
        commercial_id: c.id,
        commercial_name: c.name,
        commercial_email: c.email,
        poste_id: c.poste?.id ?? null,
        poste_name: c.poste?.name ?? null,
        conversations_count: Number(row?.conv_count ?? 0),
        messages_sent: Number(row?.msg_count ?? 0),
        isConnected: c.isConnected,
      };
    });
  }
}
