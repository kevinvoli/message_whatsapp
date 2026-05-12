import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MissedCallEvent } from './entities/missed-call-event.entity';
import { MissedCallHandlerService } from './missed-call-handler.service';
import { MissedCallSlaJob } from './missed-call-sla.job';
import { MissedCallService } from './missed-call.service';
import { MissedCallController } from './missed-call.controller';
import { ActionQueueModule } from 'src/action-queue/action-queue.module';
import { CommercialActionTask } from 'src/action-queue/entities/commercial-action-task.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { CallEvent } from 'src/window/entities/call-event.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MissedCallEvent, CommercialActionTask, CallEvent, WhatsappCommercial, WhatsappPoste]),
    ActionQueueModule,
    NotificationModule,
    JorbsModule,
    SystemConfigModule,
  ],
  controllers: [MissedCallController],
  providers: [MissedCallHandlerService, MissedCallSlaJob, MissedCallService],
  exports: [MissedCallHandlerService, MissedCallService, TypeOrmModule],
})
export class MissedCallModule {}
