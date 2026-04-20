import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactCallDto } from './dto/update-contact-call.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    // Pas de chargement des relations — findOrCreate ne les utilise pas
    // (charger messages ici déclencherait un SELECT * pour chaque message entrant)
    let contact = await this.repo.findOne({
      where: { phone },
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

  /** Charge les contacts correspondant à une liste de chat_ids (batch, sans relations). */
  async findByChatIds(chatIds: string[]): Promise<Map<string, Contact>> {
    if (!chatIds.length) return new Map();
    const contacts = await this.repo.find({
      where: { chat_id: In(chatIds) },
    });
    return new Map(contacts.map((c) => [c.chat_id!, c]));
  }

  /** Charge un contact par chat_id avec ses messages (pour la vue détail). */
  async findOneByChatId(chatId: string): Promise<Contact | null> {
    return this.repo.findOne({
      where: { chat_id: chatId },
      relations: { messages: true },
    });
  }

  async findAll(limit = 50, offset = 0, search?: string): Promise<{ data: unknown[]; total: number }> {
    const qb = this.repo.createQueryBuilder('contact');

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.where(
        'contact.name LIKE :term OR contact.phone LIKE :term OR contact.chat_id LIKE :term',
        { term },
      );
    }

    const [contacts, total] = await qb
      .orderBy('contact.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

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

  // ─── P7 — Portefeuille commercial ──────────────────────────────────────────

  /** Assigne un contact à un commercial (portfolio_owner_id) */
  async assignPortfolio(contactId: string, commercial_id: string): Promise<Contact> {
    await this.repo.update({ id: contactId }, { portfolio_owner_id: commercial_id });
    return this.findOne(contactId);
  }

  /** Retire l'attribution d'un contact */
  async unassignPortfolio(contactId: string): Promise<Contact> {
    await this.repo.update({ id: contactId }, { portfolio_owner_id: null });
    return this.findOne(contactId);
  }

  /** Liste tous les contacts du portefeuille d'un commercial */
  async findPortfolioByCommercial(
    commercial_id: string,
    search?: string,
    limit = 50,
    offset = 0,
  ): Promise<{ data: Contact[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.portfolio_owner_id = :commercial_id', { commercial_id })
      .andWhere('c.deletedAt IS NULL');

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere('(c.name LIKE :term OR c.phone LIKE :term)', { term });
    }

    const [data, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { data, total };
  }

  /** Vue admin : portefeuille de n'importe quel commercial */
  async findPortfolioAdmin(
    commercial_id?: string,
    search?: string,
    limit = 50,
    offset = 0,
  ): Promise<{ data: Contact[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.deletedAt IS NULL');

    if (commercial_id) {
      qb.andWhere('c.portfolio_owner_id = :commercial_id', { commercial_id });
    } else {
      qb.andWhere('c.portfolio_owner_id IS NOT NULL');
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere('(c.name LIKE :term OR c.phone LIKE :term)', { term });
    }

    const [data, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { data, total };
  }
}
