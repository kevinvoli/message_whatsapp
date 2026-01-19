import { Injectable } from '@nestjs/common';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp_message.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WhapiMessage,
  WhapiText,
} from 'src/whapi/interface/whapi-webhook.interface';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';

@Injectable()
export class WhatsappMessageService {
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    private readonly chatService: WhatsappChatService,
    private readonly communicationWhapiService: CommunicationWhapiService
  ) {}


async createAgentMessage(data: {
  chat_id: string;
  text: string;
  commercial_id: string;
  timestamp: Date;
}): Promise<WhatsappMessage> {


  try {
    const chat = await this.chatService.findByChatId(data.chat_id);
    if (!chat) throw new Error('Chat not found');

    // 1️⃣ Envoi réel vers WhatsApp
    const whapiResponse = await this.communicationWhapiService.sendToWhapi(
      chat.contact_client, 
      data.text,
    );

    // 2️⃣ Création message DB
    const messageEntity = this.messageRepository.create({
      message_id: whapiResponse.id ?? `agent_${Date.now()}`,
      external_id: whapiResponse.id,
      chat_id: data.chat_id,
      conversation_id: data.chat_id,
      commercial_id: data.commercial_id,
      direction: MessageDirection.OUT,
      from_me: true,
      timestamp: data.timestamp,
      status: WhatsappMessageStatus.SENT,
      source: 'agent_web',
      text: data.text,
      chat: chat,
      commercial: chat.commercial,
      from: chat.contact_client,
      from_name: chat.name,
    });

    return await this.messageRepository.save(messageEntity);

  } catch (error) {
    console.error('WHAPI SEND FAILED:', error);

    // 🧠 fallback : message en échec mais sauvegardé
    const failedMessage = this.messageRepository.create({
      message_id: `failed_${Date.now()}`,
      chat_id: data.chat_id,
      commercial_id: data.commercial_id,
      direction: MessageDirection.OUT,
      from_me: true,
      timestamp: data.timestamp,
      status: WhatsappMessageStatus.FAILED,
      source: 'agent_web',
      text: data.text,
    });

    await this.messageRepository.save(failedMessage);
    throw error;
  }
}


  async findLastMessageByChatId(
    chatId: string,
  ): Promise<WhatsappMessage | null> {
    const messages = await this.messageRepository.find({
      where: { chat_id: chatId },
      order: { timestamp: 'DESC' },
      relations: ['chat', 'commercial'],
      take: 1,
    });

    return messages.length > 0 ? messages[0] : null;
  }

  async findByChatId(chatId: string): Promise<WhatsappMessage[]> {
    return this.messageRepository.find({
      where: { chat_id: chatId },
      relations: ['chat', 'commercial'],
      order: { timestamp: 'ASC' }, // ASC pour afficher du plus ancien au plus récent
      take: 100,
    });
  }

  async countUnreadMessages(
    chatId: string,
  ): Promise<number> {
    // Implémentez la logique pour compter les messages non lus
    return this.messageRepository.count({
      where: {
        chat_id: chatId,
        from_me: false,
        status: WhatsappMessageStatus.DELIVERED,
      },
    });
  }

  async create(message: Partial<WhatsappMessage>) {
    const messageEntity = this.messageRepository.create(message);
    return this.messageRepository.save(messageEntity);
  }

  findAll(chatId?: string) {
    if (chatId) {
      return this.messageRepository.find({ where: { chat_id: chatId }, relations: ['chat', 'commercial'], order: { timestamp: 'ASC' } });
    }
    return this.messageRepository.find();
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappMessage`;
  }

  async updateByStatus(status: { id: string; recipient_id: string; status: string }) {

    try {
      
       const messages= await this.messageRepository.findOne({
      where: { external_id: status.id, chat_id: status.recipient_id },
    });

    if (!messages) {
      console.log('Message not found for status update:', status.id);
      return null;
    }
      console.log("les info du status", messages);
    messages.status = status.status as WhatsappMessageStatus;

    console.log("les info du status======", messages);

    const result= await this.messageRepository.save(messages); 
    console.log("====== status======", result);

    } catch (error) {
      throw new Error(`Failed to update message status: ${String(error)}`);
    }
  };

   


  

  remove(id: string) {
    return `This action removes a #${id} whatsappMessage`;
  }
}


  // id: '29a7d7fc-8f3c-46cd-bfd1-dd1353cf8fb7',
  // commercial_id: '04b6c42f-5df8-4d93-8fd1-e1eb2c420ef7',
  // chat_id: '22584688680@s.whatsapp.net',
  // name: 'Test Whats',
  // type: 'private',
  // chat_pic: '',
  // chat_pic_full: '',
  // is_pinned: 'false',
  // is_muted: 'false',
  // mute_until: '0',
  // is_archived: 'false',
  // unread_count: '0',
  // unread_mention: 'false',
  // read_only: 'false',
  // not_spam: 'true',
  // last_activity_at: '1768295972494',
  // created_at: '1768295972494',
  // updated_at: '1768295972494',
  // createdAt: 2026-01-13T09:19:32.516Z,
  // updatedAt: 2026-01-13T09:19:32.516Z,
  // deletedAt: null
