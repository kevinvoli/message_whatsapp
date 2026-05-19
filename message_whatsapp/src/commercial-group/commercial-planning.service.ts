import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommercialPlanning } from './entities/commercial-planning.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CreateAbsenceDto, CreateExceptionalDto, CreateReplacementDto } from './dto/create-planning.dto';

@Injectable()
export class CommercialPlanningService {
  constructor(
    @InjectRepository(CommercialPlanning)
    private readonly planningRepo: Repository<CommercialPlanning>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    private readonly dataSource: DataSource,
  ) {}

  getTodayString(): string {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: process.env['TZ'] ?? 'Africa/Abidjan',
    }).format(new Date());
  }

  async getTodayAbsenceIds(): Promise<string[]> {
    const today = this.getTodayString();
    const rows = await this.planningRepo.find({
      where: { type: 'absence', date: today },
      select: ['commercialId'],
    });
    return rows.map((r) => r.commercialId);
  }

  async getTodayExceptionalIds(): Promise<string[]> {
    const today = this.getTodayString();
    const rows = await this.planningRepo.find({
      where: { type: 'exceptional', date: today },
      select: ['commercialId'],
    });
    return rows.map((r) => r.commercialId);
  }

  async createAbsence(dto: CreateAbsenceDto): Promise<CommercialPlanning> {
    const conflict = await this.planningRepo.findOne({
      where: { commercialId: dto.commercialId, date: dto.date },
    });
    if (conflict) throw new ConflictException('Ce commercial a déjà un override pour cette date.');
    const entry = this.planningRepo.create({
      commercialId: dto.commercialId,
      type: 'absence',
      date: dto.date,
      reason: dto.reason,
      declaredBy: dto.declaredBy,
    });
    return this.planningRepo.save(entry);
  }

  async createExceptional(dto: CreateExceptionalDto): Promise<CommercialPlanning> {
    const conflict = await this.planningRepo.findOne({
      where: { commercialId: dto.commercialId, date: dto.date },
    });
    if (conflict) throw new ConflictException('Ce commercial a déjà un override pour cette date.');
    const entry = this.planningRepo.create({
      commercialId: dto.commercialId,
      type: 'exceptional',
      date: dto.date,
      reason: dto.reason,
      declaredBy: dto.declaredBy,
    });
    return this.planningRepo.save(entry);
  }

  async createReplacement(dto: CreateReplacementDto): Promise<{ absence: CommercialPlanning; exceptional: CommercialPlanning }> {
    const replaced = await this.commercialRepo.findOne({
      where: { id: dto.replacedId },
      relations: ['poste'],
    });
    if (!replaced) throw new NotFoundException('Commercial remplacé introuvable.');
    if (!replaced.poste) throw new BadRequestException('Le commercial remplacé n\'a pas de poste assigné.');

    const [conflictReplaced, conflictReplacer, conflictPoste] = await Promise.all([
      this.planningRepo.findOne({ where: { commercialId: dto.replacedId, date: dto.date } }),
      this.planningRepo.findOne({ where: { commercialId: dto.replacerId, date: dto.date } }),
      this.planningRepo.findOne({ where: { overridePosteId: replaced.poste.id, date: dto.date } }),
    ]);
    if (conflictReplaced) throw new ConflictException('Le commercial remplacé a déjà un override pour cette date.');
    if (conflictReplacer) throw new ConflictException('Le remplaçant a déjà un override pour cette date.');
    if (conflictPoste) throw new ConflictException('Ce poste a déjà un remplaçant désigné pour cette date.');

    return this.dataSource.transaction(async (em) => {
      const absence = em.create(CommercialPlanning, {
        commercialId: dto.replacedId,
        type: 'absence',
        date: dto.date,
        linkedCommercialId: dto.replacerId,
        reason: dto.reason,
        declaredBy: dto.declaredBy,
      });
      const exceptional = em.create(CommercialPlanning, {
        commercialId: dto.replacerId,
        type: 'exceptional',
        date: dto.date,
        linkedCommercialId: dto.replacedId,
        overridePosteId: replaced.poste!.id,
        reason: dto.reason,
        declaredBy: dto.declaredBy,
      });
      await em.save(CommercialPlanning, [absence, exceptional]);
      return { absence, exceptional };
    });
  }

  async findByDate(date: string): Promise<CommercialPlanning[]> {
    return this.planningRepo.find({
      where: { date },
      relations: ['commercial', 'linkedCommercial', 'overridePoste'],
      order: { type: 'ASC', createdAt: 'ASC' },
    });
  }

  async remove(id: string): Promise<void> {
    const entry = await this.planningRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Override introuvable.');
    if (entry.linkedCommercialId) {
      const linked = await this.planningRepo.findOne({
        where: { commercialId: entry.linkedCommercialId, date: entry.date },
      });
      if (linked) await this.planningRepo.remove(linked);
    }
    await this.planningRepo.remove(entry);
  }
}
