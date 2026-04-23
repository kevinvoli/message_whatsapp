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

      return {
        ...metriquesMessages,
        ...metriquesChats,
        ...metriquesCommerciaux,
        ...metriquesContacts,
        ...metriquesPostes,
        ...metriquesChannels,
        chargePostes,
      };
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
  //
  // PROBLÈME PRÉCÉDENT : jointure 3 niveaux commercial→poste→chats→messages
  //   → produit des millions de lignes intermédiaires avant GROUP BY
  //   → 2 sous-requêtes corrélées (nbChatsActifs, nbMessagesEnvoyes) par commercial
  //
  // SOLUTION : 5 requêtes ciblées en parallèle, chacune utilisant un index dédié,
  //   sans jointure multi-niveaux — résultats agrégés en mémoire via Map O(1)
  // ---------------------------------------------------------------------------

  async getPerformanceCommerciaux(
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<PerformanceCommercialDto[]> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    // ── Requête 1 : commerciaux + poste (simple, aucune jointure vers messages) ──
    const commerciaux = await this.commercialRepository
      .createQueryBuilder('commercial')
      .leftJoin('commercial.poste', 'poste')
      .select([
        'commercial.id               as id',
        'commercial.name             as name',
        'commercial.email            as email',
        'commercial.phone            as phone',
        'commercial.isConnected      as isConnected',
        'commercial.lastConnectionAt as lastConnectionAt',
        'poste.name                  as poste_name',
        'poste.id                    as poste_id',
      ])
      .where('commercial.deletedAt IS NULL')
      .getRawMany();

    if (commerciaux.length === 0) return [];

    const posteIds      = [...new Set(commerciaux.map((c) => c.poste_id).filter(Boolean))];
    const commercialIds = commerciaux.map((c) => c.id);

    // ── Requêtes 2-5 en parallèle : chacune cible un index précis ──────────────
    const [msgInRows, msgOutRows, chatsActifsRows, tempsRows] = await Promise.all([

      // Req 2 — Messages IN par poste (utilise IDX_msg_poste_dir_time)
      posteIds.length > 0
        ? this.messageRepository
            .createQueryBuilder('msg')
            .select('msg.poste_id', 'poste_id')
            .addSelect('COUNT(*)',  'count')
            .where('msg.poste_id IN (:...posteIds)', { posteIds })
            .andWhere('msg.direction = "IN"')
            .andWhere('msg.deletedAt IS NULL')
            .andWhere('msg.createdAt >= :dateStart', { dateStart })
            .andWhere('msg.createdAt <= :dateEnd',   { dateEnd })
            .groupBy('msg.poste_id')
            .getRawMany()
        : Promise.resolve([]),

      // Req 3 — Messages OUT par commercial (utilise IDX_msg_commercial_dir_time)
      commercialIds.length > 0
        ? this.messageRepository
            .createQueryBuilder('msg')
            .select('msg.commercial_id', 'commercial_id')
            .addSelect('COUNT(*)',        'count')
            .where('msg.commercial_id IN (:...commercialIds)', { commercialIds })
            .andWhere('msg.direction = "OUT"')
            .andWhere('msg.deletedAt IS NULL')
            .andWhere('msg.createdAt >= :dateStart', { dateStart })
            .andWhere('msg.createdAt <= :dateEnd',   { dateEnd })
            .groupBy('msg.commercial_id')
            .getRawMany()
        : Promise.resolve([]),

      // Req 4 — Chats actifs par poste (utilise IDX_chat_poste_time)
      posteIds.length > 0
        ? this.chatRepository
            .createQueryBuilder('chat')
            .select('chat.poste_id', 'poste_id')
            .addSelect('COUNT(*)',   'count')
            .where('chat.poste_id IN (:...posteIds)', { posteIds })
            .andWhere("chat.status = 'actif'")
            .andWhere('chat.deletedAt IS NULL')
            .groupBy('chat.poste_id')
            .getRawMany()
        : Promise.resolve([]),

      // Req 5 — Temps de réponse par poste (filtre ON clause = index IDX_msg_response_time)
      posteIds.length > 0
        ? this.messageRepository
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
            .getRawMany()
        : Promise.resolve([]),
    ]);

    // ── Lookup Maps O(1) ──────────────────────────────────────────────────────
    const msgInMap     = new Map(msgInRows.map((r)     => [r.poste_id,      parseInt(r.count) || 0]));
    const msgOutMap    = new Map(msgOutRows.map((r)    => [r.commercial_id, parseInt(r.count) || 0]));
    const chatsMap     = new Map(chatsActifsRows.map((r) => [r.poste_id,   parseInt(r.count) || 0]));
    const tempsParPoste = new Map(tempsRows.map((r)   => [r.poste_id,      parseInt(r.avg)   || 0]));

    const result = commerciaux
      .map((perf) => {
        const nbMessagesRecus   = msgInMap.get(perf.poste_id)   ?? 0;
        const nbMessagesEnvoyes = msgOutMap.get(perf.id)         ?? 0;
        return {
          id:               perf.id,
          name:             perf.name,
          email:            perf.email,
          phone:            perf.phone ?? null,
          isConnected:      Boolean(perf.isConnected),
          lastConnectionAt: perf.lastConnectionAt,
          poste_name:       perf.poste_name || 'Non assigné',
          poste_id:         perf.poste_id,
          nbChatsActifs:    chatsMap.get(perf.poste_id)   ?? 0,
          nbMessagesEnvoyes,
          nbMessagesRecus,
          tauxReponse:      nbMessagesRecus > 0
            ? Math.round((nbMessagesEnvoyes / nbMessagesRecus) * 100)
            : 0,
          tempsReponseMoyen: tempsParPoste.get(perf.poste_id) ?? 0,
        };
      })
      .sort((a, b) => b.nbMessagesEnvoyes - a.nbMessagesEnvoyes);

    return result;
  }

  // ---------------------------------------------------------------------------
  // Public — Statut channels
  // ---------------------------------------------------------------------------

  async getStatutChannels(
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<StatutChannelDto[]> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    // Sous-requêtes scalaires : évite la multiplication de lignes que produirait
    // un double LEFT JOIN (chats × messages) avant le GROUP BY.
    const channels = await this.channelRepository
      .createQueryBuilder('channel')
      .select('channel.id',          'id')
      .addSelect('channel.channel_id', 'channel_id')
      .addSelect('channel.label',      'label')
      .addSelect('channel.is_business','is_business')
      .addSelect('channel.uptime',     'uptime')
      .addSelect(
        `(SELECT COUNT(*) FROM whatsapp_chat c
           WHERE c.channel_id = channel.channel_id
             AND c.deletedAt IS NULL
             AND c.last_activity_at >= :dateStart
             AND c.last_activity_at <= :dateEnd)`,
        'nb_chats_actifs',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM whatsapp_message m
           WHERE m.channel_id = channel.channel_id
             AND m.deletedAt IS NULL
             AND m.createdAt >= :dateStart
             AND m.createdAt <= :dateEnd)`,
        'nb_messages',
      )
      .setParameters({ dateStart, dateEnd })
      .orderBy('nb_messages', 'DESC')
      .getRawMany();

    return channels.map((ch) => ({
      id:              ch.id,
      channel_id:      ch.channel_id,
      label:           ch.label ?? null,
      is_business:     Boolean(ch.is_business),
      uptime:          parseInt(ch.uptime)          || 0,
      nb_chats_actifs: parseInt(ch.nb_chats_actifs) || 0,
      nb_messages:     parseInt(ch.nb_messages)     || 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Public — Performance temporelle
  // ---------------------------------------------------------------------------

  async getPerformanceTemporelle(
    jours: number = 7,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<PerformanceTemporelleDto[]> {
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
