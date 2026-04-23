import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from 'src/contact/entities/contact.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp, FollowUpStatus } from 'src/follow-up/entities/follow_up.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { ClientDossier } from './entities/client-dossier.entity';
import { ContactPhone } from './entities/contact-phone.entity';
import { UpsertDossierDto } from './dto/upsert-dossier.dto';
import { GicopPlatformService } from 'src/gicop-platform/gicop-platform.service';

export interface TimelineEvent {
  type: 'message' | 'call' | 'follow_up' | 'conversation_opened' | 'conversation_closed';
  date: Date;
  summary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: Record<string, any>;
}

@Injectable()
export class ClientDossierService {
  private readonly logger = new Logger(ClientDossierService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(CallLog)
    private readonly callLogRepo: Repository<CallLog>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(ClientDossier)
    private readonly dossierRepo: Repository<ClientDossier>,
    @InjectRepository(ContactPhone)
    private readonly phoneRepo: Repository<ContactPhone>,
    private readonly gicopPlatform: GicopPlatformService,
  ) {}

  // ── Méthodes dossier structuré ────────────────────────────────────────────

  /** Récupère le dossier structuré par contact UUID */
  findByContactId(contactId: string): Promise<ClientDossier | null> {
    return this.dossierRepo.findOne({ where: { contactId } });
  }

  /** Récupère dossier + contact + téléphones + 20 derniers appels par chatId */
  async findByChatId(chatId: string): Promise<{
    dossier: ClientDossier | null;
    contact: Contact | null;
    phones: ContactPhone[];
    callLogs: CallLog[];
  }> {
    const contact = await this.contactRepo.findOne({ where: { chat_id: chatId } });

    if (!contact) {
      return { dossier: null, contact: null, phones: [], callLogs: [] };
    }

    const [dossier, phones, callLogs] = await Promise.all([
      this.dossierRepo.findOne({ where: { contactId: contact.id } }),
      this.listPhones(contact.id),
      this.callLogRepo.find({
        where: { contact_id: contact.id },
        order: { called_at: 'DESC' },
        take: 20,
      }),
    ]);

    return { dossier, contact, phones, callLogs };
  }

  /** Upsert du dossier structuré par chatId */
  async upsertByChatId(chatId: string, dto: UpsertDossierDto): Promise<ClientDossier> {
    const contact = await this.contactRepo.findOne({ where: { chat_id: chatId } });

    if (!contact) {
      throw new NotFoundException(`Contact introuvable pour chatId ${chatId}`);
    }

    let dossier = await this.dossierRepo.findOne({ where: { contactId: contact.id } });

    if (!dossier) {
      dossier = this.dossierRepo.create({ contactId: contact.id });
    }

    if (dto.fullName !== undefined) dossier.fullName = dto.fullName ?? null;
    if (dto.ville !== undefined) dossier.ville = dto.ville ?? null;
    if (dto.commune !== undefined) dossier.commune = dto.commune ?? null;
    if (dto.quartier !== undefined) dossier.quartier = dto.quartier ?? null;
    if (dto.otherPhones !== undefined) dossier.otherPhones = dto.otherPhones ?? null;
    if (dto.productCategory !== undefined) dossier.productCategory = dto.productCategory ?? null;
    if (dto.clientNeed !== undefined) dossier.clientNeed = dto.clientNeed ?? null;
    if (dto.interestScore !== undefined) dossier.interestScore = dto.interestScore ?? null;
    if (dto.isMaleNotInterested !== undefined) dossier.isMaleNotInterested = dto.isMaleNotInterested ?? false;
    if (dto.followUpAt !== undefined) {
      dossier.followUpAt = dto.followUpAt ? new Date(dto.followUpAt) : null;
    }
    if (dto.nextAction !== undefined) dossier.nextAction = dto.nextAction ?? null;
    if (dto.notes !== undefined) dossier.notes = dto.notes ?? null;

    return this.dossierRepo.save(dossier);
  }

  /**
   * Assigne le contact lié à cette conversation au portefeuille du commercial,
   * puis envoie les données à la plateforme GICOP (gicop.ci).
   * N'écrase pas un propriétaire déjà attribué (premier commercial qui finalise = propriétaire).
   */
  async assignToPortfolio(chatId: string, commercialId: string, posteId: string): Promise<void> {
    const contact = await this.contactRepo.findOne({
      where: { chat_id: chatId },
      select: ['id', 'phone', 'portfolio_owner_id'],
    });
    if (!contact) return;

    // Assigner le portefeuille si pas encore fait
    if (!contact.portfolio_owner_id) {
      await this.contactRepo.update(contact.id, { portfolio_owner_id: commercialId });
      this.logger.log(`Portfolio: contact ${contact.id} assigné au commercial ${commercialId}`);
    }

    // Récupérer le type depuis le dossier (nextAction du commercial)
    const dossier = await this.dossierRepo.findOne({
      where: { contactId: contact.id },
      select: ['nextAction'],
    });
    const type = dossier?.nextAction ?? 'relancer';

    // Envoyer à la plateforme gicop.ci
    void this.gicopPlatform.sendNumberToCall({
      number:   contact.phone,
      poste_id: posteId,
      type,
    });
  }

  /** Retourne true si le dossier lié à cette conversation est complet (nom + besoin + score) */
  async isDossierComplete(chatId: string): Promise<boolean> {
    const contact = await this.contactRepo.findOne({ where: { chat_id: chatId }, select: ['id'] });
    if (!contact) return false;
    const dossier = await this.dossierRepo.findOne({
      where: { contactId: contact.id },
      select: ['fullName', 'clientNeed', 'interestScore'],
    });
    if (!dossier) return false;
    return !!(dossier.fullName?.trim() && dossier.clientNeed?.trim() && dossier.interestScore !== null);
  }

  // ── Gestion des numéros de téléphone ────────────────────────────────────

  async listPhones(contactId: string): Promise<ContactPhone[]> {
    return this.phoneRepo.find({ where: { contactId }, order: { isPrimary: 'DESC', createdAt: 'ASC' } });
  }

  async addPhone(chatId: string, phone: string, label: string | null): Promise<ContactPhone> {
    const contact = await this.contactRepo.findOne({ where: { chat_id: chatId } });
    if (!contact) throw new NotFoundException(`Contact introuvable pour chatId ${chatId}`);
    const entry = this.phoneRepo.create({ contactId: contact.id, phone: phone.replace(/\s/g, ''), label: label ?? null });
    return this.phoneRepo.save(entry);
  }

  async removePhone(phoneId: string): Promise<void> {
    await this.phoneRepo.delete(phoneId);
  }

  async listPhonesByChatId(chatId: string): Promise<ContactPhone[]> {
    const contact = await this.contactRepo.findOne({ where: { chat_id: chatId } });
    if (!contact) return [];
    return this.listPhones(contact.id);
  }

  // ── Dossier complet ───────────────────────────────────────────────────────

  /** Dossier complet d'un client par son UUID de contact */
  async getDossier(contactId: string) {
    const contact = await this.contactRepo.findOne({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Client ${contactId} introuvable`);

    const [callLogs, followUps, conversations] = await Promise.all([
      this.callLogRepo.find({
        where: { contact_id: contactId },
        order: { called_at: 'DESC' },
        take: 50,
      }),
      this.followUpRepo.find({
        where: { contact_id: contactId },
        order: { scheduled_at: 'ASC' },
      }),
      contact.chat_id
        ? this.chatRepo.find({
            where: { chat_id: contact.chat_id },
            order: { createdAt: 'DESC' },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    const pendingFollowUps = followUps.filter(
      (f) => f.status === FollowUpStatus.PLANIFIEE || f.status === FollowUpStatus.EN_RETARD,
    );
    const nextFollowUp = pendingFollowUps.sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    )[0] ?? null;

    return {
      contact,
      stats: {
        total_calls: callLogs.length,
        total_conversations: conversations.length,
        total_follow_ups: followUps.length,
        pending_follow_ups: pendingFollowUps.length,
      },
      next_follow_up: nextFollowUp,
      call_logs: callLogs,
      follow_ups: followUps,
      conversations: conversations.map((c) => ({
        id: c.id,
        chat_id: c.chat_id,
        status: c.status,
        conversation_result: c.conversation_result,
        conversation_result_at: c.conversation_result_at,
        last_activity_at: c.last_activity_at,
        createdAt: c.createdAt,
      })),
    };
  }

  /** Timeline chronologique de toutes les interactions d'un client */
  async getTimeline(contactId: string, limit = 50): Promise<TimelineEvent[]> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Client ${contactId} introuvable`);

    const events: TimelineEvent[] = [];

    // Appels
    const callLogs = await this.callLogRepo.find({
      where: { contact_id: contactId },
      order: { called_at: 'DESC' },
      take: limit,
    });
    for (const c of callLogs) {
      events.push({
        type: 'call',
        date: c.called_at,
        summary: `Appel — ${c.call_status}${c.outcome ? ` (${c.outcome})` : ''}`,
        detail: { commercial_name: c.commercial_name, duration_sec: c.duration_sec, notes: c.notes },
      });
    }

    // Relances
    const followUps = await this.followUpRepo.find({ where: { contact_id: contactId } });
    for (const f of followUps) {
      events.push({
        type: 'follow_up',
        date: f.completed_at ?? f.scheduled_at,
        summary: `Relance ${f.type} — ${f.status}${f.result ? ` : ${f.result}` : ''}`,
        detail: { notes: f.notes },
      });
    }

    // Conversations (ouvertures et clôtures)
    if (contact.chat_id) {
      const conversations = await this.chatRepo.find({
        where: { chat_id: contact.chat_id },
        order: { createdAt: 'DESC' },
        take: limit,
      });
      for (const c of conversations) {
        events.push({
          type: 'conversation_opened',
          date: c.createdAt,
          summary: `Conversation ouverte (${c.status})`,
          detail: { chat_id: c.chat_id },
        });
        if (c.conversation_result && c.conversation_result_at) {
          events.push({
            type: 'conversation_closed',
            date: c.conversation_result_at,
            summary: `Résultat : ${c.conversation_result}`,
            detail: { result: c.conversation_result },
          });
        }
      }
    }

    // Trier par date décroissante, limiter
    return events
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  /** Recherche globale de clients (non dérivée des conversations chargées) */
  async searchClients(
    search?: string,
    portfolio_owner_id?: string,
    client_category?: string,
    limit = 50,
    offset = 0,
  ): Promise<{ data: Contact[]; total: number }> {
    const qb = this.contactRepo
      .createQueryBuilder('c')
      .where('c.deletedAt IS NULL');

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere('(c.name LIKE :term OR c.phone LIKE :term)', { term });
    }
    if (portfolio_owner_id) {
      qb.andWhere('c.portfolio_owner_id = :portfolio_owner_id', { portfolio_owner_id });
    }
    if (client_category) {
      qb.andWhere('c.client_category = :client_category', { client_category });
    }

    const [data, total] = await qb
      .orderBy('c.updatedAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { data, total };
  }
}
