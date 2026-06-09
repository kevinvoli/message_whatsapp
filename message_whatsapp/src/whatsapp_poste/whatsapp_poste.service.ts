import { BadRequestException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WhatsappPoste } from './entities/whatsapp_poste.entity';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';
import { UpdatePostePanelDto } from './dto/update-poste-panel.dto';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class WhatsappPosteService {
  private readonly logger = new Logger(WhatsappPosteService.name);

  constructor(
    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepo: Repository<WhatsappMedia>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  private handleServiceError(error: unknown, context: string): never {
    if (error instanceof HttpException) { throw error; }
    this.logger.error(`Erreur lors de ${context}`, error instanceof Error ? error.stack : undefined);
    throw new InternalServerErrorException(`Impossible de ${context}`);
  }

  async create(createWhatsappPosteDto: CreateWhatsappPosteDto): Promise<WhatsappPoste> {
    try {
      const poste = this.posteRepository.create({ ...createWhatsappPosteDto, is_active: createWhatsappPosteDto?.is_active ?? true, is_queue_enabled: createWhatsappPosteDto?.is_queue_enabled ?? true });
      return await this.posteRepository.save(poste);
    } catch (error) { this.handleServiceError(error, 'creer le poste'); }
  }

  async findAll(): Promise<WhatsappPoste[]> {
    try {
      return await this.posteRepository.find({ order: { createdAt: 'DESC' }, relations: ['commercial', 'channels'] });
    } catch (error) { this.handleServiceError(error, 'recuperer les postes'); }
  }

  async findOneById(id: string): Promise<WhatsappPoste> {
    try {
      const poste = await this.posteRepository.findOne({ where: { id } });
      if (!poste) { throw new NotFoundException(`Poste avec l'id "${id}" introuvable`); }
      return poste;
    } catch (error) { this.handleServiceError(error, `recuperer le poste ${id}`); }
  }

  async findOneByPosteId(commercialId: string): Promise<WhatsappPoste> {
    try {
      const poste = await this.posteRepository.findOne({ where: { commercial: { id: commercialId } }, relations: ['commercial', 'messages', 'chats'] });
      if (!poste) { throw new NotFoundException(`Poste avec l'id "${commercialId}" introuvable`); }
      return poste;
    } catch (error) { this.handleServiceError(error, `recuperer le poste du commercial ${commercialId}`); }
  }

  async update(id: string, updateWhatsappPosteDto: UpdateWhatsappPosteDto): Promise<WhatsappPoste> {
    try {
      const poste = await this.findOneById(id);
      const nextQueueEnabled = updateWhatsappPosteDto.is_queue_enabled ?? poste.is_queue_enabled;
      const nextIsActive = updateWhatsappPosteDto.is_active ?? poste.is_active;
      if (nextQueueEnabled === false && nextIsActive) {
        throw new BadRequestException("Ce poste est bloque dans la file. Debloquez-le avant de l'activer.");
      }
      Object.assign(poste, updateWhatsappPosteDto);
      if (nextQueueEnabled === false) { poste.is_active = false; }
      return await this.posteRepository.save(poste);
    } catch (error) { this.handleServiceError(error, `mettre a jour le poste ${id}`); }
  }

  async remove(id: string) {
    try { const contact = await this.findOneById(id); return await this.posteRepository.remove(contact); }
    catch (error) { this.handleServiceError(error, `supprimer le poste ${id}`); }
  }

  async setActive(posteId: string, isActive: boolean): Promise<WhatsappPoste> {
    try { const poste = await this.findOneById(posteId); poste.is_active = isActive; return await this.posteRepository.save(poste); }
    catch (error) { this.handleServiceError(error, `mettre a jour l'etat actif du poste ${posteId}`); }
  }

  async setQueueEnabled(posteId: string, isQueueEnabled: boolean): Promise<WhatsappPoste> {
    try { const poste = await this.findOneById(posteId); poste.is_queue_enabled = isQueueEnabled; if (!isQueueEnabled) { poste.is_active = false; } return await this.posteRepository.save(poste); }
    catch (error) { this.handleServiceError(error, `mettre a jour la file du poste ${posteId}`); }
  }

  // === PANNEAU MEDIAS ===

  async getPanelConfig(posteId: string): Promise<{ enabled: boolean; types: string[] }> {
    try {
      const poste = await this.posteRepository.findOneByOrFail({ id: posteId });
      return { enabled: Boolean(poste.media_panel_enabled), types: poste.media_panel_types ? JSON.parse(poste.media_panel_types) : [] };
    } catch (error) { this.handleServiceError(error, `recuperer la config du panneau du poste ${posteId}`); }
  }

  async updatePanelConfig(posteId: string, dto: UpdatePostePanelDto): Promise<void> {
    try {
      await this.posteRepository.update(posteId, { media_panel_enabled: dto.enabled, media_panel_types: dto.types.length > 0 ? JSON.stringify(dto.types) : null });
    } catch (error) { this.handleServiceError(error, `mettre a jour la config du panneau du poste ${posteId}`); }
  }

  async getPanelMediaForCommercial(commercialId: string, page = 1, limit = 30): Promise<{ enabled: boolean; types: string[]; items: WhatsappMedia[]; total: number; pages: number }> {
    try {
      const commercial = await this.commercialRepo.findOne({ where: { id: commercialId }, relations: ['poste'] });
      const poste = commercial?.poste;
      if (!poste?.media_panel_enabled) { return { enabled: false, types: [], items: [], total: 0, pages: 0 }; }
      const types: string[] = poste.media_panel_types ? JSON.parse(poste.media_panel_types) : [];
      if (types.length === 0) { return { enabled: true, types: [], items: [], total: 0, pages: 0 }; }
      const qb = this.mediaRepo
        .createQueryBuilder('media')
        .innerJoin('media.message', 'msg')
        .select(['media.id', 'media.local_url', 'media.media_type', 'media.mime_type', 'media.file_name', 'media.file_size', 'media.duration_seconds', 'media.downloaded_at', 'media.createdAt', 'msg.direction', 'msg.from_name', 'msg.from'])
        .where('msg.poste_id = :posteId', { posteId: poste.id })
        .andWhere('media.local_url IS NOT NULL')
        .andWhere('media.media_type IN (:...types)', { types })
        .andWhere('media.deletedAt IS NULL')
        .andWhere('msg.deletedAt IS NULL')
        .orderBy('media.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);
      const [items, total] = await qb.getManyAndCount();
      return { enabled: true, types, items, total, pages: Math.ceil(total / limit) };
    } catch (error) { this.handleServiceError(error, `recuperer les medias du panneau pour le commercial ${commercialId}`); }
  }
}
