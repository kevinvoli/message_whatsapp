import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AdminGuard } from 'src/auth/admin.guard';
import {
  DEAD_LETTER_QUEUE,
  WEBHOOK_PROCESSING_QUEUE,
  BROADCAST_QUEUE,
  SENTIMENT_QUEUE,
  OUTBOUND_WEBHOOK_QUEUE,
} from './queue.constants';
import { DeadLetterPayload } from './dead-letter.service';
import { AgentPresenceService } from 'src/redis/agent-presence.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class QueueAdminController {
  constructor(
    @InjectQueue(DEAD_LETTER_QUEUE) private readonly dlqQueue: Queue,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly webhookQueue: Queue,
    @InjectQueue(BROADCAST_QUEUE) private readonly broadcastQueue: Queue,
    @InjectQueue(SENTIMENT_QUEUE) private readonly sentimentQueue: Queue,
    @InjectQueue(OUTBOUND_WEBHOOK_QUEUE) private readonly outboundQueue: Queue,
    @Optional() private readonly presenceService: AgentPresenceService,
  ) {}

  @Get('queue-stats')
  async getQueueStats() {
    const queues: Array<{ name: string; queue: Queue }> = [
      { name: WEBHOOK_PROCESSING_QUEUE, queue: this.webhookQueue },
      { name: BROADCAST_QUEUE, queue: this.broadcastQueue },
      { name: SENTIMENT_QUEUE, queue: this.sentimentQueue },
      { name: OUTBOUND_WEBHOOK_QUEUE, queue: this.outboundQueue },
      { name: DEAD_LETTER_QUEUE, queue: this.dlqQueue },
    ];

    const results = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [counts, paused] = await Promise.all([
          queue.getJobCounts(),
          queue.isPaused(),
        ]);
        return { name, counts, paused };
      }),
    );

    return results;
  }

  @Get('dead-letter')
  async getDeadLetter(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const [failed, waiting] = await Promise.all([
      this.dlqQueue.getFailed(offset, offset + limitNum - 1),
      this.dlqQueue.getWaiting(0, 10),
    ]);

    return {
      page: pageNum,
      limit: limitNum,
      failed: failed.map((j) => ({
        id: j.id,
        data: j.data,
        failedReason: j.failedReason,
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp,
      })),
      waiting: waiting.map((j) => ({
        id: j.id,
        data: j.data,
        timestamp: j.timestamp,
      })),
    };
  }

  @Post('dead-letter/:jobId/replay')
  async replayDeadLetter(@Param('jobId') jobId: string) {
    const job = await this.dlqQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job DLQ ${jobId} introuvable`);
    }

    const data = job.data as DeadLetterPayload;

    const queueMap: Record<string, Queue> = {
      [WEBHOOK_PROCESSING_QUEUE]: this.webhookQueue,
      [BROADCAST_QUEUE]: this.broadcastQueue,
      [SENTIMENT_QUEUE]: this.sentimentQueue,
      [OUTBOUND_WEBHOOK_QUEUE]: this.outboundQueue,
    };

    const targetQueue = queueMap[data.originalQueue];
    if (!targetQueue) {
      throw new BadRequestException(
        `Queue cible inconnue : ${data.originalQueue}`,
      );
    }

    await targetQueue.add(data.jobName, data.payload);
    await job.remove();

    return { replayed: true, originalQueue: data.originalQueue, jobName: data.jobName };
  }

  @Get('agents/online')
  async getOnlineAgents() {
    if (!this.presenceService) {
      return { source: 'unavailable', agents: [] };
    }
    const agents = await this.presenceService.getPresentAgents();
    return {
      source: process.env['REDIS_PRESENCE_ENABLED'] === 'true' ? 'redis' : 'memory',
      count: agents.length,
      agents,
    };
  }
}
