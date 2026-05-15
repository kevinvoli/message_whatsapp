import { Injectable, NotFoundException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { WorkSchedule, DayOfWeek } from './entities/work-schedule.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

const DAY_ORDER: DayOfWeek[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export interface CreateScheduleDto {
  commercialId?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  breakSlots?: Array<{ start: string; end: string }> | null;
  isActive?: boolean;
}

export interface WorkScheduleDay {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  breakSlots: Array<{ start: string; end: string }>;
  isActive: boolean;
  source: 'individual' | 'group';
  scheduleId: string;
}

@Injectable()
export class WorkScheduleService {
  constructor(
    @InjectRepository(WorkSchedule)
    private readonly repo: Repository<WorkSchedule>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async findAll(): Promise<WorkSchedule[]> {
    return this.repo.find({ order: { groupId: 'ASC', commercialId: 'ASC', dayOfWeek: 'ASC' } });
  }

  async findByCommercial(commercialId: string): Promise<WorkSchedule[]> {
    return this.repo.find({
      where: { commercialId, isActive: true },
      order: { dayOfWeek: 'ASC' },
    });
  }

  async findByGroup(groupId: string): Promise<WorkSchedule[]> {
    return this.repo.find({
      where: { groupId, isActive: true },
      order: { dayOfWeek: 'ASC' },
    });
  }

  /** Effective schedule for a commercial: individual overrides group (poste). Cache Redis TTL 300s. */
  async findForCommercial(commercialId: string): Promise<WorkScheduleDay[]> {
    const cacheKey = `schedule:commercial:${commercialId}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as WorkScheduleDay[];
      } catch { /* fallback DB */ }
    }
    const result = await this.computeForCommercial(commercialId);
    if (this.redis) {
      try { await this.redis.setex(cacheKey, 300, JSON.stringify(result)); } catch { /* ok */ }
    }
    return result;
  }

  private async computeForCommercial(commercialId: string): Promise<WorkScheduleDay[]> {
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId },
      relations: ['poste'],
    });
    const posteId = commercial?.poste?.id ?? null;

    const [individual, group] = await Promise.all([
      this.repo.find({ where: { commercialId, isActive: true } }),
      posteId ? this.repo.find({ where: { groupId: posteId, isActive: true } }) : Promise.resolve([]),
    ]);

    const individualByDay = new Map<DayOfWeek, WorkSchedule>(individual.map((s) => [s.dayOfWeek, s]));
    const groupByDay = new Map<DayOfWeek, WorkSchedule>(group.map((s) => [s.dayOfWeek, s]));

    const result: WorkScheduleDay[] = [];
    for (const day of DAY_ORDER) {
      const s: WorkSchedule | undefined = individualByDay.get(day) ?? groupByDay.get(day);
      if (!s) continue;
      result.push({
        dayOfWeek:  s.dayOfWeek,
        startTime:  s.startTime,
        endTime:    s.endTime,
        breakSlots: s.breakSlots ?? [],
        isActive:   s.isActive,
        source:     individualByDay.has(day) ? 'individual' : 'group',
        scheduleId: s.id,
      });
    }
    return result;
  }

  private async invalidateScheduleCache(commercialId?: string | null, groupId?: string | null): Promise<void> {
    if (!this.redis) return;
    try {
      if (groupId) {
        const keys = await this.redis.keys('schedule:commercial:*');
        if (keys.length > 0) await this.redis.del(...keys);
      } else if (commercialId) {
        await this.redis.del(`schedule:commercial:${commercialId}`);
      }
    } catch { /* ok */ }
  }

  /** Today's effective schedule entry for a commercial. */
  async getTodayForCommercial(commercialId: string): Promise<WorkScheduleDay | null> {
    const all = await this.findForCommercial(commercialId);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as DayOfWeek;
    return all.find((d) => d.dayOfWeek === today) ?? null;
  }

  /**
   * Retourne les groupId dont le planning est actif à l'instant donné.
   * Utilisé par OrderCallSyncService pour affiner l'attribution dans un pool multi-commerciaux.
   */
  async getActiveGroupIds(at: Date): Promise<string[]> {
    // FIX-H3: Utiliser le fuseau horaire de l'application (APP_TIMEZONE, defaut Africa/Abidjan)
    const tz = process.env['APP_TIMEZONE'] ?? 'Africa/Abidjan';
    const dayOfWeekStr = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: tz })
      .format(at).toLowerCase();
    // Mapping fr -> DayOfWeek anglais
    const dayFrToEn: Record<string, DayOfWeek> = {
      'lundi': 'monday', 'mardi': 'tuesday', 'mercredi': 'wednesday',
      'jeudi': 'thursday', 'vendredi': 'friday', 'samedi': 'saturday', 'dimanche': 'sunday',
    };
    const dayOfWeek: DayOfWeek = dayFrToEn[dayOfWeekStr] ?? (new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(at).toLowerCase() as DayOfWeek);
    const hhmmParts = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(at).split(':');
    const hhmm = hhmmParts[0].padStart(2, '0') + ':' + hhmmParts[1].padStart(2, '0');

    const schedules = await this.repo.find({
      where: {
        groupId:   Not(IsNull()),
        dayOfWeek,
        isActive:  true,
      },
    });

    return schedules
      .filter((s) => {
        if (s.startTime > hhmm || s.endTime <= hhmm) return false;
        const breaks = (s.breakSlots as Array<{ start: string; end: string }> | null) ?? [];
        return !breaks.some((b) => b.start <= hhmm && b.end > hhmm);
      })
      .map((s) => s.groupId!);
  }

  async create(dto: CreateScheduleDto): Promise<WorkSchedule> {
    const schedule = this.repo.create({
      id:           uuidv4(),
      commercialId: dto.commercialId ?? null,
      groupId:      dto.groupId ?? null,
      groupName:    dto.groupName ?? null,
      dayOfWeek:    dto.dayOfWeek,
      startTime:    dto.startTime,
      endTime:      dto.endTime,
      breakSlots:   dto.breakSlots ?? null,
      isActive:     dto.isActive ?? true,
    });
    return this.repo.save(schedule);
  }

  async update(id: string, dto: Partial<CreateScheduleDto>): Promise<WorkSchedule> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`WorkSchedule ${id} not found`);

    if (dto.dayOfWeek   !== undefined) existing.dayOfWeek  = dto.dayOfWeek;
    if (dto.startTime   !== undefined) existing.startTime  = dto.startTime;
    if (dto.endTime     !== undefined) existing.endTime    = dto.endTime;
    if (dto.breakSlots  !== undefined) existing.breakSlots = dto.breakSlots ?? null;
    if (dto.isActive    !== undefined) existing.isActive   = dto.isActive;
    if (dto.groupId     !== undefined) existing.groupId    = dto.groupId ?? null;
    if (dto.groupName   !== undefined) existing.groupName  = dto.groupName ?? null;
    if (dto.commercialId !== undefined) existing.commercialId = dto.commercialId ?? null;

    const saved = await this.repo.save(existing);
    await this.invalidateScheduleCache(saved.commercialId, saved.groupId);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (existing) {
      await this.invalidateScheduleCache(existing.commercialId, existing.groupId);
    }
    await this.repo.delete(id);
  }
}
