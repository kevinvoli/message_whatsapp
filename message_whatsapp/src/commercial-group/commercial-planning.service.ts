import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommercialPlanning } from './entities/commercial-planning.entity';
import { GroupScheduleDay } from './entities/group-schedule-day.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CreateAbsenceDto, CreateExceptionalDto, CreateReplacementDto } from './dto/create-planning.dto';

@Injectable()
export class CommercialPlanningService {
  constructor(
    @InjectRepository(CommercialPlanning)
    private readonly planningRepo: Repository<CommercialPlanning>,
    @InjectRepository(GroupScheduleDay)
    private readonly scheduleDayRepo: Repository<GroupScheduleDay>,
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

  // Recalcule et applique isWorkingToday en temps réel pour un commercial
  private async applyTodayEffect(
    commercialId: string,
    effect: 'force_absent' | 'force_active' | 'restore',
  ): Promise<void> {
    if (effect === 'force_absent') {
      await this.commercialRepo.update(commercialId, {
        isWorkingToday: false,
        workingTodaySince: null,
      });
      return;
    }

    if (effect === 'force_active') {
      await this.commercialRepo.update(commercialId, {
        isWorkingToday: true,
        workingTodaySince: new Date(),
      });
      return;
    }

    // restore: relit le planning du groupe pour savoir si ce commercial travaille
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId },
      select: ['id', 'groupId'],
    });
    if (!commercial?.groupId) {
      await this.commercialRepo.update(commercialId, {
        isWorkingToday: false,
        workingTodaySince: null,
      });
      return;
    }
    const today = this.getTodayString();
    const scheduleDay = await this.scheduleDayRepo.findOne({
      where: { groupId: commercial.groupId, date: today, isWorkDay: true },
    });
    await this.commercialRepo.update(commercialId, {
      isWorkingToday: !!scheduleDay,
      workingTodaySince: scheduleDay ? new Date() : null,
    });
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
    const saved = await this.planningRepo.save(entry);

    // Effet immédiat si c'est pour aujourd'hui
    if (dto.date === this.getTodayString()) {
      await this.applyTodayEffect(dto.commercialId, 'force_absent');
    }

    return saved;
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
    const saved = await this.planningRepo.save(entry);

    if (dto.date === this.getTodayString()) {
      await this.applyTodayEffect(dto.commercialId, 'force_active');
    }

    return saved;
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

    const result = await this.dataSource.transaction(async (em) => {
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

    // Effet immédiat si c'est pour aujourd'hui
    if (dto.date === this.getTodayString()) {
      await Promise.all([
        this.applyTodayEffect(dto.replacedId, 'force_absent'),
        this.applyTodayEffect(dto.replacerId, 'force_active'),
      ]);
    }

    return result;
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

    const isToday = entry.date === this.getTodayString();
    const affectedIds: string[] = [entry.commercialId];

    // Suppression en cascade de l'entrée liée
    if (entry.linkedCommercialId) {
      const linked = await this.planningRepo.findOne({
        where: { commercialId: entry.linkedCommercialId, date: entry.date },
      });
      if (linked) {
        affectedIds.push(entry.linkedCommercialId);
        await this.planningRepo.remove(linked);
      }
    }
    await this.planningRepo.remove(entry);

    // Restaurer isWorkingToday depuis le planning du groupe pour tous les commerciaux impactés
    if (isToday) {
      await Promise.all(affectedIds.map((cid) => this.applyTodayEffect(cid, 'restore')));
    }
  }
}
