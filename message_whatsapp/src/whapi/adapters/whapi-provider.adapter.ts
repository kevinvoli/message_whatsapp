import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
   * Résout le channel_id Whapi à utiliser pour l'envoi.
   *
   * Règle : le message doit toujours partir via le canal sur lequel
   * la conversation est arrivée (whatsapp_chat.channel_id).
   *
   * Priorité :
   *  1. providerChannelRef fourni dans le contexte (webhook entrant — déjà le bon channel)
   *  2. Lecture directe de whatsapp_chat.channel_id via chat_id (polling jobs)
   *  3. Fallback ultime : premier channel disponible en base (avec warning)
   */
  private async resolveChannelId(
    providerChannelRef: string | undefined,
    chatId: string,
  ): Promise<string> {
    // Cas 1 — channel connu depuis le webhook entrant
    if (providerChannelRef) return providerChannelRef;

    // Cas 2 — retrouver le channel via whatsapp_chat (polling jobs)
    const rows: Array<{ channel_id: string | null }> = await this.dataSource.query(
      'SELECT channel_id FROM `whatsapp_chat` WHERE chat_id = ? AND channel_id IS NOT NULL LIMIT 1',
      [chatId],
    );
    const channelIdFromChat = rows[0]?.channel_id;
    if (channelIdFromChat) {
      this.logger.debug(
        `resolveChannelId: channel_id=${channelIdFromChat} récupéré depuis whatsapp_chat pour chatId=${chatId}`,
      );
      return channelIdFromChat;
    }

    // Cas 3 — fallback ultime (ne devrait pas arriver en production)
    const fallback = await this.channelRepo.findOne({ where: {} });
    if (fallback) {
      this.logger.warn(
        `resolveChannelId: channel_id introuvable pour chatId=${chatId}, fallback sur channel_id=${fallback.channel_id}`,
      );
      return fallback.channel_id;
    }

    throw new Error(
      `WhapiProviderAdapter: aucun channel Whapi disponible pour envoyer à chatId=${chatId}`,
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
