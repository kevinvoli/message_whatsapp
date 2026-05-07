import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DEAD_LETTER_QUEUE } from './queue.constants';

export interface DeadLetterPayload {
  originalQueue: string;
  originalJobId: string | undefined;
  jobName: string;
  payload: unknown;
  error: string;
  failedAt: string;
  attemptsMade: number;
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectQueue(DEAD_LETTER_QUEUE) private readonly dlqQueue: Queue,
  ) {}

  async enqueue(originalQueue: string, job: Job, error: unknown): Promise<void> {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const payload: DeadLetterPayload = {
      originalQueue,
      originalJobId: job.id,
      jobName: job.name,
      payload: job.data,
      error: errorMsg.slice(0, 2000),
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    };

    await this.dlqQueue.add('dead-letter', payload, {
      removeOnComplete: false,
      removeOnFail: false,
    });

    this.logger.warn(
      `DLQ enqueued: queue=${originalQueue} job=${job.id} error=${errorMsg.slice(0, 100)}`,
    );
  }
}
