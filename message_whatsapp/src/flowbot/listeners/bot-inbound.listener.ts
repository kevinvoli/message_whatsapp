import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FlowEngineService } from '../services/flow-engine.service';
import {
  BOT_INBOUND_EVENT,
  BotInboundMessageEvent,
} from '../events/bot-inbound-message.event';

@Injectable()
export class BotInboundListener {
  constructor(private readonly flowEngine: FlowEngineService) {}

  @OnEvent(BOT_INBOUND_EVENT, { async: true })
  async handle(event: BotInboundMessageEvent): Promise<void> {
    await this.flowEngine.handleInbound(event);
  }
}
