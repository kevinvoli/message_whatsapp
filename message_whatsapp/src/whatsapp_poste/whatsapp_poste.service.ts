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
    

    const poste=  await this.posteRepository.find({
      order: { created_at: 'DESC' },
      relations:['commercial','messages','chats']
    });

    // console.log("poste a afficcher",poste);
    return poste;
    
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

  async findOneByPosteId(commercialId: string): Promise<WhatsappPoste> {
    const poste = await this.posteRepository.findOne({
      where: { commercial:{id:commercialId},  },
      relations:['commercial','messages','chats']
    });

    if (!poste) {
      throw new NotFoundException(`Poste avec l'id "${commercialId}" introuvable`);
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
  async remove(id: string) {
    const contact = await this.findOneById(id);
    return this.posteRepository.remove(contact);
  }
  // async remove(id: string): Promise<{ message: string }> {
  //   const poste = await this.findOneById(id);

  //   poste.is_active = false;

  //   await this.posteRepository.save(poste);

  //   return {
  //     message: 'Poste désactivé avec succès',
  //   };
  // }

  async setActive(posteId: string, isActive: boolean): Promise<WhatsappPoste> {
  const poste = await this.findOneById(posteId);
  poste.is_active = isActive;
  return await this.posteRepository.save(poste);
}
}
