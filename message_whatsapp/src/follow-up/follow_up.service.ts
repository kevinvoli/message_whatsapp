import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThan, Repository } from 'typeorm';
import { FollowUp, FollowUpStatus, FollowUpType } from './entities/follow_up.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface UpsertFollowUpPayload {
  contact_id?: string | null;
  conversation_id?: string | null;
  commercial_id: string;
  commercial_name?: string | null;
  scheduled_at: Date;
  next_action?: string | null;
  notes?: string | null;
}

function mapNextActionToType(nextAction: string | null | undefined): FollowUpType {
  switch (nextAction) {
    case 'rappeler':      return FollowUpType.RAPPEL;
    case 'relancer':      return FollowUpType.RELANCE_POST_CONVERSATION;
    case 'envoyer_devis': return FollowUpType.RELANCE_POST_CONVERSATION;
    default:              return FollowUpType.RAPPEL;
  }
}

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    @InjectRepository(FollowUp)
    private readonly repo: Repository<FollowUp>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateFollowUpDto, commercial_id: string, commercial_name: string): Promise<FollowUp> {
    const entity = this.repo.create({
      ...dto,
      scheduled_at: new Date(dto.scheduled_at),
      commercial_id,
      commercial_name,
      status: FollowUpStatus.PLANIFIEE,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`FOLLOW_UP_CREATED id=${saved.id} commercial=${saved.commercial_id} contact=${saved.contact_id ?? '-'} type=${saved.type} scheduled=${saved.scheduled_at.toISOString()}`);
    this.eventEmitter.emit('follow_up.created', {
      followUpId: saved.id,
      contactId: saved.contact_id,
      commercialId: saved.commercial_id,
      scheduledAt: saved.scheduled_at,
      notes: saved.notes ?? undefined,
    });
    return saved;
  }

  async findByContact(contact_id: string): Promise<FollowUp[]> {
    return this.repo.find({
      where: { contact_id },
      order: { scheduled_at: 'ASC' },
    });
  }

  async findByCommercial(
    commercial_id: string,
    status?: FollowUpStatus,
    limit = 50,
    offset = 0,
  ): Promise<{ data: Array<FollowUp & { contact_name: string | null; contact_phone: string | null }>; total: number }> {
    const where: Record<string, unknown> = { commercial_id };
    if (status) where.status = status;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { scheduled_at: 'ASC' },
      take: limit,
      skip: offset,
    });

    const contactIds = [...new Set(data.map((f) => f.contact_id).filter(Boolean) as string[])];
    const contacts = contactIds.length > 0
      ? await this.contactRepo.find({ where: { id: In(contactIds) }, select: ['id', 'name', 'phone'] })
      : [];
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const enriched = data.map((f) => ({
      ...f,
      contact_name:  f.contact_id ? (contactMap.get(f.contact_id)?.name ?? null) : null,
      contact_phone: f.contact_id ? (contactMap.get(f.contact_id)?.phone ?? null) : null,
    }));

    return { data: enriched, total };
  }

  async findDueToday(commercial_id?: string): Promise<Array<FollowUp & { contact_name: string | null; contact_phone: string | null }>> {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.status IN (:...statuses)', { statuses: [FollowUpStatus.PLANIFIEE, FollowUpStatus.EN_RETARD] })
      .andWhere('f.scheduled_at <= :endOfDay', { endOfDay })
      .andWhere('f.deletedAt IS NULL')
      .orderBy('f.scheduled_at', 'ASC');

    if (commercial_id) {
      qb.andWhere('f.commercial_id = :commercial_id', { commercial_id });
    }

    const data = await qb.getMany();

    const contactIds = [...new Set(data.map((f) => f.contact_id).filter(Boolean) as string[])];
    const contacts = contactIds.length > 0
      ? await this.contactRepo.find({ where: { id: In(contactIds) }, select: ['id', 'name', 'phone'] })
      : [];
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    return data.map((f) => ({
      ...f,
      contact_name:  f.contact_id ? (contactMap.get(f.contact_id)?.name ?? null) : null,
      contact_phone: f.contact_id ? (contactMap.get(f.contact_id)?.phone ?? null) : null,
    }));
  }

  async complete(id: string, commercial_id: string, dto: CompleteFollowUpDto): Promise<FollowUp> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Relance ${id} introuvable`);
    if (entity.commercial_id !== commercial_id) throw new NotFoundException(`Relance ${id} introuvable`);

    entity.status = FollowUpStatus.EFFECTUEE;
    entity.completed_at = new Date();
    entity.result = dto.result ?? null;
    if (dto.notes) entity.notes = dto.notes;
    const saved = await this.repo.save(entity);
    this.logger.log(`FOLLOW_UP_COMPLETED id=${saved.id} commercial=${saved.commercial_id} result=${saved.result ?? '-'}`);
    this.eventEmitter.emit('follow_up.completed', {
      followUpId: saved.id,
      contactId: saved.contact_id,
      commercialId: saved.commercial_id,
      outcome: saved.result ?? undefined,
      completedAt: saved.completed_at!,
    });
    return saved;
  }

  async cancel(id: string, commercial_id: string, commercial_name: string, reason?: string): Promise<FollowUp> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Relance ${id} introuvable`);
    if (entity.commercial_id !== commercial_id) throw new NotFoundException(`Relance ${id} introuvable`);

    entity.status       = FollowUpStatus.ANNULEE;
    entity.cancelled_at = new Date();
    entity.cancelled_by = commercial_name;
    entity.cancel_reason = reason ?? null;
    const saved = await this.repo.save(entity);
    this.logger.log(`FOLLOW_UP_CANCELLED id=${saved.id} commercial=${saved.commercial_id} by=${saved.cancelled_by ?? '-'} reason=${saved.cancel_reason ?? '-'}`);
    this.eventEmitter.emit('follow_up.cancelled', {
      followUpId:   saved.id,
      contactId:    saved.contact_id,
      commercialId: saved.commercial_id,
      reason:       saved.cancel_reason ?? undefined,
      cancelledAt:  saved.cancelled_at!,
    });
    return saved;
  }

  async findAllAdmin(
    contact_id?: string,
    commercial_id?: string,
    status?: FollowUpStatus,
    limit = 50,
    offset = 0,
    from?: string,
    to?: string,
  ): Promise<{ data: Array<FollowUp & { contact_name: string | null; contact_phone: string | null }>; total: number }> {
    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.deletedAt IS NULL')
      .orderBy('f.scheduled_at', 'ASC')
      .take(limit)
      .skip(offset);

    if (contact_id)   qb.andWhere('f.contact_id = :contact_id', { contact_id });
    if (commercial_id) qb.andWhere('f.commercial_id = :commercial_id', { commercial_id });
    if (status)       qb.andWhere('f.status = :status', { status });
    if (from)         qb.andWhere('f.scheduled_at >= :from', { from: new Date(from) });
    if (to)           qb.andWhere('f.scheduled_at <= :to', { to: new Date(to) });

    const [data, total] = await qb.getManyAndCount();

    const contactIds = [...new Set(data.map((f) => f.contact_id).filter(Boolean) as string[])];
    const contacts = contactIds.length > 0
      ? await this.contactRepo.find({ where: { id: In(contactIds) }, select: ['id', 'name', 'phone'] })
      : [];
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const enriched = data.map((f) => ({
      ...f,
      contact_name:  f.contact_id ? (contactMap.get(f.contact_id)?.name ?? null) : null,
      contact_phone: f.contact_id ? (contactMap.get(f.contact_id)?.phone ?? null) : null,
    }));

    return { data: enriched, total };
  }

  /** Cron toutes les 15 minutes — marque comme EN_RETARD les relances planifiées passées */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async markOverdue(): Promise<void> {
    const now = new Date();
    const result = await this.repo
      .createQueryBuilder()
      .update(FollowUp)
      .set({ status: FollowUpStatus.EN_RETARD })
      .where('status = :s', { s: FollowUpStatus.PLANIFIEE })
      .andWhere('scheduled_at < :now', { now })
      .andWhere('deleted_at IS NULL')
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`markOverdue: ${result.affected} relance(s) marquée(s) EN_RETARD`);
    }
  }

  async reschedule(id: string, commercial_id: string, newDate: Date): Promise<FollowUp> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Relance ${id} introuvable`);
    if (entity.commercial_id !== commercial_id) throw new NotFoundException(`Relance ${id} introuvable`);
    if (entity.status === FollowUpStatus.EFFECTUEE || entity.status === FollowUpStatus.ANNULEE) {
      throw new BadRequestException('Impossible de reprogrammer une relance terminée');
    }

    entity.scheduled_at = newDate;
    entity.status       = FollowUpStatus.PLANIFIEE;
    entity.reminded_at  = null;
    const saved = await this.repo.save(entity);
    this.logger.log(`FOLLOW_UP_RESCHEDULED id=${saved.id} commercial=${saved.commercial_id} new_date=${saved.scheduled_at.toISOString()}`);
    return saved;
  }

  async countOverdueByCommercial(commercial_id: string): Promise<number> {
    return this.repo.count({
      where: { commercial_id, status: FollowUpStatus.EN_RETARD },
    });
  }

  /**
   * Crée ou met à jour une relance issue d'un dossier ou d'un rapport soumis.
   * Anti-doublon : si une relance active (planifiee|en_retard) existe déjà pour
   * le même commercial+contact+conversation, on met à jour la date et les notes.
   */
  async upsertFromDossierOrReport(
    payload: UpsertFollowUpPayload,
  ): Promise<{ followUp: FollowUp; isNew: boolean }> {
    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.commercial_id = :commercialId', { commercialId: payload.commercial_id })
      .andWhere('f.status IN (:...statuses)', {
        statuses: [FollowUpStatus.PLANIFIEE, FollowUpStatus.EN_RETARD],
      })
      .andWhere('f.deletedAt IS NULL');

    if (payload.contact_id) {
      qb.andWhere('f.contact_id = :contactId', { contactId: payload.contact_id });
    }
    if (payload.conversation_id) {
      qb.andWhere('f.conversation_id = :conversationId', { conversationId: payload.conversation_id });
    }

    const existing = await qb.getOne();

    if (existing) {
      existing.scheduled_at = payload.scheduled_at;
      if (payload.notes !== undefined) existing.notes = payload.notes ?? null;
      if (payload.next_action !== undefined) existing.type = mapNextActionToType(payload.next_action);
      const saved = await this.repo.save(existing);
      this.logger.log(`FOLLOW_UP_UPDATED id=${saved.id} commercial=${saved.commercial_id} scheduled=${saved.scheduled_at.toISOString()}`);
      return { followUp: saved, isNew: false };
    }

    const entity = this.repo.create({
      contact_id:      payload.contact_id ?? null,
      conversation_id: payload.conversation_id ?? null,
      commercial_id:   payload.commercial_id,
      commercial_name: payload.commercial_name ?? null,
      type:            mapNextActionToType(payload.next_action),
      status:          FollowUpStatus.PLANIFIEE,
      scheduled_at:    payload.scheduled_at,
      notes:           payload.notes ?? null,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`FOLLOW_UP_CREATED id=${saved.id} commercial=${saved.commercial_id} contact=${saved.contact_id ?? '-'} type=${saved.type} scheduled=${saved.scheduled_at.toISOString()} source=upsert`);
    this.eventEmitter.emit('follow_up.created', {
      followUpId:   saved.id,
      contactId:    saved.contact_id,
      commercialId: saved.commercial_id,
      scheduledAt:  saved.scheduled_at,
      notes:        saved.notes ?? undefined,
    });
    return { followUp: saved, isNew: true };
  }
}
