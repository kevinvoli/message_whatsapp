import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlowAnalytics, FlowNodeAnalytics } from '../entities/flow-analytics.entity';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowSessionLog } from '../entities/flow-session-log.entity';

@Injectable()
export class FlowAnalyticsService {
  constructor(
    @InjectRepository(FlowAnalytics)
    private readonly analyticsRepo: Repository<FlowAnalytics>,
    @InjectRepository(FlowNodeAnalytics)
    private readonly nodeAnalyticsRepo: Repository<FlowNodeAnalytics>,
  ) {}

  async recordSessionStart(flowId: string): Promise<void> {
    await this.incrementCounter(flowId, 'sessionsStarted');
  }

  async recordCompletion(session: FlowSession): Promise<void> {
    const durationSeconds = session.completedAt && session.startedAt
      ? (session.completedAt.getTime() - session.startedAt.getTime()) / 1000
      : null;

    await this.incrementCounter(session.flowId, 'sessionsCompleted', {
      avgStepsIncrement: session.stepsCount,
      avgDurationIncrement: durationSeconds,
    });
  }

  async recordEscalation(session: FlowSession): Promise<void> {
    await this.incrementCounter(session.flowId, 'sessionsEscalated');
  }

  async recordExpiration(session: FlowSession): Promise<void> {
    await this.incrementCounter(session.flowId, 'sessionsExpired');
  }

  async findByFlow(flowId: string): Promise<FlowAnalytics[]> {
    return this.analyticsRepo.find({
      where: { flowId },
      order: { periodDate: 'DESC' },
    });
  }

  private async incrementCounter(
    flowId: string,
    field: keyof Pick<
      FlowAnalytics,
      'sessionsStarted' | 'sessionsCompleted' | 'sessionsEscalated' | 'sessionsExpired'
    >,
    _extras?: { avgStepsIncrement?: number; avgDurationIncrement?: number | null },
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    let row = await this.analyticsRepo.findOne({
      where: { flowId, periodDate: today },
    });

    if (!row) {
      row = this.analyticsRepo.create({
        flowId,
        periodDate: today,
        sessionsStarted: 0,
        sessionsCompleted: 0,
        sessionsEscalated: 0,
        sessionsExpired: 0,
      });
    }

    (row[field] as number) += 1;
    await this.analyticsRepo.save(row);
  }
}
