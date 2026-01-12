import { Injectable } from '@nestjs/common';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp_message.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiMessage, WhapiText } from 'src/whapi/interface/whapi-webhook.interface';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';

@Injectable()
export class WhatsappMessageService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    private readonly chatService: WhatsappChatService,
  ) {}

  async create(message: WhapiMessage) {
    try {
      console.log('message reçue du dispache', message);
      const chat = await this.chatService.findOrCreateChat(
        message.chat_id,
        message.from,
        message.from_name,
        '04b6c42f-5df8-4d93-8fd1-e1eb2c420ef7',
      );
      if (!chat) {
        throw new Error('Chat not found or created');
      }

      const chekMessage = await this.messageRepository.findOne({
        where: { message_id: message.id },
      });

      // assuming commercial with id "1"
      if (chekMessage) {
        console.log('Message already exists with id:', chekMessage.id);
        return chekMessage;
      }

      
      const data: Partial<WhatsappMessage> = {
        message_id: message.id,
        external_id: message.id,
        chat_id: message.chat_id,
        conversation_id: null,
        commercial_id: chat.commercial_id,
        direction: message.from_me ? MessageDirection.OUT : MessageDirection.IN,
        from_me: message.from_me,
        sender_phone: message.from,
        sender_name: message.from_name,
        status: WhatsappMessageStatus.DELIVERED,
        chat: chat,
        timestamp: new Date(message.timestamp * 1000),
        commercial: chat.commercial,
        source: message.source,
        text: message.type === 'text' ? (message.text as WhapiText).body : null,
      };

      const messageEntity = this.messageRepository.create(data);

      return this.messageRepository.save(messageEntity);
    } catch (error) {
      console.error('Error creating message:', error);
      throw new Error(`Failed to create message: ${error}`);
    }
  }

  findAll() {
    return `This action returns all whatsappMessage`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappMessage`;
  }

  update(id: string, updateWhatsappMessageDto: Partial<WhatsappMessage>) {
    return `This action updates a #${id} whatsappMessage`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMessage`;
  }
}
