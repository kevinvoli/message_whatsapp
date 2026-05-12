import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MissedCallEvent } from './entities/missed-call-event.entity';
import { MissedCallHandlerService } from './missed-call-handler.service';
import { ActionQueueModule } from 'src/action-queue/action-queue.module';
import { CommercialActionTask } from 'src/action-queue/entities/commercial-action-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MissedCallEvent, CommercialActionTask]),
    ActionQueueModule,
  ],
  providers: [MissedCallHandlerService],
  exports: [MissedCallHandlerService, TypeOrmModule],
})
export class MissedCallModule {}
