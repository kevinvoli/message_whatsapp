import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallLog } from './entities/call_log.entity';
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
}
