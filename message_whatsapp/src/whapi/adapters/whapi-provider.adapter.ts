import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
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
  /**
   * Adaptateur universel FlowBot — s'enregistre comme '*' dans le registry.
   * Pour tout provider (meta, whapi, messenger, telegram, instagram),
   * l'envoi passe par OutboundRouterService, exactement comme les messages agents.
   */
  readonly provider = '*';
  readonly channelType = 'universal';

  private readonly logger = new Logger(WhapiProviderAdapter.name);

  constructor(
    private readonly commService: CommunicationWhapiService,
    private readonly outboundRouter: OutboundRouterService,
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
      markAsRead: false,
      media: true,
      templates: false,
      replyTo: true,
      windowHours: null,
    };
  }

  async sendMessage(msg: BotOutboundMessage): Promise<BotSendResult> {
    // Résoudre le channel_id (Whapi external ID, utilisé par OutboundRouterService)
    const channelId = await this.resolveChannelId(
      msg.context.providerChannelRef,
      msg.context.externalRef,
    );

    // Récupérer le label pour l'afficher dans le journal
    const channel = await this.channelRepo.findOne({ where: { channel_id: channelId } });

    // Le chat_id est au format "33612345678@s.whatsapp.net".
    // On extrait la partie avant "@" — chaque service provider attend des chiffres purs.
    const to = msg.context.externalRef.split('@')[0];

    const result = await this.outboundRouter.sendTextMessage({
      text: msg.text ?? '',
      to,
      channelId,
    });

    return {
      externalMessageRef: result.providerMessageId,
      sentAt: new Date(),
      channelLabel: channel?.label ?? channelId,
    };
  }

  /**
   * Résout le channel_id Whapi (externe) à utiliser pour l'envoi.
   *
   * Le message doit partir via le canal sur lequel la conversation est arrivée
   * (whatsapp_chat.channel_id). OutboundRouterService.sendTextMessage
   * attend ce même channel_id pour router vers le bon provider.
   *
   * Priorité :
   *  1. providerChannelRef fourni dans le contexte (cas webhook entrant)
   *  2. Lecture directe de whatsapp_chat.channel_id (cas polling jobs)
   *  3. Fallback ultime : premier channel disponible (avec warning)
   */
  private async resolveChannelId(
    providerChannelRef: string | undefined,
    chatId: string,
  ): Promise<string> {
    if (providerChannelRef) return providerChannelRef;

    const rows: Array<{ channel_id: string | null }> = await this.dataSource.query(
      'SELECT channel_id FROM `whatsapp_chat` WHERE chat_id = ? AND channel_id IS NOT NULL LIMIT 1',
      [chatId],
    );
    const channelIdFromChat = rows[0]?.channel_id;
    if (channelIdFromChat) {
      this.logger.debug(
        `resolveChannelId: channel_id=${channelIdFromChat} depuis whatsapp_chat pour chatId=${chatId}`,
      );
      return channelIdFromChat;
    }

    const fallback = await this.channelRepo.findOne({ where: {} });
    if (fallback) {
      this.logger.warn(
        `resolveChannelId: channel_id introuvable pour chatId=${chatId}, fallback channel_id=${fallback.channel_id}`,
      );
      return fallback.channel_id;
    }

    throw new Error(
      `WhapiProviderAdapter: aucun channel disponible pour envoyer à chatId=${chatId}`,
    );
  }

  // ─── Typing (Whapi uniquement — best-effort pour les autres providers) ─────

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
    // Non supporté via OutboundRouterService pour l'instant — no-op
  }

  async assignToAgent(ctx: BotConversationContext, agentRef?: string): Promise<void> {
    if (agentRef) {
      try {
        await this.chatService.update(ctx.externalRef, { poste_id: agentRef } as any);
        this.logger.log(`assignToAgent: ${ctx.externalRef} → agent ${agentRef}`);
      } catch (err) {
        this.logger.warn(
          `assignToAgent: impossible d'assigner ${ctx.externalRef} à ${agentRef}: ${(err as Error).message}`,
        );
      }
    }
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
