import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CommercialGroup } from './entities/commercial-group.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { GroupScheduleService } from './group-schedule.service';

@Injectable()
export class CommercialGroupService {
  constructor(
    @InjectRepository(CommercialGroup)
    private readonly groupRepo: Repository<CommercialGroup>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    private readonly groupScheduleService: GroupScheduleService,
  ) {}

  async findAll(): Promise<CommercialGroup[]> {
    return this.groupRepo.find({
      relations: ['commercials', 'commercials.poste'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CommercialGroup> {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['commercials'],
    });
    if (!group) throw new NotFoundException(`CommercialGroup ${id} not found`);
    return group;
  }

  async create(dto: { name: string; description?: string }): Promise<CommercialGroup> {
    return this.groupRepo.save(
      this.groupRepo.create({
        name: dto.name,
        description: dto.description ?? null,
        isActive: true,
      }),
    );
  }

  async update(
    id: string,
    dto: { name?: string; description?: string; isActive?: boolean },
  ): Promise<CommercialGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException(`CommercialGroup ${id} not found`);
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description ?? null;
    if (dto.isActive !== undefined) group.isActive = dto.isActive;
    return this.groupRepo.save(group);
  }

  async remove(id: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException(`CommercialGroup ${id} not found`);

    // Retirer tous les membres avant désactivation
    await this.commercialRepo.update({ groupId: id }, { groupId: null });

    group.isActive = false;
    await this.groupRepo.save(group);
  }

  async addMember(groupId: string, commercialId: string): Promise<WhatsappCommercial> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`CommercialGroup ${groupId} not found`);
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId, deletedAt: IsNull() },
      relations: ['poste'],
    });
    if (!commercial) throw new NotFoundException(`Commercial ${commercialId} not found`);

    if (commercial.poste) {
      const conflict = await this.commercialRepo.findOne({
        where: { groupId, poste: { id: commercial.poste.id }, deletedAt: IsNull() },
        relations: ['poste'],
      });
      if (conflict && conflict.id !== commercialId) {
        throw new ConflictException('Le groupe contient déjà un commercial sur le poste "' + commercial.poste.name + '"');
      }
    }

    commercial.groupId = groupId;
    return this.commercialRepo.save(commercial);
  }

  async removeMember(groupId: string, commercialId: string): Promise<WhatsappCommercial> {
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId, groupId, deletedAt: IsNull() },
    });
    if (!commercial) throw new NotFoundException(`Commercial ${commercialId} not in group ${groupId}`);
    commercial.groupId = null;
    return this.commercialRepo.save(commercial);
  }

  async setScheduleConfig(id: string, dto: { workDaysCount: number; firstWorkDay: string }): Promise<CommercialGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException('CommercialGroup ' + id + ' not found');
    group.workDaysCount = dto.workDaysCount;
    group.firstWorkDay = dto.firstWorkDay;
    return this.groupRepo.save(group);
  }

  async generateSchedule(id: string, months?: number): Promise<number> {
    return this.groupScheduleService.generateForGroup(id, months);
  }

  async getSchedule(
    id: string,
    from?: string,
    to?: string,
  ): Promise<{ date: string; isWorkDay: boolean; dayOfWeek: number }[]> {
    const defaultFrom = new Date().toISOString().slice(0, 10);
    const defaultTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return this.groupScheduleService.getCalendarForGroup(id, from ?? defaultFrom, to ?? defaultTo);
  }
}
