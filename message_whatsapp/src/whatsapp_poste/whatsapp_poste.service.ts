import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WhatsappPoste } from './entities/whatsapp_poste.entity';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';

@Injectable()
export class WhatsappPosteService {
  constructor(
    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
  ) {}

  /* =========================
      CREATE
  ========================== */
  async create(
    createWhatsappPosteDto: CreateWhatsappPosteDto,
  ): Promise<WhatsappPoste> {
    const poste = this.posteRepository.create({
      ...createWhatsappPosteDto,
      is_active: createWhatsappPosteDto?.is_active ?? true,
    });

    return await this.posteRepository.save(poste);
  }

  /* =========================
      FIND ALL
  ========================== */
  async findAll(): Promise<WhatsappPoste[]> {
    return await this.posteRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  /* =========================
      FIND ONE BY ID
  ========================== */
  async findOneById(id: string): Promise<WhatsappPoste> {
    const poste = await this.posteRepository.findOne({
      where: { id },
    });

    if (!poste) {
      throw new NotFoundException(`Poste avec l'id "${id}" introuvable`);
    }

    return poste;
  }

  /* =========================
      UPDATE
  ========================== */
  async update(
    id: string,
    updateWhatsappPosteDto: UpdateWhatsappPosteDto,
  ): Promise<WhatsappPoste> {
    const poste = await this.findOneById(id);

    Object.assign(poste, updateWhatsappPosteDto);

    return await this.posteRepository.save(poste);
  }

  /* =========================
      REMOVE (LOGICAL)
  ========================== */
  async remove(id: string): Promise<{ message: string }> {
    const poste = await this.findOneById(id);

    poste.is_active = false;

    await this.posteRepository.save(poste);

    return {
      message: 'Poste désactivé avec succès',
    };
  }
}
