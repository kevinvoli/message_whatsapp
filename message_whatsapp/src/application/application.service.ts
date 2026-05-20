import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MessagingApplication } from './entities/messaging-application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';

@Injectable()
export class ApplicationService {
  constructor(
    @InjectRepository(MessagingApplication)
    private readonly repo: Repository<MessagingApplication>,
  ) {}

  async create(dto: CreateApplicationDto): Promise<ApplicationResponseDto> {
    const app = this.repo.create({
      id: uuidv4(),
      label: dto.label,
      provider: dto.provider ?? 'meta',
      appId: dto.appId,
      appSecret: dto.appSecret,
      systemToken: dto.systemToken?.trim() || null,
    });
    const saved = await this.repo.save(app);
    return ApplicationResponseDto.from(saved, 0);
  }

  async findAll(): Promise<ApplicationResponseDto[]> {
    const rows = await this.repo
      .createQueryBuilder('app')
      .loadRelationCountAndMap('app.channelCount', 'app.channels')
      .orderBy('app.createdAt', 'DESC')
      .getMany();

    return rows.map((app) =>
      ApplicationResponseDto.from(app, (app as any).channelCount ?? 0),
    );
  }

  async findOne(id: string): Promise<MessagingApplication> {
    const app = await this.repo.findOne({ where: { id } });
    if (!app) throw new NotFoundException(`Application ${id} introuvable`);
    return app;
  }

  async findOneAsDto(id: string): Promise<ApplicationResponseDto> {
    const app = await this.findOne(id);
    const count = await this.repo
      .createQueryBuilder('app')
      .relation(MessagingApplication, 'channels')
      .of(id)
      .loadMany()
      .then((channels) => channels.length);
    return ApplicationResponseDto.from(app, count);
  }

  async update(id: string, dto: UpdateApplicationDto): Promise<ApplicationResponseDto> {
    const app = await this.findOne(id);

    if (dto.label !== undefined) app.label = dto.label;
    if (dto.provider !== undefined) app.provider = dto.provider;
    if (dto.appId !== undefined) app.appId = dto.appId;
    if (dto.appSecret !== undefined) app.appSecret = dto.appSecret;
    if (dto.systemToken !== undefined) {
      app.systemToken = dto.systemToken?.trim() || null;
    }

    const saved = await this.repo.save(app);
    return ApplicationResponseDto.from(saved);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    const channelCount = await this.repo
      .createQueryBuilder('app')
      .relation(MessagingApplication, 'channels')
      .of(id)
      .loadMany()
      .then((channels) => channels.length);

    if (channelCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${channelCount} canal(aux) utilisent cette application.`,
      );
    }

    await this.repo.delete(id);
  }

  async listChannels(id: string) {
    await this.findOne(id);
    return this.repo
      .createQueryBuilder('app')
      .relation(MessagingApplication, 'channels')
      .of(id)
      .loadMany();
  }
}
