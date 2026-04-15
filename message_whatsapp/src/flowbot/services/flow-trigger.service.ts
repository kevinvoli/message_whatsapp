import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlowBot } from '../entities/flow-bot.entity';
import { FlowTrigger, FlowTriggerType } from '../entities/flow-trigger.entity';
import { BotConversation } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent } from '../events/bot-inbound-message.event';

@Injectable()
export class FlowTriggerService {
  private readonly logger = new Logger(FlowTriggerService.name);

  constructor(
    @InjectRepository(FlowBot)
    private readonly flowRepo: Repository<FlowBot>,
    @InjectRepository(FlowTrigger)
    private readonly triggerRepo: Repository<FlowTrigger>,
  ) {}

  /**
   * Trouve le flow le plus prioritaire dont un trigger correspond à l'événement entrant.
   * Les flows sont triés par priority DESC.
   */
  async findMatchingFlow(
    conv: BotConversation,
    event: BotInboundMessageEvent,
  ): Promise<{ flow: FlowBot; triggerType: FlowTriggerType } | null> {
    const flows = await this.flowRepo.find({
      where: { isActive: true },
      relations: ['triggers'],
      order: { priority: 'DESC' },
    });

    for (const flow of flows) {
      // Vérifier le scope provider/channel/context si défini
      if (flow.scopeChannelType && flow.scopeChannelType !== event.channelType) continue;
      if (flow.scopeProviderRef && flow.scopeProviderRef !== event.provider) continue;
      // CTX-D1 — filtre par contexte : si le flux est restreint à un contexte,
      // l'événement doit provenir de ce contexte (contextId propagé par CTX-D2)
      if (flow.scopeContextId && flow.scopeContextId !== event.contextId) continue;

      for (const trigger of flow.triggers) {
        if (!trigger.isActive) continue;
        const matched = this.evaluateTrigger(trigger, conv, event);
        if (matched) {
          this.logger.debug(
            `Flow match: flowId=${flow.id} trigger=${trigger.triggerType} chatRef=${conv.chatRef}`,
          );
          return { flow, triggerType: trigger.triggerType };
        }
      }
    }

    return null;
  }

  private evaluateTrigger(
    trigger: FlowTrigger,
    conv: BotConversation,
    event: BotInboundMessageEvent,
  ): boolean {
    switch (trigger.triggerType) {
      case FlowTriggerType.INBOUND_MESSAGE:
        return true;

      case FlowTriggerType.CONVERSATION_OPEN:
        return event.isNewConversation;

      case FlowTriggerType.CONVERSATION_REOPEN:
        return event.isReopened;

      case FlowTriggerType.OUT_OF_HOURS:
        return event.isOutOfHours;

      case FlowTriggerType.KEYWORD: {
        const keywords = (trigger.config.keywords as string[]) ?? [];
        const text = (event.messageText ?? '').toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      }

      case FlowTriggerType.ON_ASSIGN:
        return !!event.agentAssignedRef;

      default:
        // QUEUE_WAIT, NO_RESPONSE, INACTIVITY, SCHEDULE → gérés par les jobs de polling
        return false;
    }
  }
}
