import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CommercialGroup } from './entities/commercial-group.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class CommercialGroupService {
  constructor(
    @InjectRepository(CommercialGroup)
    private readonly groupRepo: Repository<CommercialGroup>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  async findAll(): Promise<CommercialGroup[]> {
    return this.groupRepo.find({ order: { name: 'ASC' } });
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
    });
    if (!commercial) throw new NotFoundException(`Commercial ${commercialId} not found`);
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
}
