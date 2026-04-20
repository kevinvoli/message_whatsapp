import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';

export interface AnalyticsSummaryDto {
  totalConversations: number;
  openConversations: number;
  closedConversations: number;
  avgFirstResponseTimeSeconds: number;
  avgResolutionTimeSeconds: number;
  totalMessages: number;
  messagesIn: number;
  messagesOut: number;
}

export interface ConversationVolumeDto {
  date: string;
  total: number;
  opened: number;
  closed: number;
  avgResolutionSeconds: number;
}

export interface AgentPerformanceDto {
  agentId: string;
  agentName: string;
  posteName: string;
  messagesOut: number;
  chatsHandled: number;
  avgResponseSeconds: number;
}

export interface CommercialRankingDto {
  rank: number;
  commercialId: string;
  commercialName: string;
  posteName: string;
  conversations: number;
  orders: number;
  calls: number;
  followUpsCompleted: number;
  transformationRate: number;
  qualificationRate: number;
  avgFirstResponseSeconds: number;
}

export interface ChannelBreakdownDto {
  channelId: string;
  label: string | null;
  provider: string;
  totalMessages: number;
  messagesIn: number;
  messagesOut: number;
  totalConversations: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,

    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    @InjectRepository(CallLog)
    private readonly callLogRepo: Repository<CallLog>,

    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
  ) {}

  private dateRange(from?: string, to?: string): { dateStart: Date; dateEnd: Date } {
    const dateEnd = to ? new Date(to) : new Date();
    const dateStart = from
      ? new Date(from)
      : new Date(dateEnd.getTime() - 30 * 24 * 3600 * 1000); // 30 jours par défaut
    return { dateStart, dateEnd };
  }

  // ─── Summary KPIs ─────────────────────────────────────────────────────────

  async getSummary(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<AnalyticsSummaryDto> {
    const { dateStart, dateEnd } = this.dateRange(from, to);

    const [chatStats, msgStats, firstResponseRaw, resolutionRaw] = await Promise.all([
      // Conversations (open vs closed)
      this.chatRepo
        .createQueryBuilder('c')
        .select('COUNT(*)', 'total')
        .addSelect("SUM(CASE WHEN c.status = 'fermé' THEN 1 ELSE 0 END)", 'closed')
        .addSelect("SUM(CASE WHEN c.status != 'fermé' THEN 1 ELSE 0 END)", 'open')
        .where('c.deletedAt IS NULL')
        .andWhere('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.createdAt >= :dateStart', { dateStart })
        .andWhere('c.createdAt <= :dateEnd', { dateEnd })
        .getRawOne(),

      // Messages in/out
      this.messageRepo
        .createQueryBuilder('m')
        .select('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN m.direction = "IN"  THEN 1 ELSE 0 END)', 'msg_in')
        .addSelect('SUM(CASE WHEN m.direction = "OUT" THEN 1 ELSE 0 END)', 'msg_out')
        .where('m.deletedAt IS NULL')
        .andWhere('m.tenant_id = :tenantId', { tenantId })
        .andWhere('m.createdAt >= :dateStart', { dateStart })
        .andWhere('m.createdAt <= :dateEnd', { dateEnd })
        .getRawOne(),

      // Temps première réponse (premier OUT après premier IN par chat)
      this.messageRepo
        .createQueryBuilder('msg_out')
        .innerJoin(
          'whatsapp_message',
          'msg_in',
          `msg_out.chat_id = msg_in.chat_id
           AND msg_in.direction  = "IN"
           AND msg_out.direction = "OUT"
           AND msg_in.timestamp  < msg_out.timestamp
           AND msg_in.timestamp  >= msg_out.timestamp - INTERVAL 2 HOUR`,
        )
        .select(
          'AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))',
          'avg_seconds',
        )
        .where('msg_out.deletedAt IS NULL AND msg_in.deletedAt IS NULL')
        .andWhere('msg_out.tenant_id = :tenantId', { tenantId })
        .andWhere('msg_out.createdAt >= :dateStart', { dateStart })
        .andWhere('msg_out.createdAt <= :dateEnd', { dateEnd })
        .getRawOne(),

      // Temps de résolution : createdAt → updatedAt des chats fermés
      // On utilise updatedAt comme proxy pour la date de clôture
      this.chatRepo
        .createQueryBuilder('c')
        .select(
          "AVG(TIMESTAMPDIFF(SECOND, c.createdAt, c.updatedAt))",
          'avg_seconds',
        )
        .where('c.deletedAt IS NULL')
        .andWhere("c.status = 'fermé'")
        .andWhere('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.createdAt >= :dateStart', { dateStart })
        .andWhere('c.createdAt <= :dateEnd', { dateEnd })
        .getRawOne(),
    ]);

    return {
      totalConversations:         parseInt(chatStats?.total)   || 0,
      openConversations:          parseInt(chatStats?.open)    || 0,
      closedConversations:        parseInt(chatStats?.closed)  || 0,
      totalMessages:              parseInt(msgStats?.total)    || 0,
      messagesIn:                 parseInt(msgStats?.msg_in)   || 0,
      messagesOut:                parseInt(msgStats?.msg_out)  || 0,
      avgFirstResponseTimeSeconds: parseInt(firstResponseRaw?.avg_seconds) || 0,
      avgResolutionTimeSeconds:    parseInt(resolutionRaw?.avg_seconds)    || 0,
    };
  }

  // ─── Volume de conversations (par jour) ───────────────────────────────────

  async getConversationVolume(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<ConversationVolumeDto[]> {
    const { dateStart, dateEnd } = this.dateRange(from, to);

    const rows = await this.chatRepo
      .createQueryBuilder('c')
      .select('DATE(c.createdAt)', 'date')
      .addSelect('COUNT(*)', 'total')
      .addSelect("SUM(CASE WHEN c.status = 'fermé' THEN 1 ELSE 0 END)", 'closed')
      .addSelect("SUM(CASE WHEN c.status != 'fermé' THEN 1 ELSE 0 END)", 'opened')
      .addSelect(
        "AVG(CASE WHEN c.status = 'fermé' THEN TIMESTAMPDIFF(SECOND, c.createdAt, c.updatedAt) END)",
        'avg_res',
      )
      .where('c.deletedAt IS NULL')
      .andWhere('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.createdAt >= :dateStart', { dateStart })
      .andWhere('c.createdAt <= :dateEnd', { dateEnd })
      .groupBy('DATE(c.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      date:                 r.date,
      total:                parseInt(r.total)  || 0,
      opened:               parseInt(r.opened) || 0,
      closed:               parseInt(r.closed) || 0,
      avgResolutionSeconds: parseInt(r.avg_res) || 0,
    }));
  }

  // ─── Performance agents ───────────────────────────────────────────────────

  async getAgentPerformance(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<AgentPerformanceDto[]> {
    const { dateStart, dateEnd } = this.dateRange(from, to);

    // Messages OUT par commercial dans la période
    const msgRows = await this.messageRepo
      .createQueryBuilder('m')
      .select('m.commercial_id', 'cid')
      .addSelect('COUNT(*)', 'sent')
      .addSelect('COUNT(DISTINCT m.chat_id)', 'chats')
      .where('m.deletedAt IS NULL')
      .andWhere('m.direction = "OUT"')
      .andWhere('m.commercial_id IS NOT NULL')
      .andWhere('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.createdAt >= :dateStart', { dateStart })
      .andWhere('m.createdAt <= :dateEnd', { dateEnd })
      .groupBy('m.commercial_id')
      .getRawMany();

    if (msgRows.length === 0) return [];

    const commercialIds = msgRows.map((r) => r.cid);

    // Info commerciaux
    const agents = await this.commercialRepo
      .createQueryBuilder('co')
      .leftJoin('co.poste', 'p')
      .select('co.id', 'id')
      .addSelect('co.name', 'name')
      .addSelect('p.name', 'poste_name')
      .where('co.id IN (:...commercialIds)', { commercialIds })
      .getRawMany();

    const agentMap = new Map(agents.map((a) => [a.id, a]));

    // Temps de réponse moyen par commercial
    const respRows = await this.messageRepo
      .createQueryBuilder('msg_out')
      .innerJoin(
        'whatsapp_message',
        'msg_in',
        `msg_out.chat_id = msg_in.chat_id
         AND msg_in.direction  = "IN"
         AND msg_out.direction = "OUT"
         AND msg_in.timestamp  < msg_out.timestamp
         AND msg_in.timestamp  >= msg_out.timestamp - INTERVAL 2 HOUR`,
      )
      .select('msg_out.commercial_id', 'cid')
      .addSelect('AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))', 'avg')
      .where('msg_out.deletedAt IS NULL AND msg_in.deletedAt IS NULL')
      .andWhere('msg_out.commercial_id IN (:...commercialIds)', { commercialIds })
      .andWhere('msg_out.createdAt >= :dateStart', { dateStart })
      .andWhere('msg_out.createdAt <= :dateEnd', { dateEnd })
      .groupBy('msg_out.commercial_id')
      .getRawMany();

    const respMap = new Map(respRows.map((r) => [r.cid, parseInt(r.avg) || 0]));

    return msgRows.map((r) => {
      const agent = agentMap.get(r.cid);
      return {
        agentId:            r.cid,
        agentName:          agent?.name     ?? 'Inconnu',
        posteName:          agent?.poste_name ?? 'Non assigné',
        messagesOut:        parseInt(r.sent)  || 0,
        chatsHandled:       parseInt(r.chats) || 0,
        avgResponseSeconds: respMap.get(r.cid) ?? 0,
      };
    }).sort((a, b) => b.messagesOut - a.messagesOut);
  }

  // ─── Répartition par canal ─────────────────────────────────────────────────

  async getChannelBreakdown(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<ChannelBreakdownDto[]> {
    const { dateStart, dateEnd } = this.dateRange(from, to);

    const rows = await this.messageRepo
      .createQueryBuilder('m')
      .select('m.channel_id', 'channel_id')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN m.direction = "IN"  THEN 1 ELSE 0 END)', 'msg_in')
      .addSelect('SUM(CASE WHEN m.direction = "OUT" THEN 1 ELSE 0 END)', 'msg_out')
      .addSelect('COUNT(DISTINCT m.chat_id)', 'nb_chats')
      .where('m.deletedAt IS NULL')
      .andWhere('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.createdAt >= :dateStart', { dateStart })
      .andWhere('m.createdAt <= :dateEnd', { dateEnd })
      .groupBy('m.channel_id')
      .orderBy('total', 'DESC')
      .getRawMany();

    if (rows.length === 0) return [];

    const channelIds = rows.map((r) => r.channel_id).filter(Boolean);
    const channels = channelIds.length
      ? await this.channelRepo
          .createQueryBuilder('ch')
          .select(['ch.channel_id', 'ch.label', 'ch.provider'])
          .where('ch.channel_id IN (:...channelIds)', { channelIds })
          .getMany()
      : [];

    const chMap = new Map(channels.map((c) => [c.channel_id, c]));

    return rows.map((r) => {
      const ch = chMap.get(r.channel_id);
      return {
        channelId:          r.channel_id ?? 'unknown',
        label:              ch?.label    ?? null,
        provider:           ch?.provider ?? 'unknown',
        totalMessages:      parseInt(r.total)    || 0,
        messagesIn:         parseInt(r.msg_in)   || 0,
        messagesOut:        parseInt(r.msg_out)  || 0,
        totalConversations: parseInt(r.nb_chats) || 0,
      };
    });
  }

  // ─── Ranking commercial (4.7) ─────────────────────────────────────────────

  async getCommercialRanking(
    from?: string,
    to?: string,
  ): Promise<CommercialRankingDto[]> {
    const { dateStart, dateEnd } = this.dateRange(from, to);

    // 1. Conversations + commandes + qualification par commercial
    const chatRows = await this.chatRepo
      .createQueryBuilder('c')
      .select('c.poste_id', 'poste_id')
      .addSelect('COUNT(*)', 'conversations')
      .addSelect(
        `SUM(CASE WHEN c.conversation_result IN ('commande_confirmee','commande_a_saisir') THEN 1 ELSE 0 END)`,
        'orders',
      )
      .addSelect(
        `SUM(CASE WHEN c.conversation_result IS NOT NULL THEN 1 ELSE 0 END)`,
        'qualified',
      )
      .innerJoin(
        'whatsapp_message',
        'msg',
        'msg.chat_id = c.chat_id AND msg.direction = "OUT" AND msg.commercial_id IS NOT NULL AND msg.deletedAt IS NULL',
      )
      .addSelect('msg.commercial_id', 'commercial_id')
      .where('c.deletedAt IS NULL')
      .andWhere('c.createdAt >= :dateStart', { dateStart })
      .andWhere('c.createdAt <= :dateEnd', { dateEnd })
      .groupBy('msg.commercial_id')
      .getRawMany();

    if (chatRows.length === 0) return [];

    const commercialIds = chatRows.map((r) => r.commercial_id).filter(Boolean);

    // 2. Appels par commercial
    const callRows = await this.callLogRepo
      .createQueryBuilder('cl')
      .select('cl.commercial_id', 'commercial_id')
      .addSelect('COUNT(*)', 'calls')
      .where('cl.commercial_id IN (:...commercialIds)', { commercialIds })
      .andWhere('cl.called_at >= :dateStart', { dateStart })
      .andWhere('cl.called_at <= :dateEnd', { dateEnd })
      .groupBy('cl.commercial_id')
      .getRawMany();
    const callMap = new Map(callRows.map((r) => [r.commercial_id, parseInt(r.calls) || 0]));

    // 3. Relances effectuées par commercial
    const fuRows = await this.followUpRepo
      .createQueryBuilder('fu')
      .select('fu.commercial_id', 'commercial_id')
      .addSelect('COUNT(*)', 'completed')
      .where('fu.commercial_id IN (:...commercialIds)', { commercialIds })
      .andWhere("fu.status = 'effectuee'")
      .andWhere('fu.completed_at >= :dateStart', { dateStart })
      .andWhere('fu.completed_at <= :dateEnd', { dateEnd })
      .groupBy('fu.commercial_id')
      .getRawMany();
    const fuMap = new Map(fuRows.map((r) => [r.commercial_id, parseInt(r.completed) || 0]));

    // 4. Temps première réponse par commercial
    const respRows = await this.messageRepo
      .createQueryBuilder('msg_out')
      .innerJoin(
        'whatsapp_message',
        'msg_in',
        `msg_out.chat_id = msg_in.chat_id
         AND msg_in.direction = "IN"
         AND msg_out.direction = "OUT"
         AND msg_in.timestamp < msg_out.timestamp
         AND msg_in.timestamp >= msg_out.timestamp - INTERVAL 2 HOUR`,
      )
      .select('msg_out.commercial_id', 'commercial_id')
      .addSelect('AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))', 'avg_resp')
      .where('msg_out.deletedAt IS NULL AND msg_in.deletedAt IS NULL')
      .andWhere('msg_out.commercial_id IN (:...commercialIds)', { commercialIds })
      .andWhere('msg_out.createdAt >= :dateStart', { dateStart })
      .andWhere('msg_out.createdAt <= :dateEnd', { dateEnd })
      .groupBy('msg_out.commercial_id')
      .getRawMany();
    const respMap = new Map(respRows.map((r) => [r.commercial_id, parseInt(r.avg_resp) || 0]));

    // 5. Info commerciaux (nom, poste)
    const commercials = await this.commercialRepo
      .createQueryBuilder('co')
      .leftJoin('co.poste', 'p')
      .select(['co.id', 'co.name'])
      .addSelect('p.name', 'poste_name')
      .where('co.id IN (:...commercialIds)', { commercialIds })
      .getMany();
    const coMap = new Map(commercials.map((c) => [c.id, c]));

    const rows = chatRows.map((r) => {
      const conversations = parseInt(r.conversations) || 0;
      const orders = parseInt(r.orders) || 0;
      const qualified = parseInt(r.qualified) || 0;
      const co = coMap.get(r.commercial_id);
      return {
        rank: 0,
        commercialId:           r.commercial_id,
        commercialName:         co?.name ?? 'Inconnu',
        posteName:              (co as any)?.poste_name ?? 'Non assigné',
        conversations,
        orders,
        calls:                  callMap.get(r.commercial_id) ?? 0,
        followUpsCompleted:     fuMap.get(r.commercial_id) ?? 0,
        transformationRate:     conversations > 0 ? Math.round((orders / conversations) * 100) : 0,
        qualificationRate:      conversations > 0 ? Math.round((qualified / conversations) * 100) : 0,
        avgFirstResponseSeconds: respMap.get(r.commercial_id) ?? 0,
      };
    });

    // Tri : commandes desc, puis conversations desc
    rows.sort((a, b) => b.orders - a.orders || b.conversations - a.conversations);
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }
}
