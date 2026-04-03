import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat, WhatsappChatStatus } from './entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

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
export class WhatsappChatService {
  private readonly logger = new Logger(WhatsappChatService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
    private readonly posteService: WhatsappPosteService,
  ) {}

  // Dans WhatsappChatService
  async findByPosteId(
    poste_id: string,
    excludeStatuses: string[] = ['fermé', 'converti'],
  ): Promise<WhatsappChat[]> {
    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .where('chat.poste_id = :poste_id', { poste_id })
      .orderBy('chat.last_activity_at', 'DESC')
      .take(200);

    if (excludeStatuses.length > 0) {
      qb.andWhere('chat.status NOT IN (:...excludeStatuses)', { excludeStatuses });
    }

    return qb.getMany();
  }

  async findOrCreateChat(
    chat_id: string,
    from: string,
    fromName: string,
    posteId: string,
  ): Promise<WhatsappChat> {
    try {
      const existingChat = await this.chatRepository.findOne({
        where: { chat_id: chat_id },
        relations: ['poste', 'channel'],
      });

      if (existingChat) {
        return existingChat;
      }

      const poste = await this.posteService.findOneById(posteId);
      if (!poste) {
        throw new Error('Commercial not found');
      }

      const newChat = this.chatRepository.create({
        chat_id: chat_id,
        name: fromName,
        type: 'private',
        chat_pic: '',
        chat_pic_full: '',
        is_pinned: false,
        is_muted: false,
        mute_until: null,
        is_archived: false,
        unread_count: 0,
        unread_mention: false,
        read_only: false,
        not_spam: true,
        poste: poste,

        contact_client: from,
        last_activity_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return this.chatRepository.save(newChat);
    } catch (error) {
      this.logger.error(
        'Error finding or creating chat',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(`Failed to find or create chat: ${String(error)}`);
    }
  }

  /* =======================
   * 👁️ CHAT OUVERT (READ ALL)
   * ======================= */
  async markChatAsRead(chat_id: string): Promise<void> {
    // Ancrage explicite de updatedAt pour bloquer ON UPDATE CURRENT_TIMESTAMP côté MySQL.
    await this.chatRepository.query(
      `UPDATE whatsapp_chat SET unread_count = 0, updatedAt = updatedAt WHERE chat_id = ?`,
      [chat_id],
    );

    this.logger.debug(`Chat marked as read (${chat_id})`);
  }

  /* =======================
   * ➕ MESSAGE ENTRANT
   * ======================= */
  async incrementUnreadCount(chat_id: string): Promise<void> {
    // Fusion des 2 UPDATE en 1 seul aller-retour DB
    await this.chatRepository.query(
      `UPDATE whatsapp_chat
       SET unread_count    = unread_count + 1,
           last_activity_at = NOW(),
           updatedAt        = updatedAt
       WHERE chat_id = ?`,
      [chat_id],
    );
  }

  /* =======================
   * 🔄 RECALCUL (SÉCURITÉ)
   * ======================= */
  async recomputeUnreadCount(chat_id: string): Promise<void> {
    await this.chatRepository.query(
      `
      UPDATE whatsapp_chat c
      SET unread_count = (
        SELECT COUNT(*)
        FROM whatsapp_message m
        WHERE m.chat_id = c.chat_id
          AND m.direction = 'IN'
          AND m.status != 'READ'
      )
      WHERE c.chat_id = $1
    `,
      [chat_id],
    );
  }

  async findAll(
    chat_id?: string,
    limit = 50,
    offset = 0,
    dateStart?: Date,
    posteId?: string,
    commercialId?: string,
  ): Promise<{ data: WhatsappChat[]; total: number }> {
    if (chat_id) {
      const data = await this.chatRepository
        .createQueryBuilder('chat')
        .leftJoinAndSelect('chat.poste', 'poste')
        .leftJoinAndSelect('chat.channel', 'channel')
        .leftJoinAndMapOne(
          'chat.contact',
          Contact,
          'contact',
          'contact.chat_id = chat.chat_id',
        )
        .where('chat.chat_id = :chat_id', { chat_id })
        .getMany();
      return { data, total: data.length };
    }
    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .leftJoinAndMapOne(
        'chat.contact',
        Contact,
        'contact',
        'contact.chat_id = chat.chat_id',
      )
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

    // Bulk-fetch last message per chat in a single query (replaces N correlated subqueries)
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

    return { data, total };
  }

  async findBychat_id(chat_id: string): Promise<WhatsappChat | null> {
    const chat = await this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .leftJoinAndMapOne(
        'chat.contact',
        Contact,
        'contact',
        'contact.chat_id = chat.chat_id',
      )
      .where('chat.chat_id = :chat_id', { chat_id })
      .getOne();
    return chat ?? null;
  }

  async findOne(id: string): Promise<WhatsappChat | null> {
    const chat = await this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .leftJoinAndSelect('chat.messages', 'messages')
      .leftJoinAndMapOne(
        'chat.contact',
        Contact,
        'contact',
        'contact.chat_id = chat.chat_id',
      )
      .where('chat.id = :id', { id })
      .getOne();
    return chat ?? null;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChat`;
  }

  async update(chat_id: string, data: Partial<WhatsappChat>): Promise<void> {
    await this.chatRepository.update({ chat_id }, data);
  }

  async lockConversation(id: string) {
    await this.update(id, { read_only: true });
  }

  async unlockConversation(id: string) {
    await this.update(id, { read_only: false });
  }

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

  async getStatsByCommercial(): Promise<CommercialStats[]> {
    const commerciaux = await this.commercialRepository.find({
      relations: ['poste'],
      order: { name: 'ASC' },
    });

    // Fusion des 2 requêtes en 1 seule passe (COUNT + COUNT DISTINCT simultanés)
    const statsRows: Array<{
      commercial_id: string;
      conv_count: string;
      msg_count: string;
    }> = await this.messageRepository
      .createQueryBuilder('msg')
      .select('msg.commercial_id',              'commercial_id')
      .addSelect('COUNT(DISTINCT msg.chat_id)', 'conv_count')
      .addSelect('COUNT(*)',                    'msg_count')
      .where("msg.direction = 'OUT'")
      .andWhere('msg.commercial_id IS NOT NULL')
      .andWhere('msg.deletedAt IS NULL')
      .groupBy('msg.commercial_id')
      .getRawMany();

    const statsMap = new Map(statsRows.map((r) => [r.commercial_id, r]));

    return commerciaux.map((c) => {
      const row = statsMap.get(c.id);
      return {
        commercial_id:       c.id,
        commercial_name:     c.name,
        commercial_email:    c.email,
        poste_id:            c.poste?.id ?? null,
        poste_name:          c.poste?.name ?? null,
        conversations_count: Number(row?.conv_count ?? 0),
        messages_sent:       Number(row?.msg_count  ?? 0),
        isConnected:         c.isConnected,
      };
    });
  }
}
