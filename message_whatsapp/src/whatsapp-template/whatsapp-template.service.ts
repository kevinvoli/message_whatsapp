import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import {
  WhatsappTemplate,
  TemplateStatus,
  TemplateCategory,
} from './entities/whatsapp-template.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { META_TEMPLATE_STATUS_EVENT } from 'src/webhooks/adapters/meta-event-handlers/template-status.handler';

@Injectable()
export class WhatsappTemplateService {
  private readonly logger = new Logger(WhatsappTemplateService.name);

  constructor(
    @InjectRepository(WhatsappTemplate)
    private readonly repo: Repository<WhatsappTemplate>,
  ) {}

  async create(dto: CreateTemplateDto): Promise<WhatsappTemplate> {
    const entity = this.repo.create({
      ...dto,
      status: TemplateStatus.PENDING,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(
      `Template créé: ${saved.name} (${saved.language}) tenant=${saved.tenant_id}`,
    );
    return saved;
  }

  async findAll(
    tenantId: string,
    filters?: {
      status?: TemplateStatus;
      category?: TemplateCategory;
      language?: string;
      channelId?: string;
    },
  ): Promise<WhatsappTemplate[]> {
    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId });

    if (filters?.status) {
      qb.andWhere('t.status = :status', { status: filters.status });
    }
    if (filters?.category) {
      qb.andWhere('t.category = :category', { category: filters.category });
    }
    if (filters?.language) {
      qb.andWhere('t.language = :language', { language: filters.language });
    }
    if (filters?.channelId) {
      qb.andWhere('t.channel_id = :channelId', { channelId: filters.channelId });
    }

    return qb.orderBy('t.name', 'ASC').getMany();
  }

  async findOne(id: string, tenantId: string): Promise<WhatsappTemplate> {
    const template = await this.repo.findOne({ where: { id, tenant_id: tenantId } });
    if (!template) throw new NotFoundException(`Template ${id} introuvable`);
    return template;
  }

  async findByMetaId(metaTemplateId: string): Promise<WhatsappTemplate | null> {
    return this.repo.findOne({ where: { meta_template_id: metaTemplateId } });
  }

  /**
   * Met à jour le statut d'un template suite à un webhook Meta.
   * Appelé par l'event handler P4.1.3.
   */
  async updateStatus(
    metaTemplateId: string,
    newStatus: string,
    reason?: string | null,
  ): Promise<void> {
    const template = await this.repo.findOne({
      where: { meta_template_id: metaTemplateId },
    });

    if (!template) {
      this.logger.warn(
        `Template Meta ${metaTemplateId} introuvable en BDD — status update ignoré`,
      );
      return;
    }

    const statusMap: Record<string, TemplateStatus> = {
      APPROVED: TemplateStatus.APPROVED,
      REJECTED: TemplateStatus.REJECTED,
      PAUSED: TemplateStatus.PAUSED,
      DISABLED: TemplateStatus.DISABLED,
      IN_APPEAL: TemplateStatus.IN_APPEAL,
      FLAGGED: TemplateStatus.FLAGGED,
      DELETED: TemplateStatus.DELETED,
    };

    const status = statusMap[newStatus];
    if (!status) {
      this.logger.warn(`Statut Meta inconnu: ${newStatus}`);
      return;
    }

    await this.repo.update(template.id, {
      status,
      rejected_reason: reason ?? null,
    });

    this.logger.log(
      `Template ${template.name} → ${status}` + (reason ? ` (${reason})` : ''),
    );
  }

  async disable(id: string, tenantId: string): Promise<void> {
    const template = await this.findOne(id, tenantId);
    await this.repo.update(template.id, { status: TemplateStatus.DISABLED });
  }

  /** Écoute l'événement émis par TemplateStatusHandler (P4.1.3) */
  @OnEvent(META_TEMPLATE_STATUS_EVENT)
  async onTemplateStatusEvent(payload: {
    metaTemplateId: string;
    newStatus: string;
    reason: string | null;
  }): Promise<void> {
    await this.updateStatus(payload.metaTemplateId, payload.newStatus, payload.reason);
  }
}
