import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactCallDto } from './dto/update-contact-call.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
  ) {}

  async create(dto: CreateContactDto) {
    const contact = this.repo.create(dto);
    return this.repo.save(contact);
  }

  async findOrCreate(phone: string, chat_id?: string | null, name?: string) {
    let contact = await this.repo.findOne({
      where: { phone },
      relations: {
        messages: true,
      },
    });

    if (!contact) {
      contact = this.repo.create({
        phone,
        name: name ?? phone,
        chat_id: chat_id ?? undefined,
      });
      return this.repo.save(contact);
    }

    // Keep chat link and display name fresh when webhook provides new values.
    let shouldSave = false;
    if (chat_id && contact.chat_id !== chat_id) {
      contact.chat_id = chat_id;
      shouldSave = true;
    }
    if (name && contact.name !== name) {
      contact.name = name;
      shouldSave = true;
    }

    return shouldSave ? this.repo.save(contact) : contact;
  }

  async findAll() {
    const contact = await this.repo.find({
      order: { createdAt: 'DESC' },
      relations: {
        messages: true,
      },
    });

    return contact;
  }

  async findAllByPosteId(posteId: string) {
    return this.repo
      .createQueryBuilder('contact')
      .innerJoin(
        WhatsappChat,
        'chat',
        'chat.chat_id = contact.chat_id AND chat.poste_id = :posteId',
        { posteId },
      )
      .orderBy('contact.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string) {
    const contact = await this.repo.findOne({
      where: { id },
      relations: {
        messages: true,
      },
    });
    if (!contact) throw new NotFoundException('Contact introuvable');
    return contact;
  }

  async update(id: string, dto: UpdateContactDto) {
    const contact = await this.findOne(id);
    Object.assign(contact, dto);
    return this.repo.save(contact);
  }

  async updateCallStatus(id: string, dto: UpdateContactCallDto) {
    const contact = await this.findOne(id);
    contact.call_status = dto.call_status;
    contact.call_notes = dto.call_notes ?? contact.call_notes;
    contact.last_call_date = new Date();
    contact.call_count = (contact.call_count ?? 0) + 1;
    return this.repo.save(contact);
  }

  async remove(id: string) {
    const contact = await this.findOne(id);
    return this.repo.remove(contact);
  }
}
