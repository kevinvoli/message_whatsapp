import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowSessionLog } from '../entities/flow-session-log.entity';

@Injectable()
export class FlowMonitorService {
  constructor(
    @InjectRepository(FlowSession)
    private readonly sessionRepo: Repository<FlowSession>,
    @InjectRepository(FlowSessionLog)
    private readonly logRepo: Repository<FlowSessionLog>,
  ) {}

  /** Sessions récentes d'un flux (20 par défaut, terminées ou non). */
  async findRecentByFlow(flowId: string, limit = 20): Promise<FlowSession[]> {
    return this.sessionRepo.find({
      where: { flowId },
      order: { startedAt: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /** Sessions non terminales d'un flux (ACTIVE / WAITING_*). */
  async findActiveByFlow(flowId: string): Promise<FlowSession[]> {
    return this.sessionRepo.find({
      where: {
        flowId,
        status: In([
          FlowSessionStatus.ACTIVE,
          FlowSessionStatus.WAITING_REPLY,
          FlowSessionStatus.WAITING_DELAY,
        ]),
      },
      order: { startedAt: 'DESC' },
    });
  }

  /** Journal d'exécution d'une session (ordre chronologique). */
  async findSessionLogs(sessionId: string): Promise<FlowSessionLog[]> {
    return this.logRepo.find({
      where: { sessionId },
      order: { executedAt: 'ASC' },
    });
  }

  /** Force l'annulation d'une session encore active. */
  async cancelSession(sessionId: string): Promise<void> {
    await this.sessionRepo.update(
      { id: sessionId, status: In([FlowSessionStatus.ACTIVE, FlowSessionStatus.WAITING_REPLY, FlowSessionStatus.WAITING_DELAY]) },
      { status: FlowSessionStatus.CANCELLED },
    );
  }
}
