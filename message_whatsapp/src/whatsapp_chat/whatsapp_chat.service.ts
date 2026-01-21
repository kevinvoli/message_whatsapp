import { Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat, WhatsappChatStatus } from './entities/whatsapp_chat.entity';
import { log } from 'console';
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

  async findAll(chatId?: string) {
    if (chatId) {
      return this.chatRepository.find({
        where: { chat_id: chatId },
        relations: [
          'commercial',
          'conversation',
          'chatEvent',
          'chatLabel',
          'messages',
        ],
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

  async findOne(id: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { id },
      relations: [
        'commercial',
        'conversation',
        'chatEvent',
        'chatLabel',
        'messages',
      ],
    });
  }

  async findPendingConversation(message:{
    message_id: string;
    from_me: boolean;
    type: string;
    chat_id: string;
    timestamp: number;
    source: string;
    text: { body: string };
    from: string;
    from_name: string;
  }): Promise<WhatsappChat[]> {
    return await this.chatRepository.find({
      where: {status: WhatsappChatStatus.EN_ATTENTE},
      order: {deletedAt:'ASC'},
      relations: ['message']
    });
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChat`;
  }
}
