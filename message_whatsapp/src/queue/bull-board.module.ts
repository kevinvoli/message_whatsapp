import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  WEBHOOK_PROCESSING_QUEUE,
  BROADCAST_QUEUE,
  SENTIMENT_QUEUE,
  OUTBOUND_WEBHOOK_QUEUE,
  DEAD_LETTER_QUEUE,
} from './queue.module';

@Module({
  imports: [
    BullBoardModule.forRoot({ route: '/admin/queues', adapter: ExpressAdapter }),
    BullBoardModule.forFeature({ name: WEBHOOK_PROCESSING_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: BROADCAST_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: SENTIMENT_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: OUTBOUND_WEBHOOK_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: DEAD_LETTER_QUEUE, adapter: BullMQAdapter }),
  ],
})
export class BullBoardSetupModule {}
