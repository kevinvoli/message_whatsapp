import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { WhatsappMessageGateway } from '../whatsapp_message/whatsapp_message.gateway';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CreateWhatsappChatDto } from 'src/whatsapp_chat/dto/create-whatsapp_chat.dto';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
// import { CreateWhatsappChatDto } from 'src/whatsapp_chat/dto/create-whatsapp_chat.dto';

@Injectable()
export class DispatcherService {
 
  constructor(
    @InjectRepository(PendingMessage)
    private readonly pendingMessageRepository: Repository<PendingMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,

    private readonly WhatsappCommercialService: WhatsappCommercialService,
  ) {}

  async assignConversation(
    clientPhone: string,
    clientName: string,
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<WhatsappChat | null> {
    let conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
      relations: ['commercial', 'messages']
    });

    console.log("new message arrive", clientName);

    // If conversation exists and its agent is connected, do nothing.
  const  isConnected :boolean    =(conversation)? await this.WhatsappCommercialService.findStatus(conversation.commercial.id): false

  console.log("log des connecté",isConnected);


     if (
      conversation &&
      conversation.commercial &&
      isConnected &&
      this.messageGateway.isAgentConnected(conversation.commercial.id)
    )
    {
  conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      if (conversation.status === 'fermé') {
        conversation.status = 'actif';
      }
      return this.chatRepository.save(conversation);
    }



    const nextAgent = await this.queueService.getNextInQueue();

    if (!nextAgent) {
      await this.addPendingMessage(
        clientPhone,
        clientName,
        content,
        messageType,
        mediaUrl || '',
      );
      return null;
    }
    console.log("New Proprio", nextAgent);



    if (conversation) {
      // Re-assign the conversation if the agent is different or disconnected
     conversation.commercial_id = nextAgent.id;
      conversation.status = WhatsappChatStatus.EN_ATTENTE;
      conversation.unread_count = 1;
      conversation.last_activity_at = new Date();
      return this.chatRepository.save(conversation);
    } else {
      // Create a new conversation
      const createDto: CreateWhatsappChatDto = {
         chat_id: clientPhone,
        name: clientName,
        commercial_id: nextAgent.id,
        status: WhatsappChatStatus.EN_ATTENTE,
        type: 'private', // Assuming 'private' as a default type
        unread_count: 1,
        last_activity_at: new Date(),
      };


       const newChat = this.chatRepository.create(createDto);
      return this.chatRepository.save(newChat);

      // const existingChat = await this.chatRepository.findOne({
      //   where: { chat_id: createDto.chat_id },
      // });
      // if (existingChat) {
      //   // Mettez à jour le chat existant
      //   await this.chatRepository.update(existingChat.id, createDto);
      //   // Récupérez l'entité mise à jour
      //   return await this.chatRepository.findOne({
      //     where: { id: existingChat.id },
      //   });
      // } else {
      //   // Créez un nouveau chat
      //   const newChat = this.chatRepository.create(createDto);
      //   return await this.chatRepository.save(newChat);
      // }
    }

    return conversation;
  }

  async addPendingMessage(
    clientPhone: string,
    clientName: string,
    content: string,
    type: string,
    mediaUrl: string,
  ): Promise<PendingMessage> {
    const pendingMessage = this.pendingMessageRepository.create({
      clientPhone,
      clientName,
      content,
      type,
      mediaUrl,
    });
    return this.pendingMessageRepository.save(pendingMessage);
  }

  async distributePendingMessages(): Promise<void> {
    const pendingMessages = await this.pendingMessageRepository.find();
    for (const message of pendingMessages) {
      const conversation = await this.assignConversation(
        message.clientPhone,
        message.clientName,
        message.content,
        message.type,
        message.mediaUrl,
      );
      if (conversation) {
        await this.pendingMessageRepository.remove(message);
      }
    }
  }
}
