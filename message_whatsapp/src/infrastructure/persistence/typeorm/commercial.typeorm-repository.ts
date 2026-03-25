import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { ICommercialRepository } from 'src/domain/repositories/i-commercial.repository';

@Injectable()
export class CommercialTypeOrmRepository implements ICommercialRepository {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly repo: Repository<WhatsappCommercial>,
  ) {}

  findById(id: string): Promise<WhatsappCommercial | null> {
    return this.repo.findOne({ where: { id } });
  }
}
