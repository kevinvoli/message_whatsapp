import { Injectable } from '@nestjs/common';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp_message.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhapiMessage } from 'src/whapi/interface/whapi-webhook.interface';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class WhatsappMessageService {
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    private readonly chatService: WhatsappChatService,
    private readonly communicationWhapiService: CommunicationWhapiService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  async createAgentMessage(data: {
    chat_id: string;
    text: string;
    commercial_id: string;
    timestamp: Date;
  }): Promise<WhatsappMessage> {
    console.log("qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",data);
    
    try {
      const chat = await this.chatService.findByChatId(data.chat_id);
      if (!chat) throw new Error('Chat not found');
      // console.log('chat a envoie', chat);

      const lastMessage = await this.findLastMessageByChatId(data.chat_id);
      if (lastMessage && !lastMessage.from_me) {
        const now = new Date();
        const lastMessageDate = new Date(lastMessage.timestamp);
        const diff = now.getTime() - lastMessageDate.getTime();
        const diffHours = Math.ceil(diff / (1000 * 60 * 60));
        if (diffHours > 24) {
          throw new Error('Response timeout');
        }
      }

      // 1️⃣ Envoi réel vers WhatsApp
      function extractPhoneNumber(chatId: string): string {
        return chatId.split('@')[0];
      }
      const whapiResponse = await this.communicationWhapiService.sendToWhapi(
        extractPhoneNumber(chat?.chat_id),
        data.text,
      );

      // 2️⃣ Création message DB
      const messageEntity = this.messageRepository.create({
        message_id: whapiResponse.id ?? `agent_${Date.now()}`,
        external_id: whapiResponse.id,
        chat_id: data.chat_id,
        commercial_id: data.commercial_id,
        direction: MessageDirection.OUT,
        from_me: true,
        timestamp: data.timestamp,
        status: WhatsappMessageStatus.SENT,
        source: 'agent_web',
        text: data.text,
        chat: chat,
        commercial: chat.commercial,
        from: extractPhoneNumber(chat?.chat_id),
        from_name: chat.name,
      });

      const mes= await this.messageRepository.save(messageEntity);

      return mes
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
    return this.messageRepository.findOne({
      where: { chat_id: chatId },
      order: { timestamp: 'DESC' },
      relations: ['chat', 'commercial'],
    });
  }

  async findByChatId(
    chatId: string,
    limit = 100,
    offset = 0,
  ): Promise<WhatsappMessage[]> {
    return this.messageRepository.find({
      where: { chat_id: chatId },
      relations: ['chat', 'commercial'],
      order: { timestamp: 'ASC' },
      take: limit,
      skip: offset,
    });
  }

  async countUnreadMessages(chatId: string): Promise<number> {
    return this.messageRepository.count({
      where: {
        chat_id: chatId,
        from_me: false,
        status: In([
          WhatsappMessageStatus.SENT,
          WhatsappMessageStatus.DELIVERED,
        ]),
      },
    });
  }

  async create(message: CreateWhatsappMessageDto, commercialId?: string) {
    try {
      console.log('message reçue du dispache', message);
      // let chat;
      //       if (commercialId) {
      //   chat= await this.chatService.findOrCreateChat(
      //         message.chat_id,
      //         message.from,
      //         message.from_name,
      //         commercialId,
      //       );
      //       }

      const chat = await this.chatRepository.find({
        where: {
          chat_id: message.chat_id,
        },
      });

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

      const commercial = await this.commercialRepository.findOne({
        where: {
          id: commercialId,
        },
      });

      if (!commercial) {
        return null;
      }

      const data: Partial<WhatsappMessage> = {
        message_id: message.id,
        external_id: message.id,
        chat_id: message.chat_id,
        direction: message.from_me ? MessageDirection.OUT : MessageDirection.IN,
        from_me: message.from_me,
        from: message.from,
        from_name: message.from_name,
        status: WhatsappMessageStatus.DELIVERED,
        timestamp: new Date(message.timestamp * 1000),
        source: message.source,
      };

      const messageEntity = this.messageRepository.create(data);

      return this.messageRepository.save(messageEntity);
    } catch (error) {
      console.error('Error creating message:', error);
      throw new Error(`Failed to create message: ${error}`);
    }
  }

  async findAll(chatId: string) {
    const messages = await this.messageRepository.find({
      where: { chat_id: chatId },
    });
    return messages;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappMessage`;
  }

  async updateByStatus(status: {
    id: string;
    recipient_id: string;
    status: string;
  }) {
    try {
      const messages = await this.messageRepository.findOne({
        where: { external_id: status.id, chat_id: status.recipient_id },
      });

      if (!messages) {
        console.log('Message not found for status update:', status.id);
        return null;
      }
      console.log('les info du status', messages);
      messages.status = status.status as WhatsappMessageStatus;

      console.log('les info du status======', messages);

      const result = await this.messageRepository.save(messages);
      console.log('====== status======', result);
    } catch (error) {
      throw new Error(`Failed to update message status: ${String(error)}`);
    }
  }

  async saveIncomingFromWhapi(message: WhapiMessage, chat: WhatsappChat) {
    const messagesss = await this.messageRepository.save(
      this.messageRepository.create({
        chat,
        message_id: message.id,
        external_id: message.id,
        direction: MessageDirection.IN,
        from_me: false,
        from: message.from,
        from_name: message.from_name,
        text: message.text?.body ?? '',
        type: message.type,
        timestamp: new Date(message.timestamp * 1000),
        status: WhatsappMessageStatus.SENT,
        source: 'whapi',
      }),
    );
    return messagesss;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMessage`;
  }
}
