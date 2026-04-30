import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import {
  WhatsappTemplate,
  WhatsappTemplateStatus,
} from './entities/whatsapp_template.entity';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class WhatsappTemplateService {
  private readonly META_API_VERSION =
    process.env.META_API_VERSION ?? 'v22.0';

  constructor(
    @InjectRepository(WhatsappTemplate)
    private readonly templateRepository: Repository<WhatsappTemplate>,
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Liste les templates d'un canal, avec filtre optionnel par statut.
   * Le channelId passé ici est l'UUID de l'entité WhapiChannel (colonne `id`).
   */
  async findAllByChannel(
    channelId: string,
    status?: string,
  ): Promise<WhatsappTemplate[]> {
    const where: Record<string, any> = { channelId };

    const validStatuses = Object.values(WhatsappTemplateStatus) as string[];
    if (status && validStatuses.includes(status.toUpperCase())) {
      where.status = status.toUpperCase() as WhatsappTemplateStatus;
    }

    return this.templateRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Trouve un template par son UUID.
   */
  async findOne(id: string): Promise<WhatsappTemplate | null> {
    return this.templateRepository.findOne({ where: { id } });
  }

  /**
   * Trouve un template par son externalId Meta.
   */
  async findByExternalId(
    externalId: string,
  ): Promise<WhatsappTemplate | null> {
    return this.templateRepository.findOne({ where: { externalId } });
  }

  /**
   * Crée un nouveau template.
   * - Si le canal est Meta : soumet à l'API Graph Meta, stocke l'ID Meta dans externalId, status = PENDING.
   * - Si le canal est Whapi ou autre : status = APPROVED directement (pas de validation externe).
   * - Si l'API Meta est indisponible : status = PENDING, externalId = null, warning loggué.
   */
  async create(dto: CreateWhatsappTemplateDto): Promise<WhatsappTemplate> {
    const channel = await this.channelRepository.findOne({
      where: { id: dto.channelId },
    });

    let initialStatus = dto.status ?? WhatsappTemplateStatus.PENDING;
    let resolvedExternalId = dto.externalId ?? null;

    if (channel) {
      if (channel.provider === 'meta') {
        // Soumettre à Meta et passer en PENDING
        try {
          const metaResult = await this.submitToMeta(
            {
              name: dto.name,
              language: dto.language ?? 'fr',
              category: dto.category ?? null,
              components: dto.components ?? null,
            },
            channel,
          );
          resolvedExternalId = metaResult.id;
          initialStatus = WhatsappTemplateStatus.PENDING;
          this.logger.log(
            `Template "${dto.name}" soumis à Meta avec succès, external_id=${resolvedExternalId}`,
            WhatsappTemplateService.name,
          );
        } catch (error) {
          // API Meta indisponible : créer quand même mais sans external_id
          const reason =
            error instanceof Error ? error.message : 'erreur inconnue';
          this.logger.warn(
            `Soumission Meta échouée pour le template "${dto.name}" (canal ${dto.channelId}): ${reason} — template créé en PENDING sans external_id`,
            WhatsappTemplateService.name,
          );
          resolvedExternalId = null;
          initialStatus = WhatsappTemplateStatus.PENDING;
        }
      } else {
        // Whapi ou autre provider : approuvé directement
        initialStatus = WhatsappTemplateStatus.APPROVED;
        this.logger.log(
          `Template "${dto.name}" sur canal ${channel.provider ?? 'inconnu'} — statut APPROVED directement`,
          WhatsappTemplateService.name,
        );
      }
    }

    const template = this.templateRepository.create({
      channelId: dto.channelId,
      name: dto.name,
      language: dto.language ?? 'fr',
      category: dto.category ?? null,
      status: initialStatus,
      components: dto.components ?? null,
      externalId: resolvedExternalId,
      rejectionReason: null,
    });

    return this.templateRepository.save(template);
  }

  /**
   * Met à jour le statut d'un template par son externalId Meta.
   * Appelé par le handler de webhook `message_template_status_update`.
   * Retourne null si le template n'existe pas.
   */
  async updateStatusByExternalId(
    externalId: string,
    status: string,
    rejectionReason?: string | null,
  ): Promise<WhatsappTemplate | null> {
    const template = await this.templateRepository.findOne({
      where: { externalId },
    });

    if (!template) {
      this.logger.warn(
        `updateStatusByExternalId: aucun template trouvé pour external_id=${externalId}`,
        WhatsappTemplateService.name,
      );
      return null;
    }

    const validStatuses = Object.values(
      WhatsappTemplateStatus,
    ) as string[];
    const upperStatus = status.toUpperCase();
    if (!validStatuses.includes(upperStatus)) {
      this.logger.warn(
        `updateStatusByExternalId: statut invalide "${status}" pour external_id=${externalId} — ignoré`,
        WhatsappTemplateService.name,
      );
      return null;
    }

    template.status = upperStatus as WhatsappTemplateStatus;
    template.rejectionReason = rejectionReason ?? null;

    const updated = await this.templateRepository.save(template);
    this.logger.log(
      `Template external_id=${externalId} mis à jour: status=${updated.status}${updated.rejectionReason ? ` reason="${updated.rejectionReason}"` : ''}`,
      WhatsappTemplateService.name,
    );
    return updated;
  }

  /**
   * Trouve un template APPROVED par channelId et nom.
   * Utilisé pour la recherche par nom lors de l'envoi.
   */
  async findApprovedByName(
    channelId: string,
    name: string,
  ): Promise<WhatsappTemplate | null> {
    return this.templateRepository.findOne({
      where: {
        channelId,
        name,
        status: WhatsappTemplateStatus.APPROVED,
      },
    });
  }

  /**
   * Re-soumet un template rejeté à Meta sans créer de doublon.
   * - Vérifie que le template existe et est en statut REJECTED.
   * - Vérifie que le canal est bien un canal Meta.
   * - Applique les modifications optionnelles (name, language, category, components).
   * - Appelle submitToMeta() et met à jour le template existant en DB.
   * - Retourne le template mis à jour (status PENDING, rejectionReason null).
   */
  async resubmit(
    id: string,
    updates?: UpdateWhatsappTemplateDto,
  ): Promise<WhatsappTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['channel'],
    });

    if (!template) {
      throw new NotFoundException(`Template introuvable (id=${id})`);
    }

    if (template.status !== WhatsappTemplateStatus.REJECTED) {
      throw new BadRequestException(
        `Ce template n'est pas rejeté (statut actuel: ${template.status})`,
      );
    }

    if (!template.channel || template.channel.provider !== 'meta') {
      throw new BadRequestException(
        'La re-soumission à Meta n\'est disponible que pour les canaux Meta',
      );
    }

    // Appliquer les modifications optionnelles sur l'entité
    if (updates) {
      if (updates.name !== undefined) template.name = updates.name;
      if (updates.language !== undefined) template.language = updates.language;
      if (updates.category !== undefined) template.category = updates.category;
      if (updates.components !== undefined) template.components = updates.components;
    }

    // Re-soumettre à Meta — si l'appel échoue, la BadRequestException se propage
    const metaResult = await this.submitToMeta(
      {
        name: template.name,
        language: template.language,
        category: template.category,
        components: template.components,
      },
      template.channel,
    );

    // Mettre à jour le template existant
    template.status = WhatsappTemplateStatus.PENDING;
    template.rejectionReason = null;
    template.externalId = metaResult.id;

    const updated = await this.templateRepository.save(template);

    this.logger.log(
      `Template id=${id} re-soumis à Meta avec succès: nouveau external_id=${metaResult.id}`,
      WhatsappTemplateService.name,
    );

    return updated;
  }

  /**
   * Soumet un template à l'API Graph Meta pour validation.
   * POST https://graph.facebook.com/{version}/{waba_id}/message_templates
   * Le WABA ID est stocké dans channel.external_id pour les canaux Meta.
   */
  private async submitToMeta(
    data: {
      name: string;
      language: string;
      category: string | null;
      components: any | null;
    },
    channel: WhapiChannel,
  ): Promise<{ id: string }> {
    const wabaId = channel.external_id;
    if (!wabaId) {
      throw new BadRequestException(
        `Le canal ${channel.id} n'a pas de WABA ID (external_id) configuré`,
      );
    }

    const accessToken = channel.token;
    if (!accessToken) {
      throw new BadRequestException(
        `Le canal ${channel.id} n'a pas de token d'accès configuré`,
      );
    }

    const url = `https://graph.facebook.com/${this.META_API_VERSION}/${wabaId}/message_templates`;

    const payload: Record<string, any> = {
      name: data.name,
      language: data.language,
    };

    if (data.category) {
      payload.category = data.category;
    }

    if (data.components && Array.isArray(data.components)) {
      payload.components = data.components;
    }

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const metaId = response.data?.id;
      if (!metaId) {
        throw new BadRequestException(
          'La réponse de Meta ne contient pas d\'ID pour le template',
        );
      }

      return { id: String(metaId) };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as
        | { error?: { message?: string; code?: number; fbtrace_id?: string } }
        | undefined;
      const metaMessage =
        responseData?.error?.message ??
        axiosError.message ??
        'erreur inconnue';
      const metaCode = responseData?.error?.code;
      const metaTrace = responseData?.error?.fbtrace_id;
      const statusCode = axiosError.response?.status;

      this.logger.error(
        `Meta template submission failed: waba_id=${wabaId} status=${statusCode ?? 'unknown'} code=${metaCode ?? 'unknown'} trace=${metaTrace ?? 'unknown'} message=${metaMessage}`,
        axiosError.stack,
        WhatsappTemplateService.name,
      );

      throw new BadRequestException(
        `Soumission Meta échouée: ${metaMessage}`,
      );
    }
  }
}
