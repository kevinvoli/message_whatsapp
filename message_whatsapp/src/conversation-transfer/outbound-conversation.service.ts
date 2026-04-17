import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';

/**
 * P2.4 — Création d'une conversation outbound par un agent.
 *
 * Flow :
 * 1. Normalise le numéro en chat_id WhatsApp
 * 2. Trouve le canal associé au poste de l'agent (ou le premier canal actif)
 * 3. Crée la conversation en DB si elle n'existe pas
 * 4. Envoie le message via createAgentMessage (qui gère Whapi / Meta)
 */
@Injectable()
export class OutboundConversationService {
  private readonly logger = new Logger(OutboundConversationService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepo: Repository<WhatsappPoste>,

    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,

    private readonly messageService: WhatsappMessageService,
  ) {}

  async create(data: {
    phone: string;
    text: string;
    agentPosteId?: string | null;
  }): Promise<{ chat_id: string; id: string }> {
    const chatId = this.normalizeToChatId(data.phone);

    // 1. Trouver ou créer la conversation
    let chat = await this.chatRepo.findOne({ where: { chat_id: chatId } });

    // Trouver le canal approprié (poste dédié → premier canal actif)
    const channel = await this.resolveChannel(data.agentPosteId ?? null);

    if (!chat) {
      chat = this.chatRepo.create({
        chat_id: chatId,
        name: data.phone,
        status: WhatsappChatStatus.ACTIF,
        poste_id: data.agentPosteId ?? null,
        channel_id: channel?.channel_id ?? null,
      });
      chat = await this.chatRepo.save(chat);
      this.logger.log(`OUTBOUND_CHAT_CREATED chat_id=${chatId}`);
    }

    // 2. Envoyer le message
    await this.messageService.createAgentMessage({
      chat_id: chatId,
      text: data.text,
      poste_id: data.agentPosteId ?? null,
      timestamp: new Date(),
      channel_id: channel.id,
    });

    this.logger.log(`OUTBOUND_SENT chat_id=${chatId}`);
    return { chat_id: chatId, id: chat.id };
  }

  private normalizeToChatId(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (!digits || digits.length < 7 || digits.length > 20) {
      throw new BadRequestException('Numéro de téléphone invalide');
    }
    return `${digits}@s.whatsapp.net`;
  }

  private async resolveChannel(posteId: string | null): Promise<WhapiChannel> {
    if (posteId) {
      const dedicated = await this.channelRepo.findOne({
        where: { poste_id: posteId },
      });
      if (dedicated) return dedicated;
    }

    const fallback = await this.channelRepo.findOne({ where: {} });
    if (!fallback) throw new NotFoundException('Aucun canal disponible');
    return fallback;
  }
}
