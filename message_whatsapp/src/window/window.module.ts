import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationValidation } from './entities/conversation-validation.entity';
import { CallEvent } from './entities/call-event.entity';
import { ValidationCriterionConfig } from './entities/validation-criterion-config.entity';
import { ValidationEngineService } from './services/validation-engine.service';
import { WindowRotationService } from './services/window-rotation.service';
import { CallEventService } from './services/call-event.service';
import { WindowController } from './controllers/call-event.controller';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationCapacityModule } from 'src/conversation-capacity/conversation-capacity.module';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { CallObligationModule } from 'src/call-obligations/call-obligation.module';
import { ConversationReportModule } from 'src/gicop-report/conversation-report.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationValidation,
      CallEvent,
      ValidationCriterionConfig,
      WhatsappChat,
    ]),
    ConversationCapacityModule,
    SystemConfigModule,
    CallObligationModule,
    ConversationReportModule,
    RedisModule,
  ],
  controllers: [WindowController],
  providers: [ValidationEngineService, WindowRotationService, CallEventService],
  exports: [ValidationEngineService, WindowRotationService, CallEventService],
})
export class WindowModule {}
