import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { WhatsappChat, WhatsappChatStatus } from "src/whatsapp_chat/entities/whatsapp_chat.entity";
import { Repository } from "typeorm";
import { DispatcherService } from "../dispatcher.service";

@Injectable()
export class ConversationRedispatchWorker {
  private readonly logger = new Logger(ConversationRedispatchWorker.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly dispatcherService: DispatcherService,
  ) {}

  async run(): Promise<void> {
    // 1️⃣ récupérer les conversations en attente
    const pendingChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE },
      order: { last_activity_at: 'ASC' },
    });

    if (!pendingChats.length) return;

    this.logger.log(`🔄 Redistribution de ${pendingChats.length} conversations`);

    // 2️⃣ tenter l’assignation une par une
    for (const chat of pendingChats) {
      // sécurité : recharger l’état
      const freshChat = await this.chatRepository.findOne({
        where: { id: chat.id },
      });

      if (!freshChat || freshChat.commercial_id) continue;

      const assigned = await this.dispatcherService.tryAssignConversation(
        freshChat,
      );

      if (!assigned) break; // plus aucun agent dispo → stop
    }
  }



}
