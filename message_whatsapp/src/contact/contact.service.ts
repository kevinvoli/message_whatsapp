import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateContactDto } from './dto/update-contact.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';

@Injectable()
export class ContactService{
  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
  ) {}

  async findOrCreate(phone: string, name?: string) {
    let contact = await this.repo.findOne({ where: { phone } });

    if (!contact) {
      contact = this.repo.create({ phone, name });
      contact = await this.repo.save(contact);
    }

    return contact;
  }

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const contact = await this.repo.findOne({ where: { id } });
    if (!contact) throw new NotFoundException('Contact introuvable');
    return contact;
  }

  async update(id: string, dto: UpdateContactDto) {
    const contact = await this.findOne(id);
    Object.assign(contact, dto);
    return this.repo.save(contact);
  }

  async remove(id: string) {
    const contact = await this.findOne(id);
    return this.repo.remove(contact);
  }
}