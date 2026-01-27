import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappPoste } from './entities/whatsapp_poste.entity';

@Injectable()
export class WhatsappPosteService {

  constructor(
@InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
   
  ){}

  create(createWhatsappPosteDto: CreateWhatsappPosteDto) {
    return 'This action adds a new whatsappPoste';
  }

  findAll() {
    return `This action returns all whatsappPoste`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappPoste`;
  }

  async findOneById(id: string):Promise<WhatsappPoste> {
      const poste = await this.posteRepository.findOne({
        where: { id },
      });
      if (!poste) {
        throw new NotFoundException(`User with ID "${id}" not found`);
      }
  
      return poste
    }

  update(id: number, updateWhatsappPosteDto: UpdateWhatsappPosteDto) {
    return `This action updates a #${id} whatsappPoste`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappPoste`;
  }
}
