import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { SentimentService } from './sentiment.service';
import { SentimentWorker } from './sentiment.worker';
import { SentimentListener } from './sentiment.listener';
import { SENTIMENT_QUEUE } from './sentiment.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: SENTIMENT_QUEUE }),
    TypeOrmModule.forFeature([WhatsappMessage]),
  ],
  providers: [SentimentService, SentimentWorker, SentimentListener],
  exports: [SentimentService],
})
export class SentimentModule {}
