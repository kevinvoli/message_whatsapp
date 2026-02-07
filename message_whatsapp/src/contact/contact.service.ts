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

  async findOrCreate(phone: string,chat_id?:string|null, name?: string, ) {

    let contact = await this.repo.findOne({ where: { phone },relations:{
      messages:true
    } });
    if (!chat_id) {
      return
    }
    if (!contact) {
      contact = this.repo.create({ phone, name ,chat_id:chat_id});

      contact = await this.repo.save(contact);

    }

    return contact;
  }

  async findAll() {
    const contact= await this.repo.find({ order: { createdAt: 'DESC' },relations:{
      messages:true,
    } });
    // console.log("mes contact====",contact);
    

    return contact
  }

  async findOne(id: string) {
    const contact = await this.repo.findOne({ where: { id },relations:{
      messages:true
    } });
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