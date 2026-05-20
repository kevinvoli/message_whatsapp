import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallLog, CallOutcome } from './entities/call_log.entity';
import { CreateCallLogDto } from './dto/create-call-log.dto';

@Injectable()
export class CallLogService {
  constructor(
    @InjectRepository(CallLog)
    private readonly repo: Repository<CallLog>,
  ) {}

  async create(dto: CreateCallLogDto): Promise<CallLog> {
    const log = this.repo.create({
      ...dto,
      called_at: dto.called_at ?? new Date(),
    });
    return this.repo.save(log);
  }

  findByContactId(contact_id: string): Promise<CallLog[]> {
    return this.repo.find({
      where: { contact_id },
      order: { called_at: 'DESC' },
    });
  }

  findByCommercialId(commercial_id: string): Promise<CallLog[]> {
    return this.repo.find({
      where: { commercial_id },
      order: { called_at: 'DESC' },
    });
  }

  async update(id: string, dto: Partial<CreateCallLogDto>): Promise<CallLog> {
    const log = await this.repo.findOne({ where: { id } });
    if (!log) throw new NotFoundException('CallLog introuvable');
    Object.assign(log, dto);
    return this.repo.save(log);
  }

  async remove(id: string): Promise<void> {
    const log = await this.repo.findOne({ where: { id } });
    if (!log) throw new NotFoundException('CallLog introuvable');
    await this.repo.remove(log);
  }

  findMissedByCommercial(commercial_id: string, limit = 50): Promise<CallLog[]> {
    return this.repo
      .createQueryBuilder('cl')
      .where('cl.commercial_id = :cid', { cid: commercial_id })
      .andWhere('cl.outcome = :outcome', { outcome: CallOutcome.PasDeRéponse })
      .andWhere('cl.treated = 0')
      .orderBy('cl.called_at', 'DESC')
      .take(limit)
      .getMany();
  }

  async markTreated(id: string, commercial_id: string): Promise<{ ok: boolean }> {
    const log = await this.repo.findOne({
      where: { id, commercial_id },
      select: ['id', 'client_phone'],
    });
    if (!log) throw new NotFoundException('CallLog introuvable');

    // Marque tous les appels non traités du même numéro pour éviter les réapparitions
    if (log.client_phone) {
      await this.repo
        .createQueryBuilder()
        .update(CallLog)
        .set({ treated: true })
        .where(
          'commercial_id = :cid AND client_phone = :phone AND treated = 0 AND outcome = :outcome',
          { cid: commercial_id, phone: log.client_phone, outcome: CallOutcome.PasDeRéponse },
        )
        .execute();
    } else {
      await this.repo
        .createQueryBuilder()
        .update(CallLog)
        .set({ treated: true })
        .where('id = :id AND treated = 0', { id })
        .execute();
    }

    return { ok: true };
  }
}
