import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';

@Injectable()
export class WhatsappChatService {
  private readonly logger = new Logger(WhatsappChatService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly posteService: WhatsappPosteService,
  ) {}

  // Dans WhatsappChatService
  async findByPosteId(poste_id: string): Promise<WhatsappChat[]> {
    const chats = await this.chatRepository.find({
      where: { poste_id: poste_id },
      order: { updatedAt: 'DESC' },
      relations: ['poste', 'messages', 'channel'],
    });

    return chats;
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
        relations: ['poste', 'messages', 'channel'],
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
    const chat =  await this.chatRepository.update(
      { chat_id: chat_id },
      {
        unread_count: 0,
        last_activity_at: new Date(),
      },
    );

    this.logger.debug(`Chat marked as read (${chat_id})`);
    // return chat;
  }

  /* =======================
   * ➕ MESSAGE ENTRANT
   * ======================= */
  async incrementUnreadCount(chat_id: string): Promise<void> {
    await this.chatRepository.increment(
      { chat_id: chat_id },
      'unread_count',
      1,
    );

    await this.chatRepository.update(
      { chat_id: chat_id },
      { last_activity_at: new Date() },
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

  async findAll(chat_id?: string) {
    if (chat_id) {
      return this.chatRepository
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
        .where('chat.chat_id = :chat_id', { chat_id })
        .getMany();
    }
    return this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.poste', 'poste')
      .leftJoinAndSelect('chat.channel', 'channel')
      .leftJoinAndMapOne(
        'chat.contact',
        Contact,
        'contact',
        'contact.chat_id = chat.chat_id',
      )
      .leftJoinAndMapOne(
        'chat.last_message',
        WhatsappMessage,
        'last_message',
        `last_message.id = (${this.chatRepository
          .createQueryBuilder()
          .subQuery()
          .select('m.id')
          .from(WhatsappMessage, 'm')
          .where('m.chat_id = chat.chat_id')
          .andWhere('m.deletedAt IS NULL')
          .orderBy('m.timestamp', 'DESC')
          .limit(1)
          .getQuery()})`,
      )
      .orderBy('chat.updatedAt', 'DESC')
      .getMany();
  }

  async findBychat_id(chat_id: string): Promise<WhatsappChat | null> {
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
}

