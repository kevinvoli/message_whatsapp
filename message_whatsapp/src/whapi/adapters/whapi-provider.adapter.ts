import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import {
  BotProviderAdapter,
  BotConversationContext,
  BotOutboundMessage,
  BotSendResult,
  ProviderCapabilities,
} from 'src/flowbot/interfaces/provider-adapter.interface';

@Injectable()
export class WhapiProviderAdapter implements BotProviderAdapter {
  readonly provider = 'whapi';
  readonly channelType = 'whatsapp';

  private readonly logger = new Logger(WhapiProviderAdapter.name);

  constructor(
    private readonly commService: CommunicationWhapiService,
    private readonly chatService: WhatsappChatService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
  ) {}

  capabilities(): ProviderCapabilities {
    return {
      typing: true,
      markAsRead: false,  // non implémenté côté Whapi pour l'instant
      media: true,
      templates: false,   // Whapi ne gère pas les templates HSM
      replyTo: true,
      windowHours: null,  // Pas de fenêtre 24h sur Whapi
    };
  }

  async sendMessage(msg: BotOutboundMessage): Promise<BotSendResult> {
    const channelId = await this.resolveChannelId(
      msg.context.providerChannelRef,
      msg.context.externalRef,
    );

    const result = await this.commService.sendToWhapiChannel({
      text: msg.text ?? '',
      to: msg.context.externalRef,
      channelId,
    });

    return {
      externalMessageRef: result.message.id,
      sentAt: new Date(),
    };
  }

  /**
   * Résout l'identifiant du channel Whapi à utiliser pour l'envoi.
   * Priorité :
   *  1. providerChannelRef fourni dans le contexte (cas normal — message déclenché par webhook entrant)
   *  2. Fallback : recherche du channel actif par chat_id dans whatsapp_chat (polling jobs)
   *  3. Fallback final : premier channel Whapi actif en base
   */
  private async resolveChannelId(
    providerChannelRef: string | undefined,
    chatId: string,
  ): Promise<string> {
    if (providerChannelRef) return providerChannelRef;

    // Fallback 1 — chercher le canal via la conversation (pour les polling jobs)
    const chatChannel = await this.channelRepo
      .createQueryBuilder('ch')
      .innerJoin('whatsapp_chat', 'wc', 'wc.channel_id = ch.channel_id')
      .where('wc.chat_id = :chatId', { chatId })
      .getOne();
    if (chatChannel) {
      this.logger.debug(
        `resolveChannelId: channel trouvé via whatsapp_chat pour chatId=${chatId} → channel_id=${chatChannel.channel_id}`,
      );
      return chatChannel.channel_id;
    }

    // Fallback 2 — premier channel actif disponible
    const fallback = await this.channelRepo.findOne({ where: {} });
    if (fallback) {
      this.logger.warn(
        `resolveChannelId: aucun channel trouvé pour chatId=${chatId}, utilisation du fallback channel_id=${fallback.channel_id}`,
      );
      return fallback.channel_id;
    }

    throw new Error(
      `WhapiProviderAdapter.sendMessage: aucun channel Whapi disponible pour envoyer à ${chatId}`,
    );
  }

  async sendTyping(ctx: BotConversationContext): Promise<void> {
    try {
      await this.commService.sendTyping(ctx.externalRef, true);
    } catch (err) {
      this.logger.warn(`sendTyping failed for ${ctx.externalRef}: ${(err as Error).message}`);
    }
  }

  async stopTyping(ctx: BotConversationContext): Promise<void> {
    try {
      await this.commService.sendTyping(ctx.externalRef, false);
    } catch (err) {
      this.logger.warn(`stopTyping failed for ${ctx.externalRef}: ${(err as Error).message}`);
    }
  }

  async markAsRead(_ctx: BotConversationContext): Promise<void> {
    // Non supporté via Whapi pour l'instant — no-op
  }

  async assignToAgent(ctx: BotConversationContext, agentRef?: string): Promise<void> {
    // L'assignation est gérée par l'événement BOT_ESCALATE_EVENT émis par le FlowEngine.
    // Le DispatcherService doit ajouter un listener sur 'bot.escalate' pour déclencher l'assignation.
    // Cette méthode peut directement forcer un poste si agentRef est fourni.
    if (agentRef) {
      try {
        await this.chatService.update(ctx.externalRef, { poste_id: agentRef } as any);
        this.logger.log(
          `assignToAgent: conversation ${ctx.externalRef} → agent ${agentRef}`,
        );
      } catch (err) {
        this.logger.warn(
          `assignToAgent: impossible d'assigner ${ctx.externalRef} à ${agentRef}: ${(err as Error).message}`,
        );
      }
    }
    // Pas d'agentRef → l'assignation automatique se fera via bot.escalate → DispatcherService
  }

  async closeConversation(ctx: BotConversationContext): Promise<void> {
    try {
      await this.chatService.update(ctx.externalRef, { status: 'fermé' } as any);
      this.logger.log(`closeConversation: ${ctx.externalRef} fermée`);
    } catch (err) {
      this.logger.warn(
        `closeConversation: impossible de fermer ${ctx.externalRef}: ${(err as Error).message}`,
      );
    }
  }

  async emitConversationUpdated(ctx: BotConversationContext): Promise<void> {
    this.eventEmitter.emit('bot.conversation.updated', {
      externalRef: ctx.externalRef,
      provider: ctx.provider,
      channelType: ctx.channelType,
    });
  }
}
