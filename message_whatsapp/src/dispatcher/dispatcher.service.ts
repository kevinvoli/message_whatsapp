import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { WhatsappConversation } from '../whatsapp_conversation/entities/whatsapp_conversation.entity';
import { WhatsappConversationService } from '../whatsapp_conversation/whatsapp_conversation.service';
import { CreateWhatsappConversationDto } from '../whatsapp_conversation/dto/create-whatsapp_conversation.dto';
import { WhatsappCustomerService } from 'src/whatsapp_customer/whatsapp_customer.service';
import { WhatsappChat } from '../whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappCustomer } from 'src/whatsapp_customer/entities/whatsapp_customer.entity';

@Injectable()
export class DispatcherService {
  constructor(
    @InjectRepository(PendingMessage)
    private readonly pendingMessageRepository: Repository<PendingMessage>,
    private readonly queueService: QueueService,
    private readonly chatService: WhatsappChatService,
    private readonly customerService: WhatsappCustomerService
  ) {}

  async assignConversation(
    clientPhone: string,
    clientName: string,
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<WhatsappChat | null> {
    const nextAgent = await this.queueService.getNextInQueue();
      console.log(" 1   nextMessage =============================", nextAgent,clientPhone, clientName, content, messageType, mediaUrl);


    if (!nextAgent) {

      console.log("nextMessage =============================", nextAgent);
      
      await this.addPendingMessage(clientPhone, clientName, content, messageType, mediaUrl || '');
      
      return null;
    }

    let conversation = await this.chatService.findByChatId(clientPhone);

      console.log("conversation =============================", conversation);

    if (conversation) {
      if (conversation.assigned_agent_id !== nextAgent.id) {
        // Re-assign the conversation
        conversation.assigned_agent_id = nextAgent.id;
        conversation = await this.chatService.update(conversation.id, conversation);
      }
    } else {
   
      const customer = await this.customerService.findOne(clientPhone);
      let client: WhatsappCustomer;
      if (!customer) {
      client=  await  this.customerService.create({
           phone: clientPhone,
           name: clientName 
        });
      }
      const createDto: Partial<WhatsappChat> = {
        chat_id: clientPhone,
        customer_id: clientName, // This should be improved later
        assigned_agent_id: nextAgent.id,
        status: 'open',
        customer:(client)
      };
      conversation = await this.chatService.create(createDto);
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
