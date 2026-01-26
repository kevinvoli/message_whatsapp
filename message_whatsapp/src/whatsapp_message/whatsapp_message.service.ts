import { Injectable, NotFoundException } from '@nestjs/common';
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
import { Whapi } from 'src/whapi/entities/whapi.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

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

    @InjectRepository(WhapiChannel)
    private readonly channalRepository: Repository<WhapiChannel>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  async sendMessageFromAgent(data: {
    chat_id: string;
    channel_id: string;
    text: string;
    commercial_id: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      const chat = await this.chatService.findByChatId(data.chat_id, data.channel_id);
      if (!chat) throw new Error('Chat not found');

      // Réintégration de la logique de mise à jour du chat
      chat.last_commercial_message_at = new Date();
      chat.unread_count = 0;
      await this.chatRepository.save(chat);

      // 1️⃣ Envoi réel vers WhatsApp
      function extractPhoneNumber(chatId: string): string {
        return chatId.split('@')[0];
      }

      await this.communicationWhapiService.sendToWhapiChannel({
        to: extractPhoneNumber(chat?.chat_id),
        text: data.text,
        channelId: chat.channel_id,
      });

      // La sauvegarde en base de données est maintenant gérée par le webhook
      // pour assurer que nous avons l'ID et le timestamp corrects de Whapi.
    } catch (error) {
      console.error('WHAPI SEND FAILED:', error);
      // On ne sauvegarde plus de message en échec ici,
      // car il n'y a pas de tentative de sauvegarde initiale.
      // Le webhook ne sera jamais appelé si l'envoi échoue,
      // donc aucune action supplémentaire n'est nécessaire.
      throw error;
    }
  }

  async findLastMessageByChatId(
    chatId: string,
    channelId: string,
  ): Promise<WhatsappMessage | null> {
    try {
      return this.messageRepository.findOne({
        where: { chat: { chat_id: chatId, channel_id: channelId }, from_me: false },
        order: { timestamp: 'DESC' },
        relations: ['chat', 'commercial', 'channel'],
      });
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }
  async findLastMessageByClientId(
    chatId: string,
  ): Promise<WhatsappMessage | null> {
    try {
      return await this.messageRepository.findOne({
        where: { chat: { chat_id: chatId }, from_me: false },
        order: { timestamp: 'DESC' },
        relations: { channel: true },
      });
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  async findByChatId(
    chatId: string,
    limit = 100,
    offset = 0,
  ): Promise<WhatsappMessage[]> {
    try {
      // 1️⃣ Marquer les messages reçus comme lus
      await this.messageRepository
        .createQueryBuilder()
        .update(WhatsappMessage)
        .set({ status: WhatsappMessageStatus.READ })
        .where('chat_id = :chatId', { chatId })
        .andWhere('direction = :direction', { direction: MessageDirection.IN })
        .andWhere('status != :status', {
          status: WhatsappMessageStatus.READ,
        })
        .execute();

      // 2️⃣ Récupérer les messages
      return await this.messageRepository.find({
        where: { chat: { chat_id: chatId } },
        relations: ['chat', 'commercial'],
        order: { timestamp: 'ASC' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new NotFoundException(error.message ?? error);
    }
  }

  async countUnreadMessages(chatId: string): Promise<number> {
    try {
      const count = await this.messageRepository.count({
        where: {
          chat: { chat_id: chatId },
          from_me: false,
          status: In([
            WhatsappMessageStatus.SENT,
            WhatsappMessageStatus.DELIVERED,
          ]),
        },
      });
      console.log('c=============compteur message =================', count);

      return count;
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  async create(message: CreateWhatsappMessageDto, commercialId?: string) {
    try {
      console.log('message reçue du dispache', message);

      const chat = await this.chatRepository.findOne({
        where: {
          chat_id: message.chat_id,
          channel_id: message.channel_id,
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

      const channel = await this.channalRepository.findOne({
        where: {
          channel_id: message.channel_id,
        },
      });

      if (!channel) return;

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
        direction: message.from_me ? MessageDirection.OUT : MessageDirection.IN,
        from_me: message.from_me,
        from: message.from,
        from_name: message.from_name,
        status: WhatsappMessageStatus.DELIVERED,
        timestamp: new Date(message.timestamp * 1000),
        source: message.source,
        channel: channel,
        chat: chat,
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
      where: { chat: { chat_id: chatId } },
    });
    return messages;
  }

  async findOne(id: string) {
    const message = await this.messageRepository.findOne({
      where: {
        message_id: id,
      },
    });

    if (!message) {
      return;
    }
    return message;
  }

  async updateByStatus(status: {
    id: string;
    recipient_id: string;
    status: string;
  }) {
    try {
      const messages = await this.messageRepository.findOne({
        where: { external_id: status.id, chat: { chat_id: status.recipient_id } },
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

  async saveFromWhapi(message: WhapiMessage, chat: WhatsappChat) {
    const channel = await this.channalRepository.findOne({
      where: {
        channel_id: message.channel_id,
      },
    });

    if (!channel) return;

    const existing = await this.messageRepository.findOne({
      where: { message_id: message.id },
    });

    if (existing) {
      // 🔁 replay Whapi → on ignore
      return existing;
    }

    const messagesss = await this.messageRepository.save(
      this.messageRepository.create({
        chat,
        channel: channel,
        message_id: message.id,
        external_id: message.id,
        direction: message.from_me ? MessageDirection.OUT : MessageDirection.IN,
        from_me: message.from_me,
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
