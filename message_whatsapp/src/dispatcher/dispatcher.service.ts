import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Repository } from 'typeorm';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import {
  PendingMessage,
  PendingMessageStatus,
} from './entities/pending-message.entity';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    private readonly queueService: QueueService,

    @InjectRepository(PendingMessage)
    private readonly pendinMessageRepository: Repository<PendingMessage>,

    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,

    private readonly whatsappCommercialService: WhatsappCommercialService,
  ) {}

  /**
   * 🎯 Décide si un message peut être assigné à un agent
   * ❌ N’émet PAS de socket
   * ❌ Ne sauvegarde PAS le message WhatsApp
   */

  async assignConversation(
    clientPhone: string,
    clientName: string,
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<WhatsappChat | null> {
    // 🔎 Chercher la conversation existante
    let conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
      relations: ['commercial', 'messages'],
    });

    // console.log(conversation);

    // Déterminer si l'agent actuel est connecté
    const currentAgentId = conversation?.commercial?.id;
    const isAgentConnected = currentAgentId
      ? this.messageGateway.isAgentConnected(currentAgentId)
      : false;

    /**
     * Cas 1️⃣ : conversation existante + agent connecté
     * → juste mettre à jour l’activité et le compteur de messages non lus
     */
    if (conversation && isAgentConnected) {
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      if (conversation.status === WhatsappChatStatus.FERME) {
        conversation.status = WhatsappChatStatus.ACTIF;
      }
      if (!conversation.commercial) {
        this.logger.warn(
          `📩 Conversation ${conversation.chat_id} sans commercial (réinjection ou offline)`,
        );
      }
      this.logger.log(
        `📩 Conversation (${conversation.chat_id}) assignée à ${conversation?.commercial?.email ?? 'NON ASSIGNE'}`,
      );
      return this.chatRepository.save(conversation);
    }

    /**
     * Cas 2️⃣ : chercher le prochain agent disponible
     */
     console.log('______==__________il ne doit pas entre ici___________________');
    const nextAgent = await this.queueService.getNextInQueue();
 console.log('______==__________il ne doit pas entre ici___________________');
    // Aucun agent disponible → message en attente
    if (!nextAgent) {
      this.logger.warn(
        `⏳ Aucun agent disponible, message en attente pour `,
      );
      console.log('________________il ne doit pas entre ici___________________');
      
      return null;
    }

    console.log('______==__________il ne doit pas entre ici___________________');
    /**
     * Cas 3️⃣ : conversation existante mais agent absent ou réassignation
     */
    console.log("conversation :",conversation);
    
    if (conversation) {
      this.logger.log(
        `🔁 Réassignation conversation (${conversation.chat_id}) de l'agent (${conversation.commercial?.email || 'aucun'}) à (${nextAgent.email})`,
      );
      conversation.commercial = nextAgent;
      conversation.commercial_id = nextAgent.id;
      conversation.status = WhatsappChatStatus.EN_ATTENTE;
      conversation.unread_count = 1;
      conversation.last_activity_at = new Date();
      conversation.assigned_at = new Date();
      conversation.assigned_mode = 'ONLINE';
      conversation.first_response_deadline_at = new Date(
        Date.now() + 5 * 60 * 1000,
      );
      return this.chatRepository.save(conversation);
    }

    /**
     * Cas 4️⃣ : nouvelle conversation
     */
    this.logger.log(
      `🆕 Création nouvelle conversation pour ${clientPhone} avec agent (${nextAgent.email})`,
    );

    const newChat = this.chatRepository.create({
      chat_id: clientPhone,
      name: clientName,
      type: 'private',
      contact_client: clientPhone,
      commercial: nextAgent,
      commercial_id: nextAgent.id,
      status: WhatsappChatStatus.EN_ATTENTE,
      unread_count: 1,
      last_activity_at: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      assigned_at: new Date(),
      assigned_mode: 'ONLINE',
      first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
      last_client_message_at: new Date(),
    });

    console.log('mes message', newChat);

    return this.chatRepository.save(newChat);
  }

  async distributePendingMessages(forAgentId?: string): Promise<void> {
    // Récupérer tous les messages en attente (avec leur message réel)
    const pendingMessages = await this.pendinMessageRepository.find({
      where: forAgentId ? { status: PendingMessageStatus.WAITING } : undefined,
      order: { receivedAt: 'ASC' },
      relations: ['message'], // On charge le message réel
    });

    for (const pending of pendingMessages) {
      const realMessage = pending.message;

      // 🔒 Vérifier que le message réel existe toujours
      if (!realMessage) {
        // Message réel supprimé, on supprime le pending
        await this.pendinMessageRepository.remove(pending);
        continue;
      }

      // 🔹 Assigner la conversation via le dispatcher
      const conversation = await this.assignConversation(
        realMessage.chat_id, // Phone du client depuis le message réel
        realMessage.from_name ?? 'Client', // Nom du client
        realMessage.text ?? pending.content, // Contenu du message réel, fallback si absent
        pending.type, // Type du pending message
        pending.mediaUrl, // Media du pending
      );

      if (conversation) {
        // ✅ Une fois distribué, on supprime le pending
        await this.pendinMessageRepository.remove(pending);
      }
    }
  }

  async reinjectConversation(chat: WhatsappChat) {
    await this.chatRepository.update(chat.id, {
      commercial: null,
      commercial_id: null,
      assigned_mode: null,
      assigned_at: null,
      first_response_deadline_at: null,
    });

    // Relancer le dispatcher SANS faux message
    await this.dispatchExistingConversation(chat);
  }

  async dispatchExistingConversation(chat: WhatsappChat) {
    const nextAgent = await this.queueService.getNextInQueue();
    if (!nextAgent) return;

    await this.chatRepository.update(chat.id, {
      commercial: nextAgent,
      commercial_id: nextAgent.id,
      assigned_mode: nextAgent.isConnected ? 'ONLINE' : 'OFFLINE',
      assigned_at: new Date(),
      first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
    });

    this.messageGateway.emitConversationReassigned(chat.chat_id);
  }
}
