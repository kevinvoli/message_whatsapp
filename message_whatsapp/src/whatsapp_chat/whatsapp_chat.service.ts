import { Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';

@Injectable()
export class WhatsappChatService {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly commercialService: WhatsappCommercialService,
  ) {}

  // Dans WhatsappChatService
  async findByCommercialId(commercialId: string): Promise<WhatsappChat[]> {
    const chats = await this.chatRepository.find({
      where: { commercial_id: commercialId },
      order: { updatedAt: 'DESC' },
      relations: ['commercial', 'messages'],
    });

    return chats;
  }

  async findOrCreateChat(
    chatId: string,
    from: string,
    fromName: string,
    commercialId: string,
  ): Promise<WhatsappChat> {
    try {
      const existingChat = await this.chatRepository.findOne({
        where: { chat_id: chatId },
      });

      if (existingChat) {
        return existingChat;
      }

      const commercial = await this.commercialService.findOneById(commercialId);
      if (!commercial) {
        throw new Error('Commercial not found');
      }

      const newChat = this.chatRepository.create({
        chat_id: chatId,
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
        commercial: commercial,
        contact_client: from,
        last_activity_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return this.chatRepository.save(newChat);
    } catch (error) {
      console.error('Error finding or creating chat:', error);
      throw new Error(`Failed to find or create chat: ${String(error)}`);
    }
  }

  /* =======================
   * 👁️ CHAT OUVERT (READ ALL)
   * ======================= */
  async markChatAsRead(chatId: string): Promise<void> {
    await this.chatRepository.update(
      { chat_id: chatId },
      {
        unread_count: 0,
        last_activity_at: new Date(),
      },
    );
  }

  /* =======================
   * ➕ MESSAGE ENTRANT
   * ======================= */
  async incrementUnreadCount(chatId: string): Promise<void> {
    await this.chatRepository.increment({ chat_id: chatId }, 'unread_count', 1);

    await this.chatRepository.update(
      { chat_id: chatId },
      { last_activity_at: new Date() },
    );
  }

  /* =======================
   * 🔄 RECALCUL (SÉCURITÉ)
   * ======================= */
  async recomputeUnreadCount(chatId: string): Promise<void> {
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
      [chatId],
    );
  }

  async findAll(chatId?: string) {
    if (chatId) {
      return this.chatRepository.find({
        where: { chat_id: chatId },
        relations: ['commercial', 'messages'],
      });
    }
    return this.chatRepository.find();
  }

  async findByChatId(chatId: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { chat_id: chatId },
      relations: ['commercial', 'messages'],
    });
  }

  async findByChatIdAndUpdate(chatId: string, chanelId:string): Promise<WhatsappChat | null> {
    const chat = await this.chatRepository.findOne({
      where: { chat_id: chatId },
      relations: ['commercial', 'messages'],
    });

    if (!chat) {
      return null;
    }
    chat.last_commercial_message_at = new Date();
    chat.unread_count = 0;
    chat.channel_id = chanelId

    return await this.chatRepository.save(chat);
  }

  async findOne(id: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { id },
      relations: ['commercial', 'messages'],
    });
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChat`;
  }
}
