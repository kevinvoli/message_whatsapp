import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CommercialSubGroup } from './entities/commercial-sub-group.entity';
import { SubGroupBreakSchedule } from './entities/sub-group-break-schedule.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CreateSubGroupDto, UpdateSubGroupDto } from './dto/sub-group.dto';

export interface BreakScheduleResponse {
  id: string;
  subGroupId: string;
  startTime: string;
  endTime: string;
  reminderIntervalMinutes: number;
  popupMessageText: string | null;
  popupAudioUrl: string | null;
  maxDurationMinutes: number;
}

export interface SubGroupResponse {
  id: string;
  parentGroupId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  breakSchedules: BreakScheduleResponse[];
  memberCount: number;
}

export interface SubGroupDetailResponse extends SubGroupResponse {
  members: { id: string; name: string; phone: string | null }[];
}

type SubGroupWithCount = CommercialSubGroup & { memberCount: number };

@Injectable()
export class CommercialSubGroupService {
  constructor(
    @InjectRepository(CommercialSubGroup)
    private readonly subGroupRepo: Repository<CommercialSubGroup>,
    @InjectRepository(SubGroupBreakSchedule)
    private readonly scheduleRepo: Repository<SubGroupBreakSchedule>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  async findAll(parentGroupId: string): Promise<SubGroupResponse[]> {
    const subGroups = (await this.subGroupRepo
      .createQueryBuilder('sg')
      .leftJoinAndSelect('sg.breakSchedules', 'bs', 'bs.deletedAt IS NULL')
      .loadRelationCountAndMap('sg.memberCount', 'sg.members')
      .where('sg.parentGroupId = :parentGroupId', { parentGroupId })
      .andWhere('sg.deletedAt IS NULL')
      .orderBy('sg.name', 'ASC')
      .getMany()) as SubGroupWithCount[];

    return subGroups.map((sg) => this.toResponse(sg, sg.memberCount));
  }

  async findOne(id: string): Promise<SubGroupResponse> {
    const sg = (await this.subGroupRepo
      .createQueryBuilder('sg')
      .leftJoinAndSelect('sg.breakSchedules', 'bs', 'bs.deletedAt IS NULL')
      .loadRelationCountAndMap('sg.memberCount', 'sg.members')
      .where('sg.id = :id', { id })
      .andWhere('sg.deletedAt IS NULL')
      .getOne()) as SubGroupWithCount | null;

    if (!sg) throw new NotFoundException(`CommercialSubGroup ${id} introuvable`);
    return this.toResponse(sg, sg.memberCount);
  }

  async findOneWithMembers(id: string): Promise<SubGroupDetailResponse> {
    const sg = (await this.subGroupRepo
      .createQueryBuilder('sg')
      .leftJoinAndSelect('sg.breakSchedules', 'bs', 'bs.deletedAt IS NULL')
      .leftJoinAndSelect('sg.members', 'm', 'm.deletedAt IS NULL')
      .loadRelationCountAndMap('sg.memberCount', 'sg.members')
      .where('sg.id = :id', { id })
      .andWhere('sg.deletedAt IS NULL')
      .getOne()) as (SubGroupWithCount & { members?: WhatsappCommercial[] }) | null;

    if (!sg) throw new NotFoundException(`CommercialSubGroup ${id} introuvable`);

    return {
      ...this.toResponse(sg, sg.memberCount),
      members: (sg.members ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        phone: null,
      })),
    };
  }

  async create(dto: CreateSubGroupDto): Promise<SubGroupResponse> {
    const sg = this.subGroupRepo.create({
      parentGroupId: dto.parentGroupId,
      name: dto.name,
      description: dto.description ?? null,
      isActive: true,
    });
    const saved = await this.subGroupRepo.save(sg);
    return this.toResponse(saved as SubGroupWithCount, 0);
  }

  async update(id: string, dto: UpdateSubGroupDto): Promise<SubGroupResponse> {
    const sg = await this.subGroupRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!sg) throw new NotFoundException(`CommercialSubGroup ${id} introuvable`);

    if (dto.name !== undefined) sg.name = dto.name;
    if (dto.description !== undefined) sg.description = dto.description ?? null;
    if (dto.isActive !== undefined) sg.isActive = dto.isActive;

    await this.subGroupRepo.save(sg);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<void> {
    const sg = await this.subGroupRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!sg) throw new NotFoundException(`CommercialSubGroup ${id} introuvable`);
    await this.subGroupRepo.softRemove(sg);
  }

  async addMember(subGroupId: string, commercialId: string): Promise<SubGroupResponse> {
    const sg = await this.subGroupRepo.findOne({ where: { id: subGroupId, deletedAt: IsNull() } });
    if (!sg) throw new NotFoundException(`CommercialSubGroup ${subGroupId} introuvable`);

    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId, deletedAt: IsNull() },
      select: ['id', 'groupId', 'subGroupId'],
    });
    if (!commercial) throw new NotFoundException(`Commercial ${commercialId} introuvable`);

    if (commercial.groupId !== sg.parentGroupId) {
      throw new BadRequestException(
        `Le commercial n'appartient pas au groupe parent de ce sous-groupe`,
      );
    }

    await this.commercialRepo.update(commercialId, { subGroupId });
    return this.findOne(subGroupId);
  }

  async removeMember(subGroupId: string, commercialId: string): Promise<SubGroupResponse> {
    const sg = await this.subGroupRepo.findOne({ where: { id: subGroupId, deletedAt: IsNull() } });
    if (!sg) throw new NotFoundException(`CommercialSubGroup ${subGroupId} introuvable`);

    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId, deletedAt: IsNull() },
      select: ['id', 'subGroupId'],
    });
    if (!commercial) throw new NotFoundException(`Commercial ${commercialId} introuvable`);

    if (commercial.subGroupId === subGroupId) {
      await this.commercialRepo.update(commercialId, { subGroupId: null });
    }
    return this.findOne(subGroupId);
  }

  private toResponse(sg: SubGroupWithCount, memberCount: number): SubGroupResponse {
    return {
      id: sg.id,
      parentGroupId: sg.parentGroupId,
      name: sg.name,
      description: sg.description,
      isActive: sg.isActive,
      breakSchedules: (sg.breakSchedules ?? []).map((bs) => ({
        id: bs.id,
        subGroupId: bs.subGroupId,
        startTime: bs.startTime,
        endTime: bs.endTime,
        reminderIntervalMinutes: bs.reminderIntervalMinutes,
        popupMessageText: bs.popupMessageText,
        popupAudioUrl: null,
        maxDurationMinutes: bs.maxDurationMinutes,
      })),
      memberCount,
    };
  }
}
