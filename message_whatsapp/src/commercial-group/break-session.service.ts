import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BreakSession } from './entities/break-session.entity';

@Injectable()
export class BreakSessionService {
  constructor(
    @InjectRepository(BreakSession)
    private readonly repo: Repository<BreakSession>,
  ) {}

  async takeBreak(commercialId: string, breakScheduleId: string): Promise<BreakSession> {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.repo.findOne({ where: { commercialId, breakScheduleId, date: today } });
    if (existing) return existing;
    try {
      return await this.repo.save(
        this.repo.create({ commercialId, breakScheduleId, date: today, takenAt: new Date(), status: 'taken' }),
      );
    } catch (err: unknown) {
      // Duplicate key (errno 1062) — race condition, retourner l'existante
      if ((err as { errno?: number }).errno === 1062) {
        return this.repo.findOneOrFail({ where: { commercialId, breakScheduleId, date: today } });
      }
      throw err;
    }
  }

  async hasTakenBreak(commercialId: string, breakScheduleId: string, dateStr: string): Promise<boolean> {
    return !!(await this.repo.findOne({ where: { commercialId, breakScheduleId, date: dateStr } }));
  }

  async markMissed(commercialId: string, breakScheduleId: string, dateStr: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { commercialId, breakScheduleId, date: dateStr } });
    if (existing) return;
    try {
      await this.repo.save(
        this.repo.create({ commercialId, breakScheduleId, date: dateStr, takenAt: null, status: 'missed' }),
      );
    } catch (err: unknown) {
      if ((err as { errno?: number }).errno !== 1062) throw err;
      // Race condition : doublon ignoré silencieusement
    }
  }

  async bulkHasTaken(
    pairs: Array<{ commercialId: string; breakScheduleId: string }>,
    dateStr: string,
  ): Promise<Set<string>> {
    if (pairs.length === 0) return new Set();
    const cids = [...new Set(pairs.map((p) => p.commercialId))];
    const sids = [...new Set(pairs.map((p) => p.breakScheduleId))];
    const sessions = await this.repo
      .createQueryBuilder('s')
      .select(['s.commercialId', 's.breakScheduleId'])
      .where('s.commercial_id IN (:...cids)', { cids })
      .andWhere('s.break_schedule_id IN (:...sids)', { sids })
      .andWhere('s.date = :date', { date: dateStr })
      .getMany();
    return new Set(sessions.map((s) => `${s.commercialId}:${s.breakScheduleId}`));
  }
}
