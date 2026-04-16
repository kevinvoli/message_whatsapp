import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Label } from './entities/label.entity';
import { ChatLabelAssignment } from './entities/chat-label-assignment.entity';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelService {
  constructor(
    @InjectRepository(Label)
    private readonly labelRepo: Repository<Label>,

    @InjectRepository(ChatLabelAssignment)
    private readonly assignRepo: Repository<ChatLabelAssignment>,
  ) {}

  // ─── Label CRUD ──────────────────────────────────────────────────────────────

  async createLabel(dto: CreateLabelDto): Promise<Label> {
    const existing = await this.labelRepo.findOne({
      where: { tenant_id: dto.tenant_id, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Un label "${dto.name}" existe déjà pour ce tenant`);
    }
    return this.labelRepo.save(this.labelRepo.create(dto));
  }

  async findAllLabels(tenantId: string, onlyActive = true): Promise<Label[]> {
    const where: any = { tenant_id: tenantId };
    if (onlyActive) where.is_active = true;
    return this.labelRepo.find({ where, order: { name: 'ASC' } });
  }

  async findOneLabel(id: string, tenantId: string): Promise<Label> {
    const label = await this.labelRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!label) throw new NotFoundException(`Label ${id} introuvable`);
    return label;
  }

  async updateLabel(id: string, tenantId: string, dto: UpdateLabelDto): Promise<Label> {
    const label = await this.findOneLabel(id, tenantId);
    Object.assign(label, dto);
    return this.labelRepo.save(label);
  }

  async removeLabel(id: string, tenantId: string): Promise<void> {
    const label = await this.findOneLabel(id, tenantId);
    await this.labelRepo.softDelete(label.id);
  }

  // ─── Assignation ────────────────────────────────────────────────────────────

  async assignLabel(chatId: string, labelId: string, tenantId: string): Promise<ChatLabelAssignment> {
    // Vérifier que le label appartient au tenant
    await this.findOneLabel(labelId, tenantId);

    const existing = await this.assignRepo.findOne({
      where: { chat_id: chatId, label_id: labelId },
    });
    if (existing) return existing; // idempotent

    return this.assignRepo.save(this.assignRepo.create({ chat_id: chatId, label_id: labelId }));
  }

  async removeAssignment(chatId: string, labelId: string, tenantId: string): Promise<void> {
    // Vérifier que le label appartient au tenant
    await this.findOneLabel(labelId, tenantId);

    await this.assignRepo.delete({ chat_id: chatId, label_id: labelId });
  }

  async getLabelsForChat(chatId: string): Promise<Label[]> {
    const assignments = await this.assignRepo.find({
      where: { chat_id: chatId },
      relations: ['label'],
    });
    return assignments.map((a) => a.label).filter(Boolean);
  }

  async setLabelsForChat(
    chatId: string,
    labelIds: string[],
    tenantId: string,
  ): Promise<Label[]> {
    // Vérifier que tous les labels appartiennent au tenant
    for (const labelId of labelIds) {
      await this.findOneLabel(labelId, tenantId);
    }

    // Supprimer les assignations existantes
    await this.assignRepo.delete({ chat_id: chatId });

    if (labelIds.length === 0) return [];

    const entities = labelIds.map((label_id) =>
      this.assignRepo.create({ chat_id: chatId, label_id }),
    );
    const saved = await this.assignRepo.save(entities);

    // Recharger avec relations
    return this.getLabelsForChat(chatId);
  }
}
