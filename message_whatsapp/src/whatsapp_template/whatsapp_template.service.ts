import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import Redis from 'ioredis';
import { WhatsappTemplate, WhatsappTemplateStatus } from './entities/whatsapp_template.entity';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';

@Injectable()
export class WhatsappTemplateService {
  constructor(
    @InjectRepository(WhatsappTemplate)
    private readonly templateRepository: Repository<WhatsappTemplate>,
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    private readonly logger: AppLogger,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly configService: ConfigService,
  ) {}

  private async cachedGet<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    if (this.redis) {
      const raw = await this.redis.get(key);
      if (raw !== null) return JSON.parse(raw) as T;
      const value = await loader();
      await this.redis.setex(key, ttl, JSON.stringify(value));
      return value;
    }
    return loader();
  }

  private async invalidateTemplateKeys(templateId: string, channelId: string, name: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(`template:id:${templateId}`);
    await this.redis.del(`template:approved:${channelId}:${name}`);
  }

  async findAllByChannel(channelId: string, status?: string): Promise<WhatsappTemplate[]> {
    const where: any = { channelId };
    if (status) where.status = status;
    return this.templateRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<WhatsappTemplate | null> {
    return this.cachedGet<WhatsappTemplate | null>(`template:id:${id}`, 300, () =>
      this.templateRepository.findOne({ where: { id } }),
    );
  }

  async findByExternalId(externalId: string): Promise<WhatsappTemplate | null> {
    return this.templateRepository.findOne({ where: { externalId } });
  }

  async findApprovedByName(channelId: string, name: string): Promise<WhatsappTemplate | null> {
    return this.cachedGet<WhatsappTemplate | null>(`template:approved:${channelId}:${name}`, 300, () =>
      this.templateRepository.findOne({
        where: { channelId, name, status: WhatsappTemplateStatus.APPROVED },
      }),
    );
  }

  async create(dto: CreateWhatsappTemplateDto): Promise<WhatsappTemplate> {
    const channel = await this.channelRepository.findOne({ where: { id: dto.channelId } });
    if (!channel) throw new NotFoundException(`Canal ${dto.channelId} introuvable`);

    const template = this.templateRepository.create({
      channelId: dto.channelId,
      name: dto.name,
      language: dto.language ?? 'fr',
      category: dto.category ?? null,
      components: dto.components ?? null,
      externalId: dto.externalId ?? null,
      status: WhatsappTemplateStatus.PENDING,
    });

    if (channel.provider === 'meta') {
      try {
        const externalId = await this.submitToMeta(
          { name: dto.name, language: dto.language ?? 'fr', category: dto.category, components: dto.components },
          channel,
        );
        template.externalId = externalId;
        template.status = WhatsappTemplateStatus.PENDING;
      } catch (err) {
        this.logger.warn(`submitToMeta failed: ${(err as Error).message}`, 'WhatsappTemplateService');
        template.externalId = null;
      }
    } else {
      template.status = WhatsappTemplateStatus.APPROVED;
    }

    return this.templateRepository.save(template);
  }

  async updateStatusByExternalId(
    externalId: string,
    status: WhatsappTemplateStatus | string,
    rejectionReason?: string,
  ): Promise<void> {
    const template = await this.findByExternalId(externalId);
    if (!template) {
      this.logger.warn(
        `updateStatusByExternalId: template externalId=${externalId} introuvable`,
        'WhatsappTemplateService',
      );
      return;
    }

    await this.templateRepository.update(
      { id: template.id },
      { status: status as WhatsappTemplateStatus, rejectionReason: rejectionReason ?? null },
    );

    await this.invalidateTemplateKeys(template.id, template.channelId, template.name);
  }

  async resubmit(id: string, updates?: UpdateWhatsappTemplateDto): Promise<WhatsappTemplate> {
    const template = await this.findOne(id);
    if (!template) throw new NotFoundException(`Template ${id} introuvable`);
    if (template.status !== WhatsappTemplateStatus.REJECTED) {
      throw new BadRequestException('Template doit être REJECTED pour resoumission');
    }

    const channel = await this.channelRepository.findOne({ where: { id: template.channelId } });
    if (!channel || channel.provider !== 'meta') {
      throw new BadRequestException('Resoumission uniquement pour Meta');
    }

    if (updates) {
      if (updates.name) template.name = updates.name;
      if (updates.language) template.language = updates.language;
      if (updates.category !== undefined) template.category = updates.category ?? null;
      if (updates.components !== undefined) template.components = updates.components ?? null;
    }

    const externalId = await this.submitToMeta(
      { name: template.name, language: template.language, category: template.category ?? undefined, components: template.components },
      channel,
    );

    template.externalId = externalId;
    template.status = WhatsappTemplateStatus.PENDING;
    template.rejectionReason = null;

    const saved = await this.templateRepository.save(template);
    await this.invalidateTemplateKeys(saved.id, saved.channelId, saved.name);
    return saved;
  }

  private async submitToMeta(
    data: { name: string; language?: string; category?: string; components?: any },
    channel: WhapiChannel,
  ): Promise<string> {
    const META_API_VERSION = this.configService.get<string>('META_API_VERSION') ?? 'v19.0';
    const wabaId = channel.external_id;
    const token = channel.token;

    if (!wabaId || !token) {
      throw new BadRequestException('Canal Meta sans WABA ID ou token');
    }

    const url = `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates`;
    const payload: any = {
      name: data.name,
      language: data.language ?? 'fr',
    };
    if (data.category) payload.category = data.category;
    if (data.components) payload.components = data.components;

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data.id as string;
    } catch (err: any) {
      const axiosError = err as AxiosError<{ error?: { message?: string } }>;
      const msg = axiosError.response?.data?.error?.message ?? (err as Error).message;
      this.logger.error(`Meta template submission failed: ${msg}`, undefined, 'WhatsappTemplateService');
      throw new BadRequestException(msg ?? 'Meta API error');
    }
  }
}
