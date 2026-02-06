import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { ChannelService } from 'src/channel/channel.service';
import { ContactService } from 'src/contact/contact.service';

@Injectable()
export class WhatsappMessageService {
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  private readonly logger = new Logger(WhatsappMessageService.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    private readonly chatService: WhatsappChatService,
    private readonly communicationWhapiService: CommunicationWhapiService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    private readonly channelService: ChannelService,
    private readonly contactService: ContactService,

    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}
  

  async createAgentMessage(data: {
    chat_id: string;
    text: string;
    poste_id: string;
    timestamp: Date;
    channel_id: string;
  }): Promise<WhatsappMessage> {
    try {

      const chat = await this.chatService.findBychat_id(data.chat_id);
      if (!chat) throw new Error('Chat not found');

      const lastMessage = await this.findLastMessageBychat_id(data.chat_id);

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
      function extractPhoneNumber(chat_id: string): string {
        return chat_id.split('@')[0];
      }
      const whapiResponse =
        await this.communicationWhapiService.sendToWhapiChannel({
          to: extractPhoneNumber(chat?.chat_id),
          text: data.text,
          channelId: data.channel_id,
        });

      const channel = await this.channelService.findOne(data.channel_id);
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }

      console.log("=========",whapiResponse,"+++++++");
      
      // 2️⃣ Création message DB
      const messageEntity = this.messageRepository.create({
        message_id: whapiResponse.message.id ?? `agent_${Date.now()}`,
        external_id: whapiResponse.message.id,
        poste_id: data.poste_id,
        direction: MessageDirection.OUT,
        from_me: true,
        timestamp: data.timestamp,
        status: WhatsappMessageStatus.SENT,
        source: 'agent_web',
        text: data.text,
        chat: chat,
        poste: chat.poste ?? undefined,
        from: extractPhoneNumber(chat?.chat_id),
        from_name: chat.name,
        channel: channel,
        contact: null,
      });

      

      const mes = await this.messageRepository.save(messageEntity);
      await this.chatRepository.update(
        { chat_id: chat.chat_id },
        {
          unread_count: 0,
          last_poste_message_at: messageEntity.createdAt,
          last_activity_at: new Date(),
        },
      );

      return mes;
    } catch (error) {
      console.error('WHAPI SEND FAILED:', error);

      
      // 🧠 fallback : message en échec mais sauvegardé
      // const failedMessage = this.messageRepository.create({
      //   message_id: `failed_${Date.now()}`,
      //   chat_id: data.chat_id,
      //   poste_id: data.poste_id,
      //   direction: MessageDirection.OUT,
      //   from_me: true,
      //   timestamp: data.timestamp,
      //   status: WhatsappMessageStatus.FAILED,
      //   source: 'agent_web',
      //   text: data.text,
      // });

      // await this.messageRepository.save(failedMessage);
      console.error('WHAPI SEND FAILED:', error);
      throw error;
      // throw error;
    }
  }

  async typingStart(chat_id:string){
    await this.communicationWhapiService.sendTyping(chat_id,true)
  }




  async findLastMessageBychat_id(
    chat_id: string,
  ): Promise<WhatsappMessage | null> {

    try {
      return this.messageRepository.findOne({
        where: { chat_id: chat_id },
        order: { timestamp: 'DESC' },
        relations: ['chat', 'poste','medias'],
      });
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  async findBychat_id(
    chat_id: string,
    limit = 100,
    offset = 0,
  ): Promise<WhatsappMessage[]> {
    try {
      // 1️⃣ Marquer les messages reçus comme lus
      await this.messageRepository
        .createQueryBuilder()
        .update(WhatsappMessage)
        .set({ status: WhatsappMessageStatus.READ })
        .where('chat_id = :chat_id', { chat_id })
        .andWhere('direction = :direction', { direction: MessageDirection.IN })
        .andWhere('status != :status', {
          status: WhatsappMessageStatus.READ,
        })
        .execute();

      // 2️⃣ Récupérer les messages
      const mess = await this.messageRepository.find({
        where: { chat_id: chat_id },
        relations: ['chat', 'poste','medias'],
        order: { timestamp: 'ASC' },
        take: limit,
        skip: offset,
      });
      return mess;
    } catch (error) {
      throw new NotFoundException(error.message ?? error);
    }
  }

  async countUnreadMessages(chat_id: string): Promise<number> {
    try {
      const count = await this.messageRepository.count({
        where: {
          chat_id: chat_id,
          from_me: false,
          status: In([
            WhatsappMessageStatus.SENT,
            WhatsappMessageStatus.DELIVERED,
          ]),
        },
      });
      // console.log('c=============compteur message =================', count);

      return count;
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  async createInternalMessage(message: any, commercialId?: string) {
    try {
      console.log('message reçue du dispache', message);
      const chat = await this.chatRepository.findOne({
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

  async findAll(chat_id: string) {
    const messages = await this.messageRepository.find({
      where: { chat_id: chat_id },
      relations:{
        medias:true,
        poste:true,
        chat:true
      }
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
      // console.log('les info du status', messages);
      messages.status = status.status as WhatsappMessageStatus;

      // console.log('les info du status======', messages);

      const result = await this.messageRepository.save(messages);
      // console.log('====== status======', result);
    } catch (error) {
      throw new Error(`Failed to update message status: ${String(error)}`);
    }
  }

  async saveIncomingFromWhapi(message: WhapiMessage, chat: WhatsappChat):Promise<WhatsappMessage> {

    try {
      const channel = await this.channelService.findOne(message.channel_id);


      if (!channel ) {
        // Utilisez une exception métier appropriée
        throw new Error(`Channel ${message.channel_id} non trouvé`);
      }



      const contact = await this.contactService.findOrCreate(
        message.from,
        message.chat_id,
        message.from_name ?? message.from,
      );


      if (!message.from_me) {
        chat.last_msg_client_channel_id = channel.channel_id;
        chat.channel_id = channel.channel_id;
      }
      
      await this.chatRepository.save(chat);

      const messagesss = await this.messageRepository.save(
        this.messageRepository.create({
          channel: channel,
          chat:chat,
          contact_id: contact?.id,
          message_id: message.id,
          external_id: message.id,
          direction: MessageDirection.IN,
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
    } catch (error) {
      // Log de l'erreur (important pour le débogage)
      this.logger.error(
        `Erreur lors de la sauvegarde du message: ${error.message}`,
        error.stack,
      );

      // Relancez l'erreur pour la gérer plus haut
      // ou lancez une exception métier personnalisée
      throw new Error(`Impossible de sauvegarder le message: ${error.message}`);
    }
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMessage`;
  }

  async findOneWithMedias(id: string) {
  return this.messageRepository.findOne({
    where: { id },
    relations: {
      medias: true,
      chat:true,
      poste:true,
      contact:true
    },
  });
}
}
