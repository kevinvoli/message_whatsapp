import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WhatsappPoste } from './entities/whatsapp_poste.entity';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';

@Injectable()
export class WhatsappPosteService {
  private readonly logger = new Logger(WhatsappPosteService.name);

  constructor(
    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
  ) {}

  private handleServiceError(error: unknown, context: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    this.logger.error(
      `Erreur lors de ${context}`,
      error instanceof Error ? error.stack : undefined,
    );

    throw new InternalServerErrorException(`Impossible de ${context}`);
  }

  /* =========================
      CREATE
  ========================== */
  async create(
    createWhatsappPosteDto: CreateWhatsappPosteDto,
  ): Promise<WhatsappPoste> {
    try {
      const poste = this.posteRepository.create({
        ...createWhatsappPosteDto,
        is_active: createWhatsappPosteDto?.is_active ?? true,
        is_queue_enabled: createWhatsappPosteDto?.is_queue_enabled ?? true,
      });

      return await this.posteRepository.save(poste);
    } catch (error) {
      this.handleServiceError(error, 'creer le poste');
    }
  }

  /* =========================
      FIND ALL
  ========================== */

  async findAll(): Promise<WhatsappPoste[]> {
    try {
      const poste = await this.posteRepository.find({
        order: { created_at: 'DESC' },
        relations: ['commercial', 'messages', 'chats'],
      });

      return poste;
    } catch (error) {
      this.handleServiceError(error, 'recuperer les postes');
    }
  }

  /* =========================
      FIND ONE BY ID
  ========================== */
  async findOneById(id: string): Promise<WhatsappPoste> {
    try {
      const poste = await this.posteRepository.findOne({
        where: { id },
      });

      if (!poste) {
        throw new NotFoundException(`Poste avec l'id "${id}" introuvable`);
      }

      return poste;
    } catch (error) {
      this.handleServiceError(error, `recuperer le poste ${id}`);
    }
  }

  async findOneByPosteId(commercialId: string): Promise<WhatsappPoste> {
    try {
      const poste = await this.posteRepository.findOne({
        where: { commercial: { id: commercialId } },
        relations: ['commercial', 'messages', 'chats'],
      });

      if (!poste) {
        throw new NotFoundException(
          `Poste avec l'id "${commercialId}" introuvable`,
        );
      }
      return poste;
    } catch (error) {
      this.handleServiceError(
        error,
        `recuperer le poste du commercial ${commercialId}`,
      );
    }
  }

  /* =========================
      UPDATE
  ========================== */
  async update(
    id: string,
    updateWhatsappPosteDto: UpdateWhatsappPosteDto,
  ): Promise<WhatsappPoste> {
    try {
      const poste = await this.findOneById(id);

      const nextQueueEnabled =
        updateWhatsappPosteDto.is_queue_enabled ?? poste.is_queue_enabled;
      const nextIsActive = updateWhatsappPosteDto.is_active ?? poste.is_active;

      if (nextQueueEnabled === false && nextIsActive) {
        throw new BadRequestException(
          "Ce poste est bloque dans la file. Debloquez-le avant de l'activer.",
        );
      }

      Object.assign(poste, updateWhatsappPosteDto);
      if (nextQueueEnabled === false) {
        poste.is_active = false;
      }

      return await this.posteRepository.save(poste);
    } catch (error) {
      this.handleServiceError(error, `mettre a jour le poste ${id}`);
    }
  }

  /* =========================
      REMOVE (LOGICAL)
  ========================== */
  async remove(id: string) {
    try {
      const contact = await this.findOneById(id);
      return await this.posteRepository.remove(contact);
    } catch (error) {
      this.handleServiceError(error, `supprimer le poste ${id}`);
    }
  }

  async setActive(posteId: string, isActive: boolean): Promise<WhatsappPoste> {
    try {
      const poste = await this.findOneById(posteId);
      poste.is_active = isActive;
      return await this.posteRepository.save(poste);
    } catch (error) {
      this.handleServiceError(
        error,
        `mettre a jour l'etat actif du poste ${posteId}`,
      );
    }
  }

  async setQueueEnabled(
    posteId: string,
    isQueueEnabled: boolean,
  ): Promise<WhatsappPoste> {
    try {
      const poste = await this.findOneById(posteId);
      poste.is_queue_enabled = isQueueEnabled;
      if (!isQueueEnabled) {
        poste.is_active = false;
      }
      return await this.posteRepository.save(poste);
    } catch (error) {
      this.handleServiceError(error, `mettre a jour la file du poste ${posteId}`);
    }
  }
}
