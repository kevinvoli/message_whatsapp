import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entités
import { BotConversation } from './entities/bot-conversation.entity';
import { BotMessage } from './entities/bot-message.entity';
import { FlowBot } from './entities/flow-bot.entity';
import { FlowTrigger } from './entities/flow-trigger.entity';
import { FlowNode } from './entities/flow-node.entity';
import { FlowEdge } from './entities/flow-edge.entity';
import { FlowSession } from './entities/flow-session.entity';
import { FlowSessionLog } from './entities/flow-session-log.entity';
import { FlowAnalytics, FlowNodeAnalytics } from './entities/flow-analytics.entity';

// Services
import { BotProviderAdapterRegistry } from './services/bot-provider-adapter-registry.service';
import { BotConversationService } from './services/bot-conversation.service';
import { BotMessageService } from './services/bot-message.service';
import { FlowCrudService } from './services/flow-crud.service';
import { FlowEngineService } from './services/flow-engine.service';
import { FlowSessionService } from './services/flow-session.service';
import { FlowTriggerService } from './services/flow-trigger.service';
import { FlowVariableService } from './services/flow-variable.service';
import { FlowAnalyticsService } from './services/flow-analytics.service';
import { FlowMonitorService } from './services/flow-monitor.service';

// Listeners
import { BotInboundListener } from './listeners/bot-inbound.listener';

// Jobs
import { FlowPollingJob } from './jobs/flow-polling.job';
import { FlowSessionCleanerJob } from './jobs/flow-session-cleaner.job';

// Controller
import { FlowBotController } from './flowbot.controller';

const ENTITIES = [
  BotConversation,
  BotMessage,
  FlowBot,
  FlowTrigger,
  FlowNode,
  FlowEdge,
  FlowSession,
  FlowSessionLog,
  FlowAnalytics,
  FlowNodeAnalytics,
];


const SERVICES = [
  BotProviderAdapterRegistry,
  BotConversationService,
  BotMessageService,
  FlowCrudService,
  FlowEngineService,
  FlowSessionService,
  FlowTriggerService,
  FlowVariableService,
  FlowAnalyticsService,
  FlowMonitorService,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    // ✅ EventEmitterModule est global — pas besoin de l'importer ici
    // ❌ INTERDIT : WhatsappChatModule, WhatsappMessageModule, DispatcherModule
  ],
  providers: [
    ...SERVICES,
    BotInboundListener,
    FlowPollingJob,
    FlowSessionCleanerJob,
  ],
  controllers: [FlowBotController],
  exports: [
    BotProviderAdapterRegistry,
    FlowEngineService,
  ],
})
export class FlowBotModule {}
