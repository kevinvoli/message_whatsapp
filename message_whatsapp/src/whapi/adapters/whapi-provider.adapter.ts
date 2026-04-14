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
    const channelId = msg.context.providerChannelRef;

    if (!channelId) {
      throw new Error(
        `WhapiProviderAdapter.sendMessage: providerChannelRef manquant pour externalRef=${msg.context.externalRef}`,
      );
    }

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
