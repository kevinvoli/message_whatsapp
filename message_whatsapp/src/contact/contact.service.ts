import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactCallDto } from './dto/update-contact-call.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CallLogService } from 'src/call-log/call_log.service';
import { CallLog } from 'src/call-log/entities/call_log.entity';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    private readonly callLogService: CallLogService,
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

  async findAll(limit = 50, offset = 0): Promise<{ data: unknown[]; total: number }> {
    const [contacts, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data: contacts, total };
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

  async updateCallStatus(
    id: string,
    dto: UpdateContactCallDto,
    commercial_id: string,
  ): Promise<{ contact: Contact; callLog: CallLog }> {
    const contact = await this.findOne(id);
    contact.call_status = dto.call_status;
    contact.call_notes = dto.call_notes ?? contact.call_notes;
    contact.last_call_date = new Date();
    contact.call_count = (contact.call_count ?? 0) + 1;
    const savedContact = await this.repo.save(contact);

    // Lookup du nom du commercial pour dénormalisation
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercial_id },
      select: ['name'],
    });
    const commercial_name = commercial?.name ?? 'Inconnu';

    const callLog = await this.callLogService.create({
      contact_id: id,
      commercial_id,
      commercial_name,
      call_status: dto.call_status,
      notes: dto.call_notes,
      outcome: dto.outcome as any,
      duration_sec: dto.duration_sec,
      called_at: new Date(),
    });

    return { contact: savedContact, callLog };
  }

  async remove(id: string) {
    const contact = await this.findOne(id);
    return this.repo.remove(contact);
  }
}
