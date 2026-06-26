import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SubGroupBreakSchedule } from './entities/sub-group-break-schedule.entity';
import { UpsertBreakScheduleDto } from './dto/sub-group.dto';
import { BreakScheduleResponse } from './commercial-sub-group.service';

@Injectable()
export class BreakScheduleService {
  constructor(
    @InjectRepository(SubGroupBreakSchedule)
    private readonly scheduleRepo: Repository<SubGroupBreakSchedule>,
  ) {}

  async upsert(subGroupId: string, dto: UpsertBreakScheduleDto): Promise<BreakScheduleResponse> {
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('endTime doit être postérieur à startTime');
    }

    const existing = await this.scheduleRepo.findOne({
      where: { subGroupId, deletedAt: IsNull() },
    });

    if (existing) {
      existing.startTime = dto.startTime;
      existing.endTime = dto.endTime;
      if (dto.reminderIntervalMinutes !== undefined) {
        existing.reminderIntervalMinutes = dto.reminderIntervalMinutes;
      }
      if (dto.popupMessageText !== undefined) {
        existing.popupMessageText = dto.popupMessageText ?? null;
      }
      if (dto.popupAudioAssetId !== undefined) {
        existing.popupAudioAssetId = dto.popupAudioAssetId ?? null;
      }
      if (dto.maxDurationMinutes !== undefined) {
        existing.maxDurationMinutes = dto.maxDurationMinutes;
      }
      const saved = await this.scheduleRepo.save(existing);
      return this.toResponse(saved);
    }

    const created = this.scheduleRepo.create({
      subGroupId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      reminderIntervalMinutes: dto.reminderIntervalMinutes ?? 5,
      popupMessageText: dto.popupMessageText ?? null,
      popupAudioAssetId: dto.popupAudioAssetId ?? null,
      maxDurationMinutes: dto.maxDurationMinutes ?? 60,
    });
    const saved = await this.scheduleRepo.save(created);
    return this.toResponse(saved);
  }

  async findBySubGroup(subGroupId: string): Promise<BreakScheduleResponse[]> {
    const rows = await this.scheduleRepo.find({
      where: { subGroupId, deletedAt: IsNull() },
      order: { startTime: 'ASC' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async softDelete(id: string): Promise<void> {
    const schedule = await this.scheduleRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!schedule) throw new NotFoundException(`BreakSchedule ${id} introuvable`);
    await this.scheduleRepo.softRemove(schedule);
  }

  private toResponse(bs: SubGroupBreakSchedule): BreakScheduleResponse {
    return {
      id: bs.id,
      subGroupId: bs.subGroupId,
      startTime: bs.startTime,
      endTime: bs.endTime,
      reminderIntervalMinutes: bs.reminderIntervalMinutes,
      popupMessageText: bs.popupMessageText,
      popupAudioUrl: null,
      maxDurationMinutes: bs.maxDurationMinutes,
    };
  }
}
