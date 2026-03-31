import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  ChargePosteDto,
  MetriquesGlobalesDto,
  PerformanceCommercialDto,
  PerformanceTemporelleDto,
  StatutChannelDto,
} from './dto/create-metrique.dto';
import { QueueMetricsDto } from './dto/create-metrique.dto';

@Injectable()
export class MetriquesService {
  private readonly logger = new Logger(MetriquesService.name);
  private readonly queueWarningThreshold = 20;

  /** Cache en mémoire — TTL 60 s pour éviter de recalculer à chaque refresh */
  private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    @InjectRepository(WhatsappMessage)
    private messageRepository: Repository<WhatsappMessage>,

    @InjectRepository(WhatsappChat)
    private chatRepository: Repository<WhatsappChat>,

    @InjectRepository(WhatsappCommercial)
    private commercialRepository: Repository<WhatsappCommercial>,

    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,

    @InjectRepository(WhatsappPoste)
    private posteRepository: Repository<WhatsappPoste>,

    @InjectRepository(WhapiChannel)
    private channelRepository: Repository<WhapiChannel>,

    @InjectRepository(QueuePosition)
    private queueRepository: Repository<QueuePosition>,
  ) {}

  // ---------------------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------------------

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached(key: string, data: unknown): void {
    this.cache.set(key, { data, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }

  // ---------------------------------------------------------------------------
  // Date helpers
  // ---------------------------------------------------------------------------

  private periodeToDateStart(periode: string): Date {
    const now = new Date();
    switch (periode) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'month': {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'year': {
        const d = new Date(now);
        d.setDate(d.getDate() - 365);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      default: {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }

  private dateRange(
    periode: string,
    dateFrom?: string,
    dateTo?: string,
  ): { dateStart: Date; dateEnd: Date } {
    if (dateFrom && dateTo) {
      return { dateStart: new Date(dateFrom), dateEnd: new Date(dateTo) };
    }
    return { dateStart: this.periodeToDateStart(periode), dateEnd: new Date() };
  }

  // ---------------------------------------------------------------------------
  // Public — Métriques globales
  // ---------------------------------------------------------------------------

  async getMetriquesGlobales(
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<MetriquesGlobalesDto> {
    const cacheKey = `globales_${periode}_${dateFrom ?? ''}_${dateTo ?? ''}`;
    const cached = this.getCached<MetriquesGlobalesDto>(cacheKey);
    if (cached) return cached;

    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    const [
      metriquesMessages,
      metriquesChats,
      metriquesCommerciaux,
      metriquesContacts,
      metriquesPostes,
      metriquesChannels,
      chargePostes,
    ] = await Promise.all([
      this.getMetriquesMessages(dateStart, dateEnd),
      this.getMetriquesChats(dateStart, dateEnd),
      this.getMetriquesCommerciaux(dateStart, dateEnd),
      this.getMetriquesContacts(dateStart, dateEnd),
      this.getMetriquesPostes(),
      this.getMetriquesChannels(),
      this.getChargeParPoste(dateStart, dateEnd),
    ]);

    const result = {
      ...metriquesMessages,
      ...metriquesChats,
      ...metriquesCommerciaux,
      ...metriquesContacts,
      ...metriquesPostes,
      ...metriquesChannels,
      chargePostes,
    };

    this.setCached(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private — Messages
  // AVANT : 3 requêtes (COUNT total + GROUP BY direction + self-join)
  // APRÈS  : 2 requêtes (agrégation conditionnelle + self-join optimisé)
  // ---------------------------------------------------------------------------

  private async getMetriquesMessages(dateStart: Date, dateEnd: Date) {
    // Requête 1 : total + entrants + sortants en une seule passe
    const stats = await this.messageRepository
      .createQueryBuilder('message')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN message.direction = "IN"  THEN 1 ELSE 0 END)', 'entrants')
      .addSelect('SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)', 'sortants')
      .where('message.deletedAt IS NULL')
      .andWhere('message.createdAt >= :dateStart', { dateStart })
      .andWhere('message.createdAt <= :dateEnd', { dateEnd })
      .getRawOne();

    const totalMessages    = parseInt(stats?.total)    || 0;
    const messagesEntrants = parseInt(stats?.entrants) || 0;
    const messagesSortants = parseInt(stats?.sortants) || 0;
    const tauxReponse = messagesEntrants > 0
      ? Math.round((messagesSortants / messagesEntrants) * 100)
      : 0;

    // Requête 2 : temps de réponse moyen
    // Optimisation clé : le filtre de 1 h est déplacé dans la condition ON
    // → MySQL peut l'utiliser pour réduire le produit cartésien dès le join,
    //   au lieu de générer toutes les paires puis filtrer.
    const tempsReponse = await this.messageRepository
      .createQueryBuilder('msg_out')
      .innerJoin(
        'whatsapp_message',
        'msg_in',
        `msg_out.chat_id = msg_in.chat_id
         AND msg_in.direction  = :dirIn
         AND msg_out.direction = :dirOut
         AND msg_in.timestamp  <  msg_out.timestamp
         AND msg_in.timestamp  >= msg_out.timestamp - INTERVAL 1 HOUR`,
        { dirIn: 'IN', dirOut: 'OUT' },
      )
      .select('AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))', 'avg_seconds')
      .where('msg_out.deletedAt IS NULL')
      .andWhere('msg_in.deletedAt IS NULL')
      .andWhere('msg_out.createdAt >= :dateStart', { dateStart })
      .andWhere('msg_out.createdAt <= :dateEnd', { dateEnd })
      .getRawOne();

    return {
      totalMessages,
      messagesEntrants,
      messagesSortants,
      messagesAujourdhui: totalMessages,
      tauxReponse,
      tempsReponseMoyen: parseInt(tempsReponse?.avg_seconds) || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Chats
  // AVANT : 6 requêtes COUNT séparées sur la même table
  // APRÈS  : 2 requêtes (1 agrégation conditionnelle + 1 AVG)
  // ---------------------------------------------------------------------------

  private async getMetriquesChats(dateStart: Date, dateEnd: Date) {
    // Requête 1 : tous les compteurs en une seule passe
    const stats = await this.chatRepository
      .createQueryBuilder('chat')
      .select('COUNT(*)',                                                                   'total')
      .addSelect("SUM(CASE WHEN chat.status = 'actif'      THEN 1 ELSE 0 END)",           'actifs')
      .addSelect("SUM(CASE WHEN chat.status = 'en attente' THEN 1 ELSE 0 END)",           'en_attente')
      .addSelect("SUM(CASE WHEN chat.status = 'fermé'      THEN 1 ELSE 0 END)",           'fermes')
      .addSelect('SUM(CASE WHEN chat.unread_count > 0       THEN 1 ELSE 0 END)',           'non_lus')
      .addSelect('SUM(CASE WHEN chat.is_archived = 1        THEN 1 ELSE 0 END)',           'archives')
      .addSelect('SUM(CASE WHEN chat.poste_id IS NOT NULL   THEN 1 ELSE 0 END)',           'assignes')
      .where('chat.deletedAt IS NULL')
      .andWhere('chat.createdAt >= :dateStart', { dateStart })
      .andWhere('chat.createdAt <= :dateEnd',   { dateEnd })
      .getRawOne();

    const totalChats   = parseInt(stats?.total)   || 0;
    const chatsAssignes = parseInt(stats?.assignes) || 0;

    // Requête 2 : temps première réponse (différent agrégat → requête séparée)
    const tempsPremiereReponse = await this.chatRepository
      .createQueryBuilder('chat')
      .select(
        'AVG(TIMESTAMPDIFF(SECOND, chat.last_client_message_at, chat.first_response_deadline_at))',
        'avg_seconds',
      )
      .where('chat.first_response_deadline_at IS NOT NULL')
      .andWhere('chat.last_client_message_at IS NOT NULL')
      .andWhere('chat.deletedAt IS NULL')
      .andWhere('chat.createdAt >= :dateStart', { dateStart })
      .andWhere('chat.createdAt <= :dateEnd',   { dateEnd })
      .getRawOne();

    return {
      totalChats,
      chatsActifs:     parseInt(stats?.actifs)     || 0,
      chatsEnAttente:  parseInt(stats?.en_attente) || 0,
      chatsFermes:     parseInt(stats?.fermes)     || 0,
      chatsNonLus:     parseInt(stats?.non_lus)    || 0,
      chatsArchives:   parseInt(stats?.archives)   || 0,
      tauxAssignation: totalChats > 0 ? Math.round((chatsAssignes / totalChats) * 100) : 0,
      tempsPremiereReponse: parseInt(tempsPremiereReponse?.avg_seconds) || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Commerciaux
  // AVANT : 2 requêtes COUNT séparées
  // APRÈS  : 1 agrégation conditionnelle + 1 DISTINCT COUNT
  // ---------------------------------------------------------------------------

  private async getMetriquesCommerciaux(dateStart?: Date, dateEnd?: Date) {
    // Requête 1 : total + connectés en une seule passe
    const stats = await this.commercialRepository
      .createQueryBuilder('commercial')
      .select('COUNT(*)',                                                                      'total')
      .addSelect('SUM(CASE WHEN commercial.isConnected = 1 THEN 1 ELSE 0 END)', 'connectes')
      .where('commercial.deletedAt IS NULL')
      .getRawOne();

    // Requête 2 : commerciaux actifs (jointure requise)
    const qb = this.commercialRepository
      .createQueryBuilder('commercial')
      .innerJoin('commercial.poste', 'poste')
      .innerJoin(
        'poste.chats',
        'chat',
        "chat.status = :status AND chat.deletedAt IS NULL",
        { status: 'actif' },
      )
      .where('commercial.deletedAt IS NULL');

    if (dateStart && dateEnd) {
      qb.andWhere('chat.createdAt >= :dateStart', { dateStart })
        .andWhere('chat.createdAt <= :dateEnd',   { dateEnd });
    }

    const commerciauxActifs = await qb
      .select('COUNT(DISTINCT commercial.id)', 'count')
      .getRawOne();

    return {
      commerciauxTotal:    parseInt(stats?.total)            || 0,
      commerciauxConnectes: parseInt(stats?.connectes)       || 0,
      commerciauxActifs:   parseInt(commerciauxActifs?.count) || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Contacts
  // AVANT : 3 requêtes COUNT séparées
  // APRÈS  : 1 agrégation conditionnelle
  // ---------------------------------------------------------------------------

  private async getMetriquesContacts(dateStart: Date, dateEnd: Date) {
    const stats = await this.contactRepository
      .createQueryBuilder('contact')
      .select('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN contact.createdAt >= :dateStart AND contact.createdAt <= :dateEnd THEN 1 ELSE 0 END)',
        'nouveaux',
      )
      .addSelect('SUM(CASE WHEN contact.is_active = 1 THEN 1 ELSE 0 END)', 'actifs')
      .where('contact.deletedAt IS NULL')
      .setParameters({ dateStart, dateEnd })
      .getRawOne();

    return {
      totalContacts:               parseInt(stats?.total)    || 0,
      nouveauxContactsAujourdhui:  parseInt(stats?.nouveaux) || 0,
      contactsActifs:              parseInt(stats?.actifs)   || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Postes
  // AVANT : 2 requêtes COUNT séparées
  // APRÈS  : 1 agrégation conditionnelle
  // ---------------------------------------------------------------------------

  private async getMetriquesPostes() {
    const stats = await this.posteRepository
      .createQueryBuilder('poste')
      .select('COUNT(*)',                                               'total')
      .addSelect('SUM(CASE WHEN poste.is_active = 1 THEN 1 ELSE 0 END)', 'actifs')
      .getRawOne();

    return {
      totalPostes:  parseInt(stats?.total)  || 0,
      postesActifs: parseInt(stats?.actifs) || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Charge par poste (inchangée, déjà optimale)
  // ---------------------------------------------------------------------------

  private async getChargeParPoste(dateStart: Date, dateEnd: Date): Promise<ChargePosteDto[]> {
    const chargePostes = await this.posteRepository
      .createQueryBuilder('poste')
      .leftJoin(
        'poste.chats',
        'chat',
        'chat.deletedAt IS NULL AND chat.createdAt >= :dateStart AND chat.createdAt <= :dateEnd',
        { dateStart, dateEnd },
      )
      .select('poste.id',   'poste_id')
      .addSelect('poste.name', 'poste_name')
      .addSelect('poste.code', 'poste_code')
      .addSelect('COUNT(chat.id)',                                                          'nb_chats')
      .addSelect('SUM(CASE WHEN chat.status = "actif"      THEN 1 ELSE 0 END)', 'nb_chats_actifs')
      .addSelect('SUM(CASE WHEN chat.status = "en attente" THEN 1 ELSE 0 END)', 'nb_chats_attente')
      .where('poste.is_active = 1')
      .groupBy('poste.id, poste.name, poste.code')
      .orderBy('nb_chats', 'DESC')
      .getRawMany();

    return chargePostes.map((cp) => ({
      poste_id:        cp.poste_id,
      poste_name:      cp.poste_name,
      poste_code:      cp.poste_code,
      nb_chats:        parseInt(cp.nb_chats)        || 0,
      nb_chats_actifs: parseInt(cp.nb_chats_actifs) || 0,
      nb_chats_attente: parseInt(cp.nb_chats_attente) || 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Private — Channels
  // AVANT : 2 requêtes COUNT séparées
  // APRÈS  : 1 agrégation conditionnelle
  // ---------------------------------------------------------------------------

  private async getMetriquesChannels() {
    const stats = await this.channelRepository
      .createQueryBuilder('channel')
      .select('COUNT(*)',                                                   'total')
      .addSelect('SUM(CASE WHEN channel.uptime > 0 THEN 1 ELSE 0 END)', 'actifs')
      .getRawOne();

    return {
      totalChannels:  parseInt(stats?.total)  || 0,
      channelsActifs: parseInt(stats?.actifs) || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Public — Performance par commercial
  // AVANT : N+1 queries (1 requête tempsReponseMoyen par commercial)
  // APRÈS  : 2 requêtes batch — 1 requête principale + 1 GROUP BY poste_id
  // ---------------------------------------------------------------------------

  async getPerformanceCommerciaux(
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<PerformanceCommercialDto[]> {
    const cacheKey = `perf_commerciaux_${periode}_${dateFrom ?? ''}_${dateTo ?? ''}`;
    const cached = this.getCached<PerformanceCommercialDto[]>(cacheKey);
    if (cached) return cached;

    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    // Requête 1 : données principales (inchangée)
    const performance = await this.commercialRepository
      .createQueryBuilder('commercial')
      .leftJoin('commercial.poste', 'poste')
      .leftJoin('poste.chats', 'chat', 'chat.deletedAt IS NULL')
      .leftJoin(
        'chat.messages',
        'message',
        'message.deletedAt IS NULL AND message.createdAt >= :dateStart AND message.createdAt <= :dateEnd',
        { dateStart, dateEnd },
      )
      .select([
        'commercial.id             as id',
        'commercial.name           as name',
        'commercial.email          as email',
        'commercial.isConnected    as isConnected',
        'commercial.lastConnectionAt as lastConnectionAt',
        'poste.name                as poste_name',
        'poste.id                  as poste_id',
        'COUNT(CASE WHEN message.direction = "IN" THEN 1 END) as nbMessagesRecus',
      ])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from(WhatsappChat, 'c')
            .where('c.poste_id = poste.id')
            .andWhere("c.status = 'actif'")
            .andWhere('c.deletedAt IS NULL'),
        'nbChatsActifs',
      )
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from(WhatsappMessage, 'msg')
            .where('msg.commercial_id = commercial.id')
            .andWhere("msg.direction = 'OUT'")
            .andWhere('msg.deletedAt IS NULL')
            .andWhere('msg.createdAt >= :dateStart', { dateStart })
            .andWhere('msg.createdAt <= :dateEnd',   { dateEnd }),
        'nbMessagesEnvoyes',
      )
      .where('commercial.deletedAt IS NULL')
      .groupBy(
        'commercial.id, commercial.name, commercial.email, commercial.isConnected, commercial.lastConnectionAt, poste.name, poste.id',
      )
      .getRawMany();

    // Requête 2 : tempsReponseMoyen pour TOUS les postes en 1 seule requête (fin du N+1)
    const posteIds = [...new Set(performance.map((p) => p.poste_id).filter(Boolean))];
    const tempsParPoste = new Map<string, number>();

    if (posteIds.length > 0) {
      const tempsRows = await this.messageRepository
        .createQueryBuilder('msg_out')
        .innerJoin(
          'whatsapp_message',
          'msg_in',
          `msg_out.chat_id = msg_in.chat_id
           AND msg_in.direction  = "IN"
           AND msg_out.direction = "OUT"
           AND msg_in.timestamp  <  msg_out.timestamp
           AND msg_in.timestamp  >= msg_out.timestamp - INTERVAL 1 HOUR`,
        )
        .select('msg_out.poste_id', 'poste_id')
        .addSelect(
          'AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))',
          'avg',
        )
        .where('msg_out.poste_id IN (:...posteIds)', { posteIds })
        .andWhere('msg_out.createdAt >= :dateStart', { dateStart })
        .andWhere('msg_out.createdAt <= :dateEnd',   { dateEnd })
        .andWhere('msg_out.deletedAt IS NULL')
        .andWhere('msg_in.deletedAt IS NULL')
        .groupBy('msg_out.poste_id')
        .getRawMany();

      for (const row of tempsRows) {
        tempsParPoste.set(row.poste_id, parseInt(row.avg) || 0);
      }
    }

    const result = performance
      .map((perf) => {
        const nbMessagesRecus   = parseInt(perf.nbMessagesRecus)   || 0;
        const nbMessagesEnvoyes = parseInt(perf.nbMessagesEnvoyes) || 0;
        return {
          id:             perf.id,
          name:           perf.name,
          email:          perf.email,
          isConnected:    Boolean(perf.isConnected),
          lastConnectionAt: perf.lastConnectionAt,
          poste_name:     perf.poste_name || 'Non assigné',
          poste_id:       perf.poste_id,
          nbChatsActifs:  parseInt(perf.nbChatsActifs) || 0,
          nbMessagesEnvoyes,
          nbMessagesRecus,
          tauxReponse:    nbMessagesRecus > 0
            ? Math.round((nbMessagesEnvoyes / nbMessagesRecus) * 100)
            : 0,
          tempsReponseMoyen: tempsParPoste.get(perf.poste_id) ?? 0,
        };
      })
      .sort((a, b) => b.nbMessagesEnvoyes - a.nbMessagesEnvoyes);

    this.setCached(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Public — Statut channels (avec cache)
  // ---------------------------------------------------------------------------

  async getStatutChannels(
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<StatutChannelDto[]> {
    const cacheKey = `channels_${periode}_${dateFrom ?? ''}_${dateTo ?? ''}`;
    const cached = this.getCached<StatutChannelDto[]>(cacheKey);
    if (cached) return cached;

    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    const channels = await this.channelRepository
      .createQueryBuilder('channel')
      .leftJoin(
        'channel.chats',
        'chat',
        'chat.deletedAt IS NULL AND chat.status = "actif"',
      )
      .leftJoin(
        'channel.messages',
        'message',
        'message.deletedAt IS NULL AND message.createdAt >= :dateStart AND message.createdAt <= :dateEnd',
        { dateStart, dateEnd },
      )
      .select([
        'channel.id           as id',
        'channel.channel_id   as channel_id',
        'channel.label        as label',
        'channel.is_business  as is_business',
        'channel.uptime       as uptime',
        'channel.version      as version',
        'channel.api_version  as api_version',
        'channel.core_version as core_version',
        'channel.ip           as ip',
        'COUNT(DISTINCT chat.id)    as nb_chats_actifs',
        'COUNT(DISTINCT message.id) as nb_messages',
      ])
      .groupBy(
        'channel.id, channel.channel_id, channel.label, channel.is_business, channel.uptime, channel.version, channel.api_version, channel.core_version, channel.ip',
      )
      .orderBy('nb_messages', 'DESC')
      .getRawMany();

    const result = channels.map((ch) => ({
      id:             ch.id,
      channel_id:     ch.channel_id,
      label:          ch.label ?? null,
      is_business:    Boolean(ch.is_business),
      uptime:         parseInt(ch.uptime)         || 0,
      version:        ch.version,
      api_version:    ch.api_version,
      core_version:   ch.core_version,
      ip:             ch.ip,
      nb_chats_actifs: parseInt(ch.nb_chats_actifs) || 0,
      nb_messages:    parseInt(ch.nb_messages)    || 0,
    }));

    this.setCached(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Public — Performance temporelle (avec cache)
  // ---------------------------------------------------------------------------

  async getPerformanceTemporelle(
    jours: number = 7,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<PerformanceTemporelleDto[]> {
    const cacheKey = `temporelle_${jours}_${dateFrom ?? ''}_${dateTo ?? ''}`;
    const cached = this.getCached<PerformanceTemporelleDto[]>(cacheKey);
    if (cached) return cached;

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .select('DATE(message.createdAt)', 'date')
      .addSelect('COUNT(*)',                                                                    'nb_messages')
      .addSelect('SUM(CASE WHEN message.direction = "IN"  THEN 1 ELSE 0 END)', 'messages_in')
      .addSelect('SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)', 'messages_out')
      .addSelect('COUNT(DISTINCT message.chat_id)',                                            'nb_conversations')
      .where('message.deletedAt IS NULL');

    if (dateFrom && dateTo) {
      qb.andWhere(
        'message.createdAt >= :dateStart AND message.createdAt <= :dateEnd',
        { dateStart: new Date(dateFrom), dateEnd: new Date(dateTo) },
      );
    } else {
      qb.andWhere('message.createdAt >= DATE_SUB(CURDATE(), INTERVAL :jours DAY)', { jours });
    }

    const performance = await qb
      .groupBy('DATE(message.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    const result = performance.map((p) => ({
      periode:          p.date,
      nb_messages:      parseInt(p.nb_messages),
      messages_in:      parseInt(p.messages_in),
      messages_out:     parseInt(p.messages_out),
      nb_conversations: parseInt(p.nb_conversations),
    }));

    this.setCached(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Public — Queue metrics (pas de cache — données temps réel)
  // ---------------------------------------------------------------------------

  async getQueueMetrics(): Promise<QueueMetricsDto> {
    const queue = await this.queueRepository.find();
    const now = Date.now();

    const ages = queue
      .map((qp) => qp.addedAt?.getTime())
      .filter((value): value is number => typeof value === 'number')
      .map((value) => Math.max(0, Math.floor((now - value) / 1000)));

    const queueSize = queue.length;
    const averageAgeSeconds =
      ages.length > 0
        ? Math.floor(ages.reduce((sum, age) => sum + age, 0) / ages.length)
        : 0;
    const maxAgeSeconds = ages.length > 0 ? Math.max(...ages) : 0;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const churn24h = await this.queueRepository.count({
      where: { updatedAt: MoreThanOrEqual(since) },
    });

    if (queueSize === 0) {
      this.logger.warn('QUEUE_ALERT empty_queue');
    }
    if (queueSize >= this.queueWarningThreshold) {
      this.logger.warn('QUEUE_ALERT high_backlog', { queue_size: queueSize });
    }

    return {
      queue_size:          queueSize,
      average_age_seconds: averageAgeSeconds,
      max_age_seconds:     maxAgeSeconds,
      churn_24h:           churn24h,
    };
  }
}
