import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkAttendance, AttendanceEventType } from './entities/work-attendance.entity';
import { v4 as uuidv4 } from 'uuid';

export type AttendanceStatus = 'not_clocked_in' | 'working' | 'on_break' | 'done';

export interface DailyAttendanceSummary {
  workDate:       string;
  events:         Array<{ id: string; eventType: AttendanceEventType; eventAt: string; note: string | null }>;
  status:         AttendanceStatus;
  minutesWorked:  number;
  minutesOnBreak: number;
}

export interface MonthlyAttendanceEntry {
  workDate:      string;
  status:        AttendanceStatus;
  minutesWorked: number;
  firstEvent:    string | null;
  lastEvent:     string | null;
}

@Injectable()
export class WorkAttendanceService {
  constructor(
    @InjectRepository(WorkAttendance)
    private readonly repo: Repository<WorkAttendance>,
  ) {}

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async logEvent(params: {
    commercialId: string;
    eventType:    AttendanceEventType;
    note?:        string;
    createdById?: string;
    eventAt?:     Date;
  }): Promise<WorkAttendance> {
    const at = params.eventAt ?? new Date();
    return this.repo.save(
      this.repo.create({
        id:           uuidv4(),
        commercialId: params.commercialId,
        eventType:    params.eventType,
        eventAt:      at,
        workDate:     at.toISOString().slice(0, 10),
        note:         params.note ?? null,
        createdById:  params.createdById ?? null,
      }),
    );
  }

  async getToday(commercialId: string): Promise<DailyAttendanceSummary> {
    const today = this.todayDate();
    const events = await this.repo.find({
      where: { commercialId, workDate: today },
      order: { eventAt: 'ASC' },
    });
    return this.buildSummary(today, events);
  }

  async getCurrentStatus(commercialId: string): Promise<AttendanceStatus> {
    const summary = await this.getToday(commercialId);
    return summary.status;
  }

  async getMonthHistory(commercialId: string, year: number, month: number): Promise<MonthlyAttendanceEntry[]> {
    const pad  = (n: number) => String(n).padStart(2, '0');
    const from = `${year}-${pad(month)}-01`;
    const to   = `${year}-${pad(month)}-31`;

    const rows = await this.repo
      .createQueryBuilder('wa')
      .where('wa.commercialId = :id',   { id: commercialId })
      .andWhere('wa.workDate >= :from',  { from })
      .andWhere('wa.workDate <= :to',    { to })
      .orderBy('wa.workDate', 'ASC')
      .addOrderBy('wa.eventAt', 'ASC')
      .getMany();

    const byDate = new Map<string, WorkAttendance[]>();
    for (const r of rows) {
      const list = byDate.get(r.workDate) ?? [];
      list.push(r);
      byDate.set(r.workDate, list);
    }

    const result: MonthlyAttendanceEntry[] = [];
    for (const [date, events] of byDate.entries()) {
      const summary = this.buildSummary(date, events);
      result.push({
        workDate:      date,
        status:        summary.status,
        minutesWorked: summary.minutesWorked,
        firstEvent:    events[0]?.eventAt.toISOString() ?? null,
        lastEvent:     events[events.length - 1]?.eventAt.toISOString() ?? null,
      });
    }

    return result;
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  async getTodayForAll(): Promise<Array<{ commercialId: string; status: AttendanceStatus; minutesWorked: number }>> {
    const today = this.todayDate();
    const rows  = await this.repo.find({ where: { workDate: today }, order: { eventAt: 'ASC' } });

    const byCommercial = new Map<string, WorkAttendance[]>();
    for (const r of rows) {
      const list = byCommercial.get(r.commercialId) ?? [];
      list.push(r);
      byCommercial.set(r.commercialId, list);
    }

    return [...byCommercial.entries()].map(([cid, events]) => {
      const s = this.buildSummary(today, events);
      return { commercialId: cid, status: s.status, minutesWorked: s.minutesWorked };
    });
  }

  // ── Calcul des heures ────────────────────────────────────────────────────────

  private buildSummary(workDate: string, events: WorkAttendance[]): DailyAttendanceSummary {
    const types = events.map((e) => e.eventType);

    let status: AttendanceStatus = 'not_clocked_in';
    if (types.includes('depart_maison')) {
      status = 'done';
    } else if (types.includes('depart_pause') && !types.includes('retour_pause')) {
      status = 'on_break';
    } else if (types.includes('arrivee') || types.includes('retour_pause')) {
      status = 'working';
    }

    const { minutesWorked, minutesOnBreak } = this.computeMinutes(events);

    return {
      workDate,
      events: events.map((e) => ({
        id:        e.id,
        eventType: e.eventType,
        eventAt:   e.eventAt.toISOString(),
        note:      e.note,
      })),
      status,
      minutesWorked,
      minutesOnBreak,
    };
  }

  private computeMinutes(events: WorkAttendance[]): { minutesWorked: number; minutesOnBreak: number } {
    let minutesWorked  = 0;
    let minutesOnBreak = 0;
    let lastActive: Date | null = null;
    let breakStart: Date | null = null;

    for (const e of events) {
      const t = new Date(e.eventAt);
      switch (e.eventType) {
        case 'arrivee':
        case 'retour_pause':
          lastActive = t;
          break;
        case 'depart_pause':
          if (lastActive) minutesWorked += (t.getTime() - lastActive.getTime()) / 60000;
          lastActive = null;
          breakStart = t;
          break;
        case 'depart_maison':
          if (lastActive) minutesWorked += (t.getTime() - lastActive.getTime()) / 60000;
          if (breakStart) minutesOnBreak += (t.getTime() - breakStart.getTime()) / 60000;
          lastActive = null;
          break;
      }
    }

    // Si le commercial est encore en activité, compter jusqu'à maintenant
    if (lastActive) {
      minutesWorked += (Date.now() - lastActive.getTime()) / 60000;
    }

    return {
      minutesWorked:  Math.round(minutesWorked),
      minutesOnBreak: Math.round(minutesOnBreak),
    };
  }
}
