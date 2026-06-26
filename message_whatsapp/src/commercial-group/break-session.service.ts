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
    return this.repo.save(
      this.repo.create({ commercialId, breakScheduleId, date: today, takenAt: new Date(), status: 'taken' }),
    );
  }

  async hasTakenBreak(commercialId: string, breakScheduleId: string, dateStr: string): Promise<boolean> {
    return !!(await this.repo.findOne({ where: { commercialId, breakScheduleId, date: dateStr } }));
  }

  async markMissed(commercialId: string, breakScheduleId: string, dateStr: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { commercialId, breakScheduleId, date: dateStr } });
    if (!existing) {
      await this.repo.save(
        this.repo.create({ commercialId, breakScheduleId, date: dateStr, takenAt: null, status: 'missed' }),
      );
    }
  }
}
