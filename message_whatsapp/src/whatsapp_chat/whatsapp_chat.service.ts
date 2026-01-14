import { Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { log } from 'console';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';

@Injectable()
export class WhatsappChatService {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
        private readonly commercialService : WhatsappCommercialService,
    
  ) {}

// Dans WhatsappChatService
async findByCommercialId(commercialId: string): Promise<WhatsappChat[]> {
  return this.chatRepository.find({
    where: { commercial_id: commercialId },
    order: { updatedAt: 'DESC' },
    relations: ['commercial','messages','conversation','chatEvent','chatLabel'],
  });
}

  async findOrCreateChat(
    chatId: string,
    from: string,
    fromName: string,
    commercialId: string,
  ): Promise<WhatsappChat> {
    try {
      const chat = await this.chatRepository.findOne({
        where: { chat_id: chatId },
      });
      if (chat) {
        log('chat trouvé ou créé:', chat);
        return chat;
      }
      const commercial = await this.commercialService.findOneById(commercialId);
      console.log("le commercial trouve",commercial);
      
      if (!commercial) {
        throw new Error('Commercial not found');
      }
      console.log("le chat doit etre ici");
      
      const creatChat = this.chatRepository.create({
        chat_id: chatId,
        name: fromName,
        type: 'private', // assuming private chat
        chat_pic: '',
        chat_pic_full: '',
        is_pinned: 'false',
        is_muted: 'false',
        mute_until: '0',
        is_archived: 'false',
        unread_count: '0',
        unread_mention: 'false',
        read_only: 'false',
        not_spam: 'true',
        commercial: commercial,
        last_activity_at: Date.now().toString(),
        created_at: Date.now().toString(),
        updated_at: Date.now().toString(),
      });

      console.log('chat a cree===============================', creatChat);

      return this.chatRepository.save(creatChat);
    } catch (error) {
      console.error('Error finding or creating chat:', error);
      throw new Error(`Failed to find or create chat: ${String(error)}`);
    }
  }

  async findAll(chatId?: string) {
    if (chatId) {
      return this.chatRepository.find({ where: { chat_id: chatId }, relations: ['commercial', 'conversation', 'chatEvent','chatLabel',], });
    }
    return this.chatRepository.find();
  }

  async findByChatId(chatId: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { chat_id: chatId },
      relations: ['commercial'],
    });
  }

  async findOne(id: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { id },
      relations: ['commercial', 'conversation', 'chatEvent', 'chatLabel'],
    });
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChat`;
  }
}
