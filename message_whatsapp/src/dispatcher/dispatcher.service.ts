import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Repository } from 'typeorm';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,

    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
  ) {}

  /**
   * 🎯 Récupère ou crée une conversation
   * 🎯 Assigne un commercial si possible
   * ❌ Ne sauvegarde PAS le message
   * ❌ N’émet PAS de socket message
   */
  async assignConversation(data: {
    chat_id: string;
    from: string;
    from_name: string;
    type: string;
  }): Promise<WhatsappChat> {
    // 1️⃣ récupérer ou créer la conversation
    let conversation = await this.chatRepository.findOne({
      where: { chat_id: data.chat_id },
      relations: ['commercial'],
    });

    if (!conversation) {
      conversation = this.chatRepository.create({
        chat_id: data.chat_id,
        name: data.from_name,
        contact_client: data.from,
        type: data.type,
        status: WhatsappChatStatus.EN_ATTENTE,
        unread_count: 0,
        last_activity_at: new Date(),
      });

      conversation = await this.chatRepository.save(conversation);
    }

    // 2️⃣ conversation déjà assignée → simple update
    if (conversation.commercial_id) {
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      return this.chatRepository.save(conversation);
    }

    // 3️⃣ tenter une assignation
    const agent = await this.findAvailableCommercial();

    if (!agent) {
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      return this.chatRepository.save(conversation);
    }

    // 4️⃣ assignation
    conversation.commercial = agent;
    conversation.commercial_id = agent.id;
    conversation.status = WhatsappChatStatus.ACTIF;
    conversation.unread_count += 1;
    conversation.last_activity_at = new Date();
    conversation.assigned_at = new Date();

    this.logger.log(
      `📌 Conversation ${conversation.chat_id} assignée à ${agent.email}`,
    );

    return this.chatRepository.save(conversation);
  }

  /**
   * 🔍 Trouve un commercial disponible selon la charge réelle
   */
  async findAvailableCommercial(): Promise<WhatsappCommercial | null> {
    return this.commercialRepository
      .createQueryBuilder('c')
      .leftJoin('c.chats', 'chat', 'chat.status IN (:...statuses)', {
        statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
      })
      .where('c.isConnected = true')
      .groupBy('c.id')
      // .having('COUNT(chat.id) < c.max_limit_chat')
      .orderBy('c.lastConnectionAt', 'ASC')
      .getOne();
  }

  /**
   * 🔄 Utilisée par le worker de redistribution
   */
  async tryAssignConversation(conversation: WhatsappChat): Promise<boolean> {
    if (conversation.commercial_id) return true;

    const agent = await this.findAvailableCommercial();
    if (!agent) return false;

    conversation.commercial = agent;
    conversation.commercial_id = agent.id;
    conversation.status = WhatsappChatStatus.ACTIF;
    conversation.assigned_at = new Date();

    await this.chatRepository.save(conversation);

    this.logger.log(
      `✅ Conversation ${conversation.chat_id} redispatchée vers ${agent.email}`,
    );

    this.messageGateway.emitIncomingConversation(conversation);

    return true;
  }
}
