import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { CommercialPlanning } from './entities/commercial-planning.entity';
import { GroupScheduleDay } from './entities/group-schedule-day.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CreateAbsenceDto, CreateAbsenceRangeDto, CreateExceptionalDto, CreateReplacementDto } from './dto/create-planning.dto';

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

  private async writeAudit(
    action: 'created' | 'deleted',
    entry: Pick<CommercialPlanning, 'id' | 'commercialId' | 'type' | 'date' | 'reason' | 'declaredBy'>,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO commercial_planning_audit
          (id, planning_id, action, commercial_id, type, date, reason, declared_by, performed_at)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          action === 'created' ? entry.id : null,
          action,
          entry.commercialId,
          entry.type,
          entry.date,
          entry.reason ?? null,
          entry.declaredBy ?? null,
        ],
      );
    } catch {
      // Silencieux : la table d'audit peut ne pas encore exister (migration en attente).
    }
  }

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
      timeSlot: dto.timeSlot ?? 'full',
    });
    const saved = await this.planningRepo.save(entry);
    await this.writeAudit('created', saved);

    if (dto.date === this.getTodayString()) {
      await this.applyTodayEffect(dto.commercialId, 'force_absent');
    }

    return saved;
  }

  async createAbsenceRange(dto: CreateAbsenceRangeDto): Promise<{ created: number; skipped: number }> {
    if (dto.dateStart > dto.dateEnd) {
      throw new BadRequestException('dateStart doit être antérieure ou égale à dateEnd.');
    }

    const days = this.daysInRange(dto.dateStart, dto.dateEnd);
    const today = this.getTodayString();
    let created = 0;
    let skipped = 0;

    for (const date of days) {
      const conflict = await this.planningRepo.findOne({
        where: { commercialId: dto.commercialId, date },
        select: ['id'],
      });
      if (conflict) { skipped++; continue; }

      const entry = this.planningRepo.create({
        commercialId: dto.commercialId,
        type: 'absence',
        date,
        reason: dto.reason,
        declaredBy: dto.declaredBy,
        timeSlot: dto.timeSlot ?? 'full',
      });
      const saved = await this.planningRepo.save(entry);
      await this.writeAudit('created', saved);
      created++;

      if (date === today) {
        await this.applyTodayEffect(dto.commercialId, 'force_absent');
      }
    }

    return { created, skipped };
  }

  private daysInRange(dateStart: string, dateEnd: string): string[] {
    const days: string[] = [];
    const cur = new Date(dateStart + 'T12:00:00Z');
    const end = new Date(dateEnd + 'T12:00:00Z');
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
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

    await Promise.all([
      this.writeAudit('created', result.absence),
      this.writeAudit('created', result.exceptional),
    ]);

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

  async findByMonth(year: number, month: number): Promise<CommercialPlanning[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return this.planningRepo.find({
      where: { date: Between(start, end) },
      relations: ['commercial', 'linkedCommercial', 'overridePoste'],
      order: { date: 'ASC', type: 'ASC' },
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

    if (isToday) {
      await Promise.all(affectedIds.map((cid) => this.applyTodayEffect(cid, 'restore')));
    }
  }

  async getAudit(filters: {
    commercialId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filters.commercialId) { conditions.push('commercial_id = ?'); params.push(filters.commercialId); }
      if (filters.from) { conditions.push('date >= ?'); params.push(filters.from); }
      if (filters.to)   { conditions.push('date <= ?'); params.push(filters.to); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters.limit ?? 100;

      return this.dataSource.query(
        `SELECT id, planning_id AS planningId, action, commercial_id AS commercialId,
                type, date, reason, declared_by AS declaredBy, performed_at AS performedAt
         FROM commercial_planning_audit ${where}
         ORDER BY performed_at DESC
         LIMIT ${limit}`,
        params,
      ) as Promise<Record<string, unknown>[]>;
    } catch {
      return [];
    }
  }

  async getAbsenceSummary(
    year: number,
    month: number,
  ): Promise<{ commercialId: string; commercialName: string; groupName: string | null; totalDays: number }[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const rows: { commercialId: string; commercialName: string; groupName: string | null; totalDays: number }[] =
      await this.dataSource.query(
        `SELECT cp.commercial_id AS commercialId,
                c.name           AS commercialName,
                g.name           AS groupName,
                COUNT(*)         AS totalDays
         FROM commercial_planning cp
         JOIN whatsapp_commercial c ON c.id = cp.commercial_id
         LEFT JOIN commercial_group g ON g.id = c.group_id
         WHERE cp.type = 'absence' AND cp.date BETWEEN ? AND ?
         GROUP BY cp.commercial_id, c.name, g.name
         ORDER BY totalDays DESC`,
        [start, end],
      );
    return rows.map((r) => ({ ...r, totalDays: Number(r.totalDays) }));
  }
}
