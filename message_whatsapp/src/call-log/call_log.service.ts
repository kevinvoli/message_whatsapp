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

  findMissedByCommercial(commercial_id: string, limit = 30): Promise<CallLog[]> {
    // BUG-6 : déduplication par numéro — n'affiche qu'une entrée par client_phone
    // (le plus récent), plus les entrées sans numéro.
    return this.repo
      .createQueryBuilder('cl')
      .where('cl.commercial_id = :cid', { cid: commercial_id })
      .andWhere('cl.outcome = :outcome', { outcome: CallOutcome.PasDeRéponse })
      .andWhere('cl.treated = 0')
      .andWhere(
        '(cl.client_phone IS NULL OR cl.id = (' +
          'SELECT cl2.id FROM call_log cl2 ' +
          'WHERE cl2.commercial_id = cl.commercial_id ' +
          'AND cl2.client_phone = cl.client_phone ' +
          'AND cl2.treated = 0 ' +
          'AND cl2.outcome = :outcome2 ' +
          'ORDER BY cl2.called_at DESC, cl2.id ASC LIMIT 1' +
        '))',
        { outcome2: CallOutcome.PasDeRéponse },
      )
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

    const phone = log.client_phone?.trim() || null;

    // BUG-4 : utiliser repo.manager.createQueryBuilder() pour les UPDATE (évite les
    // conflits de contexte SelectQueryBuilder→UpdateQueryBuilder sur TypeORM 0.3.x)
    if (phone) {
      await this.repo.manager.query(
        'UPDATE call_log SET treated = 1 ' +
        'WHERE commercial_id = ? AND client_phone = ? AND treated = 0 AND outcome = ?',
        [commercial_id, phone, CallOutcome.PasDeRéponse],
      );
    } else {
      await this.repo.manager.query(
        'UPDATE call_log SET treated = 1 WHERE id = ? AND treated = 0',
        [id],
      );
    }

    return { ok: true };
  }

  async treatAllMine(commercial_id: string): Promise<{ treated: number }> {
    const result: { affectedRows: number } = await this.repo.manager.query(
      'UPDATE call_log SET treated = 1 WHERE commercial_id = ? AND treated = 0 AND outcome = ?',
      [commercial_id, CallOutcome.PasDeRéponse],
    );
    return { treated: result?.affectedRows ?? 0 };
  }
}
