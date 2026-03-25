import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { IMediaRepository } from 'src/domain/repositories/i-media.repository';

@Injectable()
export class MediaTypeOrmRepository implements IMediaRepository {
  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly repo: Repository<WhatsappMedia>,
  ) {}

  build(data: Partial<WhatsappMedia>): WhatsappMedia {
    return this.repo.create(data);
  }

  save(media: WhatsappMedia): Promise<WhatsappMedia> {
    return this.repo.save(media);
  }
}
