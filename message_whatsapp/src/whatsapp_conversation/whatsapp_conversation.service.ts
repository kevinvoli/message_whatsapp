import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappConversation } from './entities/whatsapp_conversation.entity';
import { CreateWhatsappConversationDto } from './dto/create-whatsapp_conversation.dto';

@Injectable()
export class WhatsappConversationService {
  constructor(
    @InjectRepository(WhatsappConversation)
    private readonly repo: Repository<WhatsappConversation>,
  ) {}

  create(createDto: CreateWhatsappConversationDto): Promise<WhatsappConversation> {
    const conversation = this.repo.create(createDto);
    return this.repo.save(conversation);
  }

  findAll(): Promise<WhatsappConversation[]> {
    return this.repo.find();
  }

  findAllByUser(userId: string): Promise<WhatsappConversation[]> {
    return this.repo.find({ where: { assigned_agent_id: userId } });
  }

  async updateStatus(id: string, status: 'open' | 'close'): Promise<WhatsappConversation> {
    const conversation = await this.findById(id);
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    conversation.status = status;
    return this.repo.save(conversation);
  }

  async incrementUnreadCount(id: string): Promise<void> {
    await this.repo.increment({ id }, 'unreadCount', 1);
  }

  async resetUnreadCount(id: string): Promise<void> {
    await this.repo.update(id, { unreadCount: 0 });
  }

  findByChatId(chatId: string): Promise<WhatsappConversation | null> {
    return this.repo.findOne({ where: { chat_id: chatId } });
  }

  findById(id: string): Promise<WhatsappConversation | null> {
    return this.repo.findOne({
      where: { id },
    });
  }

  async update(id: string, updateDto: Partial<WhatsappConversation>): Promise<WhatsappConversation> {
    await this.repo.update(id, updateDto);
    const updatedConversation = await this.findById(id);
    if (!updatedConversation) {
      throw new Error('Conversation not found after update');
    }
    return updatedConversation;
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
