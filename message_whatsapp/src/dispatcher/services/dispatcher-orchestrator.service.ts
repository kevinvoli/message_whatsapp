import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WhatsappChat, WhatsappChatStatus } from '../../whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from '../../whatsapp_commercial/entities/user.entity';
import { Repository } from 'typeorm';
import { AssignmentService } from './assignment.service';
import { QueueService } from './queue.service';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';

@Injectable()
export class DispatcherOrchestrator {
  private readonly logger = new Logger(DispatcherOrchestrator.name);

  constructor(
    private readonly assignmentService: AssignmentService,
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => WhatsappMessageService))
    private readonly messageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
  ) {}

  /**
   * ---------------------------------------------------------------------------------
   * ✅ POINT D'ENTRÉE PRINCIPAL
   * ---------------------------------------------------------------------------------
   * Orchestre l'assignation d'une conversation suite à un message entrant.
   */
  async handleIncomingMessage(payload: WhapiWebhookPayload) {
    const { messages } = payload;
    if (!messages || messages.length === 0) {
      return;
    }
    const firstMessage = messages[0];
    const contact = messages[0];

    // 1. Récupérer ou créer la conversation
    let chat = await this.findOrCreateChat(contact.chat_id, contact.from_name);

    // 2. Doit-on réassigner ? (commercial déconnecté)
    const needsReassignment =
      chat.commercial_id && !chat.commercial.isConnected;
    if (needsReassignment) {
      this.logger.log(
        `🏃‍♂️ Commercial ${chat.commercial.email} déconnecté. Réassignation...`,
      );
      const oldAgentId = chat.commercial_id;
      chat = await this.assignToNewCommercial(chat);
      if(oldAgentId) {
        this.messageGateway.emitConversationReassigned(oldAgentId, chat);
      }
    }

    // 3. Nouvelle conversation ? -> Assigner
    if (!chat.commercial_id) {
      chat = await this.assignToNewCommercial(chat);
      if(chat.commercial_id)
        this.messageGateway.emitNewConversationToAgent(chat.commercial_id, chat);
    }

    // 4. Mettre à jour la conversation et sauvegarder le message
    chat.unread_count += 1;
    chat.last_activity_at = new Date();
    await this.chatRepository.save(chat);

    const savedMessage = await this.messageService.saveIncomingFromWhapi(
      firstMessage,
      chat,
    );

    // 5. Émettre l'événement de nouveau message
    if(chat.commercial_id)
      this.messageGateway.emitMessageToAgent(chat.commercial_id, savedMessage);

    this.logger.log(`✅ Message de ${contact.from_name} traité pour ${chat.commercial.email}`);
  }

  /**
   * ---------------------------------------------------------------------------------
   * 👤 GESTION DE LA CONNEXION / DÉCONNEXION
   * ---------------------------------------------------------------------------------
   */
  async handleUserConnected(commercialId: string) {
    await this.commercialRepository.update(commercialId, { isConnected: true, lastConnectionAt: new Date() });
    await this.queueService.addToQueue(commercialId);
    this.logger.log(`🟢 Commercial ${commercialId} connecté et ajouté à la file.`);
    this.messageGateway.emitAgentStatusUpdate(commercialId, true);
  }

  async handleUserDisconnected(commercialId: string) {
    await this.commercialRepository.update(commercialId, { isConnected: false });
    await this.queueService.removeFromQueue(commercialId);

    // R2.2: Les conversations actives de l'agent sont mises en attente
    const assignedChats = await this.chatRepository.find({
      where: { commercial_id: commercialId, status: WhatsappChatStatus.ACTIF },
    });

    for (const chat of assignedChats) {
      chat.status = WhatsappChatStatus.EN_ATTENTE;
      await this.chatRepository.save(chat);
    }
    this.logger.log(
      `🔴 Commercial ${commercialId} déconnecté. ${assignedChats.length} conversations mises en attente.`,
    );
     this.messageGateway.emitAgentStatusUpdate(commercialId, false);
  }

  /**
   * ---------------------------------------------------------------------------------
   * 🛠️ MÉTHODES UTILITAIRES
   * ---------------------------------------------------------------------------------
   */

  private async assignToNewCommercial(
    chat: WhatsappChat,
  ): Promise<WhatsappChat> {
    const onlineQueue = await this.queueService.getQueuePositions();
    let selectedAgent: WhatsappCommercial | null = null;

    if (onlineQueue.length > 0) {
      // R1.1 - Attribution ONLINE via round-robin
      selectedAgent = this.assignmentService.findNextOnlineAgent(onlineQueue);
      if (selectedAgent) {
        await this.queueService.moveToEnd(selectedAgent.id);
        this.logger.log(`[ONLINE] Conversation assignée à ${selectedAgent.email}`);
      }
    } else {
      // R3 - Attribution OFFLINE
      const offlineAgents = await this.commercialRepository.find({
        where: { isConnected: false },
        relations: ['chats'],
      });
      selectedAgent = this.assignmentService.findNextOfflineAgent(offlineAgents);
       if (selectedAgent) {
        this.logger.log(`[OFFLINE] Conversation assignée à ${selectedAgent.email}`);
      }
    }

    if (!selectedAgent) {
      this.logger.error('🚨 Aucun commercial disponible pour assignation.');
      chat.status = WhatsappChatStatus.EN_ATTENTE;
      return chat;
    }

    chat.commercial = selectedAgent;
    chat.commercial_id = selectedAgent.id;
    chat.status = WhatsappChatStatus.ACTIF;
    chat.assigned_at = new Date();

    return this.chatRepository.save(chat);
  }

  private async findOrCreateChat(
    chatId: string,
    name: string,
  ): Promise<WhatsappChat> {
    const chat = await this.chatRepository.findOne({
      where: { chat_id: chatId },
      relations: ['commercial'],
    });

    if (chat) {
      return chat;
    }

    const newChat = this.chatRepository.create({
      chat_id: chatId,
      name: name,
      contact_client: chatId.split('@')[0],
      status: WhatsappChatStatus.EN_ATTENTE,
    });
    return this.chatRepository.save(newChat);
  }
}
