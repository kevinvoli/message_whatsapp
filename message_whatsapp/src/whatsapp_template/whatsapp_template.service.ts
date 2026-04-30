import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappTemplate } from './entities/whatsapp_template.entity';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';

@Injectable()
export class WhatsappTemplateService {
  private readonly logger = new Logger(WhatsappTemplateService.name);

  constructor(
    @InjectRepository(WhatsappTemplate)
    private readonly templateRepository: Repository<WhatsappTemplate>,
  ) {}

  async findAll(tenantId?: string): Promise<WhatsappTemplate[]> {
    const qb = this.templateRepository
      .createQueryBuilder('t')
      .where('t.deletedAt IS NULL');
    if (tenantId) {
      qb.andWhere('t.tenantId = :tenantId', { tenantId });
    }
    return qb.orderBy('t.createdAt', 'DESC').getMany();
  }

  async create(dto: CreateWhatsappTemplateDto): Promise<WhatsappTemplate> {
    const template = this.templateRepository.create({
      tenantId: dto.tenant_id ?? null,
      channelId: dto.channel_id ?? null,
      name: dto.name,
      category: dto.category as any,
      language: dto.language,
      bodyText: dto.body_text,
      headerType: dto.header_type ?? null,
      headerContent: dto.header_content ?? null,
      footerText: dto.footer_text ?? null,
      status: 'PENDING',
      metaTemplateId: null,
      buttons: null,
      rejectionReason: null,
    });
    return this.templateRepository.save(template);
  }

  async resubmit(id: string): Promise<WhatsappTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template ${id} introuvable`);
    }
    template.status = 'PENDING';
    template.rejectionReason = null;
    return this.templateRepository.save(template);
  }

  async updateStatusFromWebhook(
    metaTemplateId: string,
    status: string,
    rejectionReason?: string,
  ): Promise<void> {
    const template = await this.templateRepository.findOne({
      where: { metaTemplateId },
    });
    if (!template) {
      this.logger.warn(
        `Template meta_template_id=${metaTemplateId} non trouvé pour mise à jour statut`,
      );
      return;
    }
    template.status = status as any;
    if (rejectionReason) {
      template.rejectionReason = rejectionReason;
    }
    await this.templateRepository.save(template);
  }
}
