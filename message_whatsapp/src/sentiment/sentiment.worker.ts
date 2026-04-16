import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { SentimentService } from './sentiment.service';
import { SENTIMENT_QUEUE, SentimentJobPayload } from './sentiment.constants';

@Processor(SENTIMENT_QUEUE, { concurrency: 5 })
export class SentimentWorker extends WorkerHost {
  private readonly logger = new Logger(SentimentWorker.name);

  constructor(
    private readonly sentimentService: SentimentService,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
  ) {
    super();
  }

  async process(job: Job<SentimentJobPayload>): Promise<void> {
    const { messageId, text } = job.data;

    const result = this.sentimentService.analyze(text);

    await this.messageRepo.update(messageId, {
      sentiment_score: result.score,
      sentiment_label: result.label,
    });

    this.logger.debug(
      `Sentiment [${messageId}]: ${result.label} (score=${result.score})`,
    );
  }
}
