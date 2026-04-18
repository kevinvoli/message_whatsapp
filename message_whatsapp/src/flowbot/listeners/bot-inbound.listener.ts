import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FlowEngineService } from '../services/flow-engine.service';
import {
  BOT_INBOUND_EVENT,
  BotInboundMessageEvent,
} from '../events/bot-inbound-message.event';

@Injectable()
export class BotInboundListener {
  private readonly logger = new Logger(BotInboundListener.name);

  constructor(private readonly flowEngine: FlowEngineService) {}

  @OnEvent(BOT_INBOUND_EVENT, { async: true })
  async handle(event: BotInboundMessageEvent): Promise<void> {
    try {
      await this.flowEngine.handleInbound(event);
    } catch (err) {
      this.logger.error(
        `BotInboundListener: erreur non gérée pour chatRef=${event.conversationExternalRef} — ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
