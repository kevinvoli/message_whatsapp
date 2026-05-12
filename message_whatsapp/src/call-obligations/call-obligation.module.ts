import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialObligationBatch } from './entities/commercial-obligation-batch.entity';
import { CallTask } from './entities/call-task.entity';
import { CallObligationService } from './call-obligation.service';
import { CallObligationController } from './call-obligation.controller';
import { CallTaskAdminService } from './call-task-admin.service';
import { CallTaskAdminController } from './call-task-admin.controller';
import { ObligationQualityCheckJob } from './obligation-quality-check.job';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { RedisModule } from 'src/redis/redis.module';
import { NotificationModule } from 'src/notification/notification.module';
import { ConversationReportModule } from 'src/gicop-report/conversation-report.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommercialObligationBatch,
      CallTask,
      Contact,
      WhatsappCommercial,
      WhatsappChat,
      WhatsappPoste,
    ]),
    JorbsModule,
    SystemConfigModule,
    RedisModule,
    NotificationModule,
    forwardRef(() => ConversationReportModule),
  ],
  controllers: [CallObligationController, CallTaskAdminController],
  providers: [CallObligationService, CallTaskAdminService, ObligationQualityCheckJob],
  exports: [CallObligationService],
})
export class CallObligationModule {}
