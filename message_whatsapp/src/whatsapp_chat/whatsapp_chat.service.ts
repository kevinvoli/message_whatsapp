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

  const  chats=
   await this.chatRepository.find({
    where: { commercialId: commercialId },
    order: { updatedAt: 'DESC' },
    relations: ['commercial','messages',],
  });


  return chats
}

  async findOrCreateChat(
    chatId: string,
    from: string,
    fromName: string,
    commercialId: string,
  ): Promise<WhatsappChat> {
    try {
      const existingChat = await this.chatRepository.findOne({
        where: { chatId: chatId },
      });

      if (existingChat) {
        return existingChat;
      }

      const commercial = await this.commercialService.findOneById(commercialId);
      if (!commercial) {
        throw new Error('Commercial not found');
      }

      const newChat = this.chatRepository.create({
        chatId: chatId,
        name: fromName,
        type: 'private',
        chatPic: '',
        chatPicFull: '',
        isPinned: false,
        isMuted: false,
        muteUntil: null,
        isArchived: false,
        unreadCount: 0,
        unreadMention: false,
        readOnly: false,
        notSpam: true,
        commercial: commercial,
        contactClient: from,
        lastActivityAt: new Date(),
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
      return this.chatRepository.find({ where: { chatId: chatId }, relations: ['commercial', 'conversation', 'chatEvent','chatLabel','messages',], });
    }
    return this.chatRepository.find();
  }

  async findByChatId(chatId: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { chatId: chatId },
      relations: ['commercial','messages'],
    });
  }

  async findOne(id: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { id },
      relations: ['commercial', 'conversation', 'chatEvent', 'chatLabel','messages'],
    });
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChat`;
  }
}
