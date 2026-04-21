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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationValidation,
      CallEvent,
      ValidationCriterionConfig,
      WhatsappChat,
    ]),
    ConversationCapacityModule,
  ],
  controllers: [WindowController],
  providers: [ValidationEngineService, WindowRotationService, CallEventService],
  exports: [ValidationEngineService, WindowRotationService, CallEventService],
})
export class WindowModule {}
