import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlowBot } from '../entities/flow-bot.entity';
import { FlowTrigger, FlowTriggerType } from '../entities/flow-trigger.entity';
import { BotConversation } from '../entities/bot-conversation.entity';
import { FlowEngineService } from '../services/flow-engine.service';
import { FlowSessionService } from '../services/flow-session.service';
import { BotConversationService } from '../services/bot-conversation.service';

export interface LabelAddedEvent {
  chatId: string;       // chat_id (whatsapp)
  chatRef: string;      // référence externe
  labelId: string;
  tenantId: string;
  provider: string;
  channelType: string;
}

export interface SlaBreachEvent {
  chatId: string;
  chatRef: string;
  tenantId: string;
  provider: string;
  channelType: string;
  metric: string;
  thresholdSeconds: number;
  currentValueSeconds: number;
}

/**
 * P6.2 — Listener pour les triggers FlowBot étendus (LABEL_ADDED, SLA_BREACH).
 */
@Injectable()
export class FlowBotExtensionListener {
  private readonly logger = new Logger(FlowBotExtensionListener.name);

  constructor(
    @InjectRepository(FlowBot)
    private readonly flowRepo: Repository<FlowBot>,
    @InjectRepository(FlowTrigger)
    private readonly triggerRepo: Repository<FlowTrigger>,
    @InjectRepository(BotConversation)
    private readonly convRepo: Repository<BotConversation>,
    private readonly engineService: FlowEngineService,
    private readonly sessionService: FlowSessionService,
    private readonly botConvService: BotConversationService,
  ) {}

  @OnEvent('label.added', { async: true })
  async onLabelAdded(event: LabelAddedEvent): Promise<void> {
    await this.handleExternalTrigger(
      FlowTriggerType.LABEL_ADDED,
      event.chatRef,
      event.provider,
      event.channelType,
      { labelId: event.labelId, tenantId: event.tenantId },
    );
  }

  @OnEvent('sla.breach', { async: true })
  async onSlaBreach(event: SlaBreachEvent): Promise<void> {
    await this.handleExternalTrigger(
      FlowTriggerType.SLA_BREACH,
      event.chatRef,
      event.provider,
      event.channelType,
      { metric: event.metric, thresholdSeconds: event.thresholdSeconds, tenantId: event.tenantId },
    );
  }

  private async handleExternalTrigger(
    triggerType: FlowTriggerType,
    chatRef: string,
    provider: string,
    channelType: string,
    extra: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Trouver les flows avec ce type de trigger actif
      const triggers = await this.triggerRepo.find({
        where: { triggerType, isActive: true },
        relations: ['flow'],
      });

      const activeTrigger = triggers.find((t) => t.flow?.isActive);
      if (!activeTrigger) return;

      const flow = activeTrigger.flow;

      // Trouver ou créer la BotConversation associée
      const existing = await this.convRepo.findOne({ where: { chatRef } });
      let conv: BotConversation;
      if (existing) {
        conv = existing;
      } else {
        const created = await this.convRepo.save({ chatRef } as any);
        conv = (Array.isArray(created) ? created[0] : created) as BotConversation;
      }

      // Créer une session et démarrer le flow
      const session = await this.sessionService.createSession({
        conversation: conv,
        flow,
        triggerType,
      });

      session.variables = {
        ...session.variables,
        __provider: provider,
        __channelType: channelType,
        __externalRef: chatRef,
        ...extra,
      };
      await this.sessionService.save(session);

      await this.engineService.resumeSession(session.id, triggerType, {
        provider,
        channelType,
        externalRef: chatRef,
        contactName: '',
        contactRef:  chatRef,
      });
    } catch (err) {
      this.logger.error(`handleExternalTrigger [${triggerType}] error: ${err}`);
    }
  }
}
