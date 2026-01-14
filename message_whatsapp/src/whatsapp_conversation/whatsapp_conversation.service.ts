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
