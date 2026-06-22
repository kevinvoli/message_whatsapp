import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import axios, { AxiosError } from 'axios';
import {
  WhatsappTemplate,
  TemplateStatus,
  TemplateCategory,
  TemplateHeaderType,
} from './entities/whatsapp-template.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { META_TEMPLATE_STATUS_EVENT } from 'src/webhooks/adapters/meta-event-handlers/template-status.handler';

export interface BaseModel {
  key: string;
  label: string;
  category: string;
  components: string[];
}

export const TEMPLATE_BASE_MODELS: BaseModel[] = [
  { key: 'text_simple',      label: 'Texte simple',             category: 'UTILITY',        components: ['BODY'] },
  { key: 'text_cta_url',     label: 'Texte + bouton lien',      category: 'MARKETING',      components: ['BODY', 'BUTTONS_URL'] },
  { key: 'text_cta_call',    label: 'Texte + bouton appel',     category: 'MARKETING',      components: ['BODY', 'BUTTONS_CALL'] },
  { key: 'text_quick_reply', label: 'Texte + réponses rapides', category: 'MARKETING',      components: ['BODY', 'BUTTONS_QUICK_REPLY'] },
  { key: 'image_body',       label: 'Image + texte',            category: 'MARKETING',      components: ['HEADER_IMAGE', 'BODY'] },
  { key: 'video_body',       label: 'Vidéo + texte',            category: 'MARKETING',      components: ['HEADER_VIDEO', 'BODY'] },
  { key: 'document_body',    label: 'Document + texte',         category: 'UTILITY',        components: ['HEADER_DOCUMENT', 'BODY'] },
  { key: 'text_footer',      label: 'Texte + footer',           category: 'UTILITY',        components: ['BODY', 'FOOTER'] },
  { key: 'otp',              label: 'Code OTP',                 category: 'AUTHENTICATION', components: ['BODY'] },
];

@Injectable()
export class WhatsappTemplateService {
  private readonly logger = new Logger(WhatsappTemplateService.name);
  private readonly META_API_VERSION = process.env.META_API_VERSION ?? 'v20.0';

  constructor(
    @InjectRepository(WhatsappTemplate)
    private readonly repo: Repository<WhatsappTemplate>,
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
  ) {}

  async create(dto: CreateTemplateDto): Promise<WhatsappTemplate> {
    const entity = this.repo.create({
      tenant_id: dto.tenant_id,
      channel_id: dto.channel_id,
      name: dto.name,
      category: dto.category,
      language: dto.language,
      header_type: dto.header_type,
      header_content: dto.header_content,
      body_text: dto.body_text,
      footer_text: dto.footer_text,
      parameters: dto.parameters,
      buttons: dto.buttons,
      baseModel: dto.base_model ?? null,
      headerText: dto.header_text ?? null,
      headerExample: dto.header_example ?? null,
      bodyExampleVariables: dto.body_example_variables ?? null,
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

  getBaseModels(): BaseModel[] {
    return TEMPLATE_BASE_MODELS;
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateTemplateDto,
  ): Promise<WhatsappTemplate> {
    const template = await this.findOne(id, tenantId);

    const isEditable =
      (template.status === TemplateStatus.PENDING && template.submittedAt === null) ||
      template.status === TemplateStatus.REJECTED;

    if (!isEditable) {
      throw new BadRequestException('Template non modifiable dans ce statut');
    }

    const updated = this.repo.merge(template, {
      channel_id: dto.channel_id !== undefined ? dto.channel_id : template.channel_id,
      name: dto.name ?? template.name,
      category: dto.category ?? template.category,
      language: dto.language ?? template.language,
      header_type: dto.header_type !== undefined ? dto.header_type : template.header_type,
      header_content: dto.header_content !== undefined ? dto.header_content : template.header_content,
      body_text: dto.body_text ?? template.body_text,
      footer_text: dto.footer_text !== undefined ? dto.footer_text : template.footer_text,
      parameters: dto.parameters !== undefined ? dto.parameters : template.parameters,
      buttons: dto.buttons !== undefined ? dto.buttons : template.buttons,
      baseModel: dto.base_model !== undefined ? dto.base_model : template.baseModel,
      headerText: dto.header_text !== undefined ? dto.header_text : template.headerText,
      headerExample: dto.header_example !== undefined ? dto.header_example : template.headerExample,
      bodyExampleVariables:
        dto.body_example_variables !== undefined
          ? dto.body_example_variables
          : template.bodyExampleVariables,
    });

    return this.repo.save(updated);
  }

  async submitToMeta(id: string, tenantId: string): Promise<WhatsappTemplate> {
    const template = await this.findOne(id, tenantId);

    const isSubmittable =
      (template.status === TemplateStatus.PENDING && template.submittedAt === null) ||
      template.status === TemplateStatus.REJECTED;

    if (!isSubmittable) {
      throw new BadRequestException(
        'Template non soumissible dans ce statut',
      );
    }

    if (!template.channel_id) {
      throw new BadRequestException('Canal Meta requis pour soumettre un template');
    }

    const channel = await this.channelRepo.findOne({
      where: { id: template.channel_id },
    });

    if (!channel) {
      throw new BadRequestException('Canal Meta requis pour soumettre un template');
    }

    const wabaId = channel.waba_id ?? channel.external_id;

    if (!wabaId) {
      throw new BadRequestException(
        'Canal Meta sans WABA ID (waba_id) — configurez-le dans les paramètres du canal',
      );
    }

    const token = channel.token;

    const components: Record<string, unknown>[] = [];

    if (template.header_type) {
      if (template.header_type === TemplateHeaderType.TEXT) {
        components.push({
          type: 'HEADER',
          format: 'TEXT',
          text: template.headerText ?? template.header_content ?? '',
        });
      } else {
        const headerComponent: Record<string, unknown> = {
          type: 'HEADER',
          format: template.header_type,
        };
        if (template.headerExample) {
          headerComponent.example = { header_handle: [template.headerExample] };
        }
        components.push(headerComponent);
      }
    }

    const bodyComponent: Record<string, unknown> = {
      type: 'BODY',
      text: template.body_text,
    };
    if (template.bodyExampleVariables && template.bodyExampleVariables.length > 0) {
      bodyComponent.example = { body_text: [template.bodyExampleVariables] };
    }
    components.push(bodyComponent);

    if (template.footer_text) {
      components.push({ type: 'FOOTER', text: template.footer_text });
    }

    if (template.buttons && template.buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons: template.buttons });
    }

    const payload = {
      name: template.name,
      language: template.language,
      category: template.category,
      components,
    };

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${this.META_API_VERSION}/${wabaId}/message_templates`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      template.meta_template_id = String(response.data.id);
      template.submittedAt = new Date();
      template.submissionError = null;

      const saved = await this.repo.save(template);
      this.logger.log(
        `Template ${template.name} soumis à Meta — meta_id=${saved.meta_template_id}`,
      );
      return saved;
    } catch (e) {
      const axiosError = e as AxiosError;
      const responseData = axiosError.response?.data as
        | { error?: { message?: string } }
        | undefined;
      const errorMessage =
        responseData?.error?.message ?? axiosError.message ?? 'Erreur Meta inconnue';

      template.submissionError = errorMessage;
      await this.repo.save(template);

      this.logger.error(
        `Soumission Meta échouée pour template ${template.name}: ${errorMessage}`,
      );
      throw new BadRequestException(errorMessage);
    }
  }

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

    if (template.status === status) {
      this.logger.log(
        `Template ${template.name} déjà à jour — statut ${status} inchangé`,
      );
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

  /** Recherche un template par UUID sans contrainte de tenant — usage interne uniquement */
  async findById(id: string): Promise<WhatsappTemplate | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Recherche tous les templates d'un canal — usage interne uniquement, sans contrainte de tenant */
  async findAllByChannelId(channelId: string, status?: string): Promise<WhatsappTemplate[]> {
    const qb = this.repo.createQueryBuilder('t').where('t.channel_id = :channelId', { channelId });
    if (status) {
      qb.andWhere('t.status = :status', { status });
    }
    return qb.orderBy('t.name', 'ASC').getMany();
  }

  @OnEvent(META_TEMPLATE_STATUS_EVENT)
  async onTemplateStatusEvent(payload: {
    metaTemplateId: string;
    newStatus: string;
    reason: string | null;
  }): Promise<void> {
    await this.updateStatus(payload.metaTemplateId, payload.newStatus, payload.reason);
  }
}
