import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
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
export class MetaProviderAdapter implements BotProviderAdapter {
  readonly provider = 'meta';
  readonly channelType = 'whatsapp';

  private readonly logger = new Logger(MetaProviderAdapter.name);

  constructor(
    private readonly metaService: CommunicationMetaService,
    private readonly chatService: WhatsappChatService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
  ) {}

  capabilities(): ProviderCapabilities {
    return {
      typing: false,      // Meta Cloud API ne supporte pas les indicateurs de frappe
      markAsRead: false,  // Non implémenté
      media: true,
      templates: true,    // Meta supporte les templates HSM
      replyTo: false,     // La citation n'est pas utilisée pour le FlowBot
      windowHours: 24,    // ⚠️ Messages libres uniquement dans la fenêtre de 24h
    };
  }

  async sendMessage(msg: BotOutboundMessage): Promise<BotSendResult> {
    const channel = await this.resolveChannel(msg.context);

    const result = await this.metaService.sendTextMessage({
      text: msg.text ?? '',
      to: msg.context.externalRef,
      phoneNumberId: channel.external_id!,
      accessToken: channel.token,
    });

    this.logger.log(
      `MetaProviderAdapter.sendMessage → ${msg.context.externalRef} id=${result.providerMessageId}`,
    );

    return {
      externalMessageRef: result.providerMessageId,
      sentAt: new Date(),
    };
  }

  async sendTyping(_ctx: BotConversationContext): Promise<void> {
    // Meta Cloud API ne supporte pas les indicateurs de frappe — no-op
  }

  async stopTyping(_ctx: BotConversationContext): Promise<void> {
    // no-op
  }

  async markAsRead(_ctx: BotConversationContext): Promise<void> {
    // Non implémenté — no-op
  }

  async assignToAgent(ctx: BotConversationContext, agentRef?: string): Promise<void> {
    if (agentRef) {
      try {
        await this.chatService.update(ctx.externalRef, { poste_id: agentRef } as any);
        this.logger.log(
          `MetaProviderAdapter.assignToAgent: ${ctx.externalRef} → agent ${agentRef}`,
        );
      } catch (err) {
        this.logger.warn(
          `MetaProviderAdapter.assignToAgent: impossible d'assigner ${ctx.externalRef} → ${agentRef}: ${(err as Error).message}`,
        );
      }
    }
  }

  async closeConversation(ctx: BotConversationContext): Promise<void> {
    try {
      await this.chatService.update(ctx.externalRef, { status: 'fermé' } as any);
      this.logger.log(`MetaProviderAdapter.closeConversation: ${ctx.externalRef} fermée`);
    } catch (err) {
      this.logger.warn(
        `MetaProviderAdapter.closeConversation: impossible de fermer ${ctx.externalRef}: ${(err as Error).message}`,
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Résout le canal Meta depuis le contexte de la conversation.
   * Le `providerChannelRef` est le `channel_id` stocké dans WhapiChannel.
   * Throws si le canal est introuvable ou mal configuré.
   */
  private async resolveChannel(ctx: BotConversationContext): Promise<WhapiChannel> {
    let channel: WhapiChannel | null = null;

    if (ctx.providerChannelRef) {
      channel = await this.channelRepo.findOne({
        where: { channel_id: ctx.providerChannelRef, provider: 'meta' },
      });
    }

    if (!channel) {
      // Fallback : prendre le premier canal Meta disponible
      channel = await this.channelRepo.findOne({ where: { provider: 'meta' } });
    }

    if (!channel) {
      throw new Error(
        `MetaProviderAdapter: aucun canal Meta configuré pour externalRef=${ctx.externalRef}`,
      );
    }

    if (!channel.external_id || !channel.token) {
      throw new Error(
        `MetaProviderAdapter: canal Meta "${channel.channel_id}" sans phoneNumberId ou accessToken`,
      );
    }

    return channel;
  }
}
