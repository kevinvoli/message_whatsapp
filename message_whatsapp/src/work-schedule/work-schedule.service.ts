import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkSchedule, DayOfWeek } from './entities/work-schedule.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

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

  /** Effective schedule for a commercial: individual overrides group (poste). */
  async findForCommercial(commercialId: string): Promise<WorkScheduleDay[]> {
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId },
      relations: ['poste'],
    });
    const posteId = commercial?.poste?.id ?? null;

    const individual: WorkSchedule[] = await this.repo.find({ where: { commercialId, isActive: true } });
    const group: WorkSchedule[]       = posteId
      ? await this.repo.find({ where: { groupId: posteId, isActive: true } })
      : [];

    const individualByDay = new Map<DayOfWeek, WorkSchedule>(individual.map((s) => [s.dayOfWeek, s]));
    const groupByDay       = new Map<DayOfWeek, WorkSchedule>(group.map((s) => [s.dayOfWeek, s]));

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

  /** Today's effective schedule entry for a commercial. */
  async getTodayForCommercial(commercialId: string): Promise<WorkScheduleDay | null> {
    const all = await this.findForCommercial(commercialId);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as DayOfWeek;
    return all.find((d) => d.dayOfWeek === today) ?? null;
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

    return this.repo.save(existing);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
