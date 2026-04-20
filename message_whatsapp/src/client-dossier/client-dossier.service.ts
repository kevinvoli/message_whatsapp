import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from 'src/contact/entities/contact.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp, FollowUpStatus } from 'src/follow-up/entities/follow_up.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

export interface TimelineEvent {
  type: 'message' | 'call' | 'follow_up' | 'conversation_opened' | 'conversation_closed';
  date: Date;
  summary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: Record<string, any>;
}

@Injectable()
export class ClientDossierService {
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
  ) {}

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
