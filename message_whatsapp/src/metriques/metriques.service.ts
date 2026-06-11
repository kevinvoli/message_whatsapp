import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CampaignLink } from 'src/campaign-link/entities/campaign-link.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { MoreThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';
import {
  ChannelDetailStatsDto,
  ChannelLinkStatsDto,
  ChannelTemporalPointDto,
  ChargePosteDto,
  ChatLuSansReponseDto,
  MetriquesGlobalesDto,
  PerformanceCommercialDto,
  PerformanceTemporelleDto,
  StatutChannelDto,
} from './dto/create-metrique.dto';
import { QueueMetricsDto, TraficPointDto, TraficStatistiquesDto, TraficResponseDto, TraficConversationsPointDto, TraficConversationsStatistiquesDto, TraficConversationsResponseDto } from './dto/create-metrique.dto';

interface MetriquesFiltreOptions {
  excludeDedicated?: boolean;
  dedicatedOnly?: boolean;
  dedicatedPosteIds?: string[];
}

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

    @InjectRepository(CampaignLink)
    private campaignLinkRepository: Repository<CampaignLink>,

    private readonly connectionLogService: ConnectionLogService,
  ) {}

  private async getDedicatedPosteIds(): Promise<string[]> {
    const rows = await this.channelRepository
      .createQueryBuilder('channel')
      .select('channel.poste_id', 'poste_id')
      .where('channel.poste_id IS NOT NULL')
      .getRawMany();
    return [...new Set(rows.map((r: any) => r.poste_id as string).filter(Boolean))];
  }

  private applyPosteFilter(
    qb: SelectQueryBuilder<any>,
    alias: string,
    options: MetriquesFiltreOptions,
  ): void {
    const ids = options.dedicatedPosteIds;
    if (!ids || ids.length === 0) return;
    if (options.excludeDedicated) {
      qb.andWhere(
        `(${alias}.poste_id IS NULL OR ${alias}.poste_id NOT IN (:...dedPosteIds))`,
        { dedPosteIds: ids },
      );
    } else if (options.dedicatedOnly) {
      qb.andWhere(
        `${alias}.poste_id IN (:...dedPosteIds)`,
        { dedPosteIds: ids },
      );
    }
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
    const from = dateFrom || undefined;
    const to   = dateTo   || undefined;

    // Helper : construit un dateStart a 00:00:00.000 en heure locale a partir de YYYY-MM-DD
    const toStartOfDay = (s: string): Date => {
      const d = new Date(s);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Helper : construit un dateEnd a 23:59:59.999 en heure locale a partir de YYYY-MM-DD
    const toEndOfDay = (s: string): Date => {
      const d = new Date(s);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    if (from && to) {
      return { dateStart: toStartOfDay(from), dateEnd: toEndOfDay(to) };
    }
    // Fallback : une seule date fournie => journee complete sur cette date
    if (from) {
      return { dateStart: toStartOfDay(from), dateEnd: toEndOfDay(from) };
    }
    if (to) {
      return { dateStart: toStartOfDay(to), dateEnd: toEndOfDay(to) };
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
    options: MetriquesFiltreOptions = {},
  ): Promise<MetriquesGlobalesDto> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);
    const dedicatedPosteIds = options.dedicatedPosteIds ?? await this.getDedicatedPosteIds();
    const opts: MetriquesFiltreOptions = { ...options, dedicatedPosteIds };

      const [
        metriquesMessages,
        metriquesChats,
        metriquesCommerciaux,
        metriquesContacts,
        metriquesPostes,
        metriquesChannels,
        chargePostes,
        metriquesConversations,
      ] = await Promise.all([
        this.getMetriquesMessages(dateStart, dateEnd, opts),
        this.getMetriquesChats(dateStart, dateEnd, opts),
        this.getMetriquesCommerciaux(dateStart, dateEnd, opts),
        this.getMetriquesContacts(dateStart, dateEnd),
        this.getMetriquesPostes(opts),
        this.getMetriquesChannels(opts),
        this.getChargeParPoste(dateStart, dateEnd, opts),
        this.getMetriquesConversations(dateStart, dateEnd, opts),
      ]);

      return {
        ...metriquesMessages,
        ...metriquesChats,
        ...metriquesCommerciaux,
        ...metriquesContacts,
        ...metriquesPostes,
        ...metriquesChannels,
        chargePostes,
        ...metriquesConversations,
      };
  }

  async getMetriquesDedicated(
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<MetriquesGlobalesDto> {
    return this.getMetriquesGlobales(periode, dateFrom, dateTo, { dedicatedOnly: true });
  }

  // ---------------------------------------------------------------------------
  // Private — Messages
  // AVANT : 3 requêtes (COUNT total + GROUP BY direction + self-join)
  // APRÈS  : 2 requêtes (agrégation conditionnelle + self-join optimisé)
  // ---------------------------------------------------------------------------

  private async getMetriquesMessages(
    dateStart: Date, dateEnd: Date, options: MetriquesFiltreOptions = {},
  ) {
    // Requête 1 : total + entrants + sortants en une seule passe
    const statsQb = this.messageRepository
      .createQueryBuilder('message')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN message.direction = "IN"  THEN 1 ELSE 0 END)', 'entrants')
      .addSelect('SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)', 'sortants')
      .addSelect('SUM(CASE WHEN message.isFirstReply = true THEN 1 ELSE 0 END)', 'premiers_tours')
      .where('message.deletedAt IS NULL')
      .andWhere('message.createdAt >= :dateStart', { dateStart })
      .andWhere('message.createdAt <= :dateEnd', { dateEnd });
    this.applyPosteFilter(statsQb, 'message', options);
    const stats = await statsQb.getRawOne();

    const totalMessages    = parseInt(stats?.total)    || 0;
    const messagesEntrants = parseInt(stats?.entrants) || 0;
    const messagesSortants = parseInt(stats?.sortants) || 0;
    const premiersToursReponse = parseInt(stats?.premiers_tours) || 0;
    const tauxReponse = messagesEntrants > 0
      ? Math.round((premiersToursReponse / messagesEntrants) * 100)
      : 0;

    // Requête 2 : temps de réponse moyen
    // Optimisation clé : le filtre de 1 h est déplacé dans la condition ON
    // → MySQL peut l'utiliser pour réduire le produit cartésien dès le join,
    //   au lieu de générer toutes les paires puis filtrer.
    const tempsQb = this.messageRepository
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
      .andWhere('msg_out.createdAt <= :dateEnd', { dateEnd });
    this.applyPosteFilter(tempsQb, 'msg_out', options);
    const tempsReponse = await tempsQb.getRawOne();

    return {
      totalMessages,
      messagesEntrants,
      messagesSortants,
      messagesAujourdhui: totalMessages,
      tauxReponse,
      tempsReponseMoyen: parseInt(tempsReponse?.avg_seconds) || 0,
      messagesEnAttente: 0, // champ requis par le frontend, sans implementation specifique
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Conversations (nouveaux vs anciens clients)
  // ---------------------------------------------------------------------------

  private async getMetriquesConversations(
    dateStart: Date, dateEnd: Date, options: MetriquesFiltreOptions = {},
  ) {
    try {
      // Requete 1 : total conversations AYANT EU une activite client dans la periode
      const totalQb = this.chatRepository
        .createQueryBuilder('chat')
        .select('COUNT(*)', 'total')
        .where('chat.deletedAt IS NULL')
        .andWhere('chat.last_client_message_at IS NOT NULL')
        .andWhere('chat.last_client_message_at >= :dateStart', { dateStart })
        .andWhere('chat.last_client_message_at <= :dateEnd', { dateEnd });
      this.applyPosteFilter(totalQb, 'chat', options);
      const totalResult = await totalQb.getRawOne();

      const totalConversations = parseInt(totalResult?.total) || 0;

      // Requete 2 : chats crees dans la periode = nouveaux clients
      const nouveauxQb = this.chatRepository
        .createQueryBuilder('chat')
        .select('COUNT(*)', 'nouveaux')
        .where('chat.deletedAt IS NULL')
        .andWhere('chat.createdAt >= :dateStartNew', { dateStartNew: dateStart })
        .andWhere('chat.createdAt <= :dateEndNew', { dateEndNew: dateEnd });
      this.applyPosteFilter(nouveauxQb, 'chat', options);
      const nouveauxResult = await nouveauxQb.getRawOne();

      const conversationsNouveauxClients = parseInt(nouveauxResult?.nouveaux) || 0;

      return {
        totalConversations,
        conversationsNouveauxClients,
        conversationsAnciensClients: Math.max(0, totalConversations - conversationsNouveauxClients),
      };
    } catch {
      // En cas d'erreur SQL (ex: table vide, permission), retourner des valeurs neutres
      return {
        totalConversations: 0,
        conversationsNouveauxClients: 0,
        conversationsAnciensClients: 0,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private — Chats
  // AVANT : 6 requêtes COUNT séparées sur la même table
  // APRÈS  : 2 requêtes (1 agrégation conditionnelle + 1 AVG)
  // ---------------------------------------------------------------------------

  private async getMetriquesChats(
    dateStart: Date, dateEnd: Date, options: MetriquesFiltreOptions = {},
  ) {
    // Requête 1 : tous les compteurs en une seule passe
    const statsQb = this.chatRepository
      .createQueryBuilder('chat')
      .select('COUNT(*)',                                                                   'total')
      .addSelect("SUM(CASE WHEN chat.status = 'actif'      THEN 1 ELSE 0 END)",           'actifs')
      .addSelect("SUM(CASE WHEN chat.status = 'en attente' THEN 1 ELSE 0 END)",           'en_attente')
      .addSelect("SUM(CASE WHEN chat.status = 'fermé'      THEN 1 ELSE 0 END)",           'fermes')
      .addSelect('SUM(CASE WHEN chat.is_archived = 1        THEN 1 ELSE 0 END)',           'archives')
      .addSelect('SUM(CASE WHEN chat.poste_id IS NOT NULL   THEN 1 ELSE 0 END)',           'assignes')
      .where('chat.deletedAt IS NULL')
      .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
      .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
    this.applyPosteFilter(statsQb, 'chat', options);
    const stats = await statsQb.getRawOne();

    const totalChats   = parseInt(stats?.total)   || 0;
    const chatsAssignes = parseInt(stats?.assignes) || 0;

    // Requête 2 : temps première réponse (différent agrégat → requête séparée)
    const tempsQb = this.chatRepository
      .createQueryBuilder('chat')
      .select(
        'AVG(TIMESTAMPDIFF(SECOND, chat.last_client_message_at, chat.first_response_deadline_at))',
        'avg_seconds',
      )
      .where('chat.first_response_deadline_at IS NOT NULL')
      .andWhere('chat.last_client_message_at IS NOT NULL')
      .andWhere('chat.deletedAt IS NULL')
      .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
      .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
    this.applyPosteFilter(tempsQb, 'chat', options);
    const tempsPremiereReponse = await tempsQb.getRawOne();

    // Requêtes dédiées non-lus / lus-sans-réponse / lus-avec-réponse
    // basées sur l'état réel des messages (status sent/delivered) et non sur unread_count
    const nonLusQb = this.chatRepository
      .createQueryBuilder('chat')
      .select('COUNT(DISTINCT chat.id)', 'cnt')
      .innerJoin(
        'whatsapp_message', 'unread_msg',
        `unread_msg.chat_id = chat.chat_id AND unread_msg.from_me = 0
         AND unread_msg.status IN ('sent','delivered') AND unread_msg.deletedAt IS NULL`,
      )
      .where('chat.deletedAt IS NULL')
      .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
      .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
    this.applyPosteFilter(nonLusQb, 'chat', options);

    const lusSansQb = this.chatRepository
      .createQueryBuilder('chat')
      .select('COUNT(DISTINCT chat.id)', 'cnt')
      .leftJoin(
        'whatsapp_message', 'unread_msg',
        `unread_msg.chat_id = chat.chat_id AND unread_msg.from_me = 0
         AND unread_msg.status IN ('sent','delivered') AND unread_msg.deletedAt IS NULL`,
      )
      .where('chat.deletedAt IS NULL')
      .andWhere('unread_msg.id IS NULL')
      .andWhere('chat.last_poste_message_at IS NULL')
      .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
      .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
    this.applyPosteFilter(lusSansQb, 'chat', options);

    const lusAvecQb = this.chatRepository
      .createQueryBuilder('chat')
      .select('COUNT(DISTINCT chat.id)', 'cnt')
      .leftJoin(
        'whatsapp_message', 'unread_msg',
        `unread_msg.chat_id = chat.chat_id AND unread_msg.from_me = 0
         AND unread_msg.status IN ('sent','delivered') AND unread_msg.deletedAt IS NULL`,
      )
      .where('chat.deletedAt IS NULL')
      .andWhere('unread_msg.id IS NULL')
      .andWhere('chat.last_poste_message_at IS NOT NULL')
      .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
      .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
    this.applyPosteFilter(lusAvecQb, 'chat', options);

    const [nonLusResult, lusSansResult, lusAvecResult] = await Promise.all([
      nonLusQb.getRawOne(),
      lusSansQb.getRawOne(),
      lusAvecQb.getRawOne(),
    ]);
    const chatsNonLus         = parseInt(nonLusResult?.cnt)  || 0;
    const chatsLusSansReponse = parseInt(lusSansResult?.cnt) || 0;
    const chatsLusAvecReponse = parseInt(lusAvecResult?.cnt) || 0;

    return {
      totalChats,
      chatsActifs:     parseInt(stats?.actifs)     || 0,
      chatsEnAttente:  parseInt(stats?.en_attente) || 0,
      chatsFermes:     parseInt(stats?.fermes)     || 0,
      chatsNonLus,
      chatsArchives:   parseInt(stats?.archives)   || 0,
      tauxAssignation: totalChats > 0 ? Math.round((chatsAssignes / totalChats) * 100) : 0,
      tempsPremiereReponse: parseInt(tempsPremiereReponse?.avg_seconds) || 0,
      chatsLusSansReponse,
      chatsLusAvecReponse,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Commerciaux
  // AVANT : 2 requêtes COUNT séparées
  // APRÈS  : 1 agrégation conditionnelle + 1 DISTINCT COUNT
  // ---------------------------------------------------------------------------

  private async getMetriquesCommerciaux(
    dateStart?: Date, dateEnd?: Date, options: MetriquesFiltreOptions = {},
  ) {
    const ids = options.dedicatedPosteIds;
    // Requête 1 : total + connectés en une seule passe
    const statsQb = this.commercialRepository
      .createQueryBuilder('commercial')
      .select('COUNT(*)',                                                                      'total')
      .addSelect('SUM(CASE WHEN commercial.isConnected = 1 THEN 1 ELSE 0 END)', 'connectes')
      .where('commercial.deletedAt IS NULL');
    if (ids && ids.length > 0 && (options.excludeDedicated || options.dedicatedOnly)) {
      statsQb.leftJoin('commercial.poste', 'poste_flt');
      if (options.excludeDedicated) {
        statsQb.andWhere('(poste_flt.id IS NULL OR poste_flt.id NOT IN (:...dedPosteIds))', { dedPosteIds: ids });
      } else {
        statsQb.andWhere('poste_flt.id IN (:...dedPosteIds)', { dedPosteIds: ids });
      }
    }
    const stats = await statsQb.getRawOne();

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
    if (ids && ids.length > 0 && (options.excludeDedicated || options.dedicatedOnly)) {
      if (options.excludeDedicated) {
        qb.andWhere('poste.id NOT IN (:...dedPosteIds)', { dedPosteIds: ids });
      } else {
        qb.andWhere('poste.id IN (:...dedPosteIds)', { dedPosteIds: ids });
      }
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

  private async getMetriquesPostes(options: MetriquesFiltreOptions = {}) {
    const qb = this.posteRepository
      .createQueryBuilder('poste')
      .select('COUNT(*)',                                               'total')
      .addSelect('SUM(CASE WHEN poste.is_active = 1 THEN 1 ELSE 0 END)', 'actifs');
    const ids = options.dedicatedPosteIds;
    if (ids && ids.length > 0) {
      if (options.excludeDedicated) {
        qb.andWhere('poste.id NOT IN (:...dedPosteIds)', { dedPosteIds: ids });
      } else if (options.dedicatedOnly) {
        qb.andWhere('poste.id IN (:...dedPosteIds)', { dedPosteIds: ids });
      }
    }
    const stats = await qb.getRawOne();

    return {
      totalPostes:  parseInt(stats?.total)  || 0,
      postesActifs: parseInt(stats?.actifs) || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Charge par poste (inchangée, déjà optimale)
  // ---------------------------------------------------------------------------

  private async getChargeParPoste(
    dateStart: Date, dateEnd: Date, options: MetriquesFiltreOptions = {},
  ): Promise<ChargePosteDto[]> {
    const qb = this.posteRepository
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
      .where('poste.is_active = 1');
    const ids = options.dedicatedPosteIds;
    if (ids && ids.length > 0) {
      if (options.excludeDedicated) {
        qb.andWhere('poste.id NOT IN (:...dedPosteIds)', { dedPosteIds: ids });
      } else if (options.dedicatedOnly) {
        qb.andWhere('poste.id IN (:...dedPosteIds)', { dedPosteIds: ids });
      }
    }
    const chargePostes = await qb
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

  private async getMetriquesChannels(options: MetriquesFiltreOptions = {}) {
    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .select('COUNT(*)',                                                   'total')
      .addSelect('SUM(CASE WHEN channel.uptime > 0 THEN 1 ELSE 0 END)', 'actifs');
    if (options.excludeDedicated) {
      qb.andWhere('channel.poste_id IS NULL');
    } else if (options.dedicatedOnly) {
      qb.andWhere('channel.poste_id IS NOT NULL');
    }
    const stats = await qb.getRawOne();

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
    options: MetriquesFiltreOptions = {},
  ): Promise<PerformanceCommercialDto[]> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);
    const dedicatedPosteIds = options.dedicatedPosteIds ?? await this.getDedicatedPosteIds();
    const opts: MetriquesFiltreOptions = { ...options, dedicatedPosteIds };

    // ── Requête 1 : commerciaux + poste (simple, aucune jointure vers messages) ──
    const qb1 = this.commercialRepository
      .createQueryBuilder('commercial')
      .leftJoin('commercial.poste', 'poste')
      .select([
        'commercial.id               as id',
        'commercial.name             as name',
        'commercial.email            as email',
        'commercial.isConnected        as isConnected',
        'commercial.lastConnectionAt   as lastConnectionAt',
        'commercial.allowOutsideHours  as allowOutsideHours',
        'poste.name                    as poste_name',
        'poste.id                      as poste_id',
      ])
      .where('commercial.deletedAt IS NULL');
    const ids = opts.dedicatedPosteIds;
    if (ids && ids.length > 0 && (opts.excludeDedicated || opts.dedicatedOnly)) {
      if (opts.excludeDedicated) {
        qb1.andWhere('(poste.id IS NULL OR poste.id NOT IN (:...dedPosteIds))', { dedPosteIds: ids });
      } else {
        qb1.andWhere('poste.id IN (:...dedPosteIds)', { dedPosteIds: ids });
      }
    }
    const commerciaux = await qb1.getRawMany();

    if (commerciaux.length === 0) return [];

    const posteIds      = [...new Set(commerciaux.map((c) => c.poste_id).filter(Boolean))];
    const commercialIds = commerciaux.map((c) => c.id);

    // ── Requêtes 2-5 en parallèle : chacune cible un index précis ──────────────
    const [msgInRows, msgOutRows, chatsActifsRows, tempsRows, lusSansReponseRows, connectionMinutesMap] = await Promise.all([

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

      // Req 3 — Messages traités (is_first_reply) par commercial
      commercialIds.length > 0
        ? this.messageRepository
            .createQueryBuilder('msg')
            .select('msg.commercial_id', 'commercial_id')
            .addSelect('COUNT(*)',        'count')
            .where('msg.commercial_id IN (:...commercialIds)', { commercialIds })
            .andWhere('msg.isFirstReply = :isFirstReply', { isFirstReply: true })
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

      // Req 6 — Messages IN lus par commercial mais sans réponse OUT dans le même chat après lecture
      commercialIds.length > 0
        ? this.messageRepository
            .createQueryBuilder('msg')
            .select('msg.readByCommercialId', 'commercial_id')
            .addSelect('COUNT(*)', 'count')
            .where('msg.readByCommercialId IN (:...commercialIds)', { commercialIds })
            .andWhere('msg.readByCommercialAt IS NOT NULL')
            .andWhere('msg.direction = :dirIn', { dirIn: 'IN' })
            .andWhere('msg.deletedAt IS NULL')
            .andWhere('msg.createdAt >= :dateStart', { dateStart })
            .andWhere('msg.createdAt <= :dateEnd', { dateEnd })
            .andWhere(
              `NOT EXISTS (
                SELECT 1 FROM whatsapp_message reply
                WHERE reply.chat_id = msg.chat_id
                  AND reply.direction = 'OUT'
                  AND reply.timestamp > msg.read_by_commercial_at
                  AND reply.\`deletedAt\` IS NULL
              )`,
            )
            .groupBy('msg.readByCommercialId')
            .getRawMany()
        : Promise.resolve([]),

      // Req 7 — Minutes de connexion par commercial
      commercialIds.length > 0
        ? this.connectionLogService.getBulkConnectionMinutes(
            commercialIds,
            'commercial',
            dateStart,
            dateEnd,
          )
        : Promise.resolve(new Map<string, number>()),
    ]);

    // ── Lookup Maps O(1) ──────────────────────────────────────────────────────
    const msgInMap          = new Map(msgInRows.map((r)          => [r.poste_id,      parseInt(r.count) || 0]));
    const msgOutMap         = new Map(msgOutRows.map((r)         => [r.commercial_id, parseInt(r.count) || 0])); // premiers tours de réponse
    const chatsMap          = new Map(chatsActifsRows.map((r)   => [r.poste_id,      parseInt(r.count) || 0]));
    const tempsParPoste     = new Map(tempsRows.map((r)         => [r.poste_id,      parseInt(r.avg)   || 0]));
    const lusSansReponseMap = new Map(lusSansReponseRows.map((r) => [r.commercial_id, parseInt(r.count) || 0]));

    const result = commerciaux
      .map((perf) => {
        const nbMessagesRecus   = msgInMap.get(perf.poste_id)   ?? 0;
        const nbMessagesEnvoyes = msgOutMap.get(perf.id)         ?? 0;
        return {
          id:                perf.id,
          name:              perf.name,
          email:             perf.email,
          isConnected:       Boolean(perf.isConnected),
          lastConnectionAt:  perf.lastConnectionAt,
          allowOutsideHours: Boolean(perf.allowOutsideHours),
          poste_name:        perf.poste_name || 'Non assigné',
          poste_id:          perf.poste_id,
          nbChatsActifs:    chatsMap.get(perf.poste_id)   ?? 0,
          nbMessagesEnvoyes,
          nbMessagesRecus,
          tauxReponse:      nbMessagesRecus > 0
            ? Math.round((nbMessagesEnvoyes / nbMessagesRecus) * 100)
            : 0,
          tempsReponseMoyen:           tempsParPoste.get(perf.poste_id) ?? 0,
          totalConnectionMinutes:      connectionMinutesMap.get(perf.id) ?? 0,
          nbMessagesLusSansReponse:    lusSansReponseMap.get(perf.id) ?? 0,
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
    options: MetriquesFiltreOptions = {},
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

    if (options.excludeDedicated || options.dedicatedOnly) {
      const ids = options.dedicatedPosteIds ?? await this.getDedicatedPosteIds();
      if (ids.length > 0) {
        this.applyPosteFilter(qb, 'message', { ...options, dedicatedPosteIds: ids });
      }
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
  // Public — Statistiques détaillées d'un channel
  // ---------------------------------------------------------------------------

  async getChannelDetailStats(
    channelId: string,
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<ChannelDetailStatsDto> {
    try {
      return await this._getChannelDetailStatsInner(channelId, periode, dateFrom, dateTo);
    } catch (err) {
      this.logger.error('getChannelDetailStats failed', {
        channelId,
        periode,
        dateFrom,
        dateTo,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  }

  private async _getChannelDetailStatsInner(
    channelId: string,
    periode: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<ChannelDetailStatsDto> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);
    const em = this.campaignLinkRepository.manager;

    // Q1 : conversations par statut
    let convRow: any = {};
    try {
      const rows: any[] = await em.query(
        `SELECT
          COUNT(*)                                                             AS total,
          SUM(CASE WHEN status = 'actif'      THEN 1 ELSE 0 END)             AS actif,
          SUM(CASE WHEN status = 'en attente' THEN 1 ELSE 0 END)             AS attente,
          SUM(CASE WHEN status = 'fermé'      THEN 1 ELSE 0 END)             AS ferme
         FROM whatsapp_chat
         WHERE channel_id  = ?
           AND \`deletedAt\`  IS NULL
           AND \`createdAt\` >= ?
           AND \`createdAt\` <= ?`,
        [channelId, dateStart, dateEnd],
      );
      convRow = rows[0] ?? {};
    } catch (e) {
      this.logger.error(`[Q1-conv] channelId=${channelId}: ${(e as Error).message}`);
    }

    // Q2 : messages par direction
    let msgRow: any = {};
    try {
      const rows: any[] = await em.query(
        `SELECT
          COUNT(*)                                                             AS total,
          SUM(CASE WHEN direction = 'IN'  THEN 1 ELSE 0 END)                 AS messages_in,
          SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END)                 AS messages_out
         FROM whatsapp_message
         WHERE channel_id  = ?
           AND \`deletedAt\`  IS NULL
           AND \`createdAt\` >= ?
           AND \`createdAt\` <= ?`,
        [channelId, dateStart, dateEnd],
      );
      msgRow = rows[0] ?? {};
    } catch (e) {
      this.logger.error(`[Q2-msg] channelId=${channelId}: ${(e as Error).message}`);
    }

    // Q3a : liste des liens du canal (sans sous-requêtes — fiable même si campaign_link_id absent)
    let links: ChannelLinkStatsDto[] = [];
    try {
      const linkRows: any[] = await em.query(
        `SELECT
          cl.id,
          cl.name,
          cl.short_code       AS shortCode,
          cl.is_active        AS isActive,
          cl.click_count      AS clickCount,
          cl.conversion_count AS conversionCount
         FROM campaign_link cl
         WHERE cl.channel_id = ?`,
        [channelId],
      );
      links = linkRows.map((r: any) => ({
        id:                  r.id,
        name:                r.name,
        shortCode:           r.shortCode ?? r.short_code ?? '',
        isActive:            Boolean(Number(r.isActive ?? r.is_active)),
        clickCount:          parseInt(r.clickCount  ?? r.click_count)  || 0,
        conversionCount:     parseInt(r.conversionCount ?? r.conversion_count) || 0,
        conversations_count: 0,
        messages_in:         0,
        messages_out:        0,
      }));
    } catch (e) {
      this.logger.error(`[Q3a-links-base] channelId=${channelId}: ${(e as Error).message}`);
    }

    // Q3b : comptes conversations + messages par lien (nécessite campaign_link_id sur whatsapp_chat)
    if (links.length > 0) {
      try {
        const ids = links.map((l) => `'${l.id}'`).join(',');
        const countRows: any[] = await em.query(
          `SELECT
            cl.id,
            (SELECT COUNT(*)
               FROM whatsapp_chat c
               WHERE c.campaign_link_id = cl.id
                 AND c.\`deletedAt\` IS NULL)                                 AS conversations_count,
            (SELECT COUNT(*)
               FROM whatsapp_message m
               INNER JOIN whatsapp_chat c2 ON c2.chat_id = m.chat_id
               WHERE c2.campaign_link_id = cl.id
                 AND c2.\`deletedAt\` IS NULL
                 AND m.\`deletedAt\`  IS NULL
                 AND m.direction   = 'IN')                                    AS messages_in,
            (SELECT COUNT(*)
               FROM whatsapp_message m
               INNER JOIN whatsapp_chat c3 ON c3.chat_id = m.chat_id
               WHERE c3.campaign_link_id = cl.id
                 AND c3.\`deletedAt\` IS NULL
                 AND m.\`deletedAt\`  IS NULL
                 AND m.direction   = 'OUT')                                   AS messages_out
           FROM campaign_link cl
           WHERE cl.id IN (${ids})`,
        );
        const countMap = new Map(countRows.map((r: any) => [r.id, r]));
        links = links.map((l) => {
          const c = countMap.get(l.id);
          return c
            ? {
                ...l,
                conversations_count: parseInt(c.conversations_count) || 0,
                messages_in:         parseInt(c.messages_in)         || 0,
                messages_out:        parseInt(c.messages_out)        || 0,
              }
            : l;
        });
      } catch (e) {
        this.logger.warn(`[Q3b-links-counts] channelId=${channelId}: ${(e as Error).message} — counts set to 0`);
      }
    }

    // Q4 : courbe temporelle messages/jour
    let temporal: ChannelTemporalPointDto[] = [];
    try {
      const temporalRows: any[] = await em.query(
        `SELECT
          DATE(\`createdAt\`)                                                  AS date,
          SUM(CASE WHEN direction = 'IN'  THEN 1 ELSE 0 END)                 AS messages_in,
          SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END)                 AS messages_out,
          COUNT(*)                                                             AS total
         FROM whatsapp_message
         WHERE channel_id  = ?
           AND \`deletedAt\`  IS NULL
           AND \`createdAt\` >= ?
           AND \`createdAt\` <= ?
         GROUP BY DATE(\`createdAt\`)
         ORDER BY date ASC`,
        [channelId, dateStart, dateEnd],
      );
      temporal = temporalRows.map((r: any) => ({
        date:         r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
        messages_in:  parseInt(r.messages_in)  || 0,
        messages_out: parseInt(r.messages_out) || 0,
        total:        parseInt(r.total)        || 0,
      }));
    } catch (e) {
      this.logger.error(`[Q4-temporal] channelId=${channelId}: ${(e as Error).message}`);
    }

    return {
      channel_id:              channelId,
      conversations_total:     parseInt(convRow?.total)   || 0,
      conversations_actif:     parseInt(convRow?.actif)   || 0,
      conversations_attente:   parseInt(convRow?.attente) || 0,
      conversations_ferme:     parseInt(convRow?.ferme)   || 0,
      messages_total:          parseInt(msgRow?.total)        || 0,
      messages_in:             parseInt(msgRow?.messages_in)  || 0,
      messages_out:            parseInt(msgRow?.messages_out) || 0,
      links_count:             links.length,
      links_clicks_total:      links.reduce((s, l) => s + l.clickCount, 0),
      links_conversions_total: links.reduce((s, l) => s + l.conversionCount, 0),
      temporal,
      links,
    };
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


  // Libellés des jours (WEEKDAY : 0=Lun ... 6=Dim)
  private readonly DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  async getTraficHoraire(
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
    granularite: 'heure' | 'jour' = 'heure',
  ): Promise<TraficResponseDto> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);
    const nbUnites = granularite === 'heure' ? 24 : 7;

    // Q1 : agrégation par colonne générée (index-only scan avec IDX_msg_trafic_*)
    // La sous-requête scalaire `nb_jours_global` est exécutée UNE SEULE FOIS par MySQL
    const groupCol = granularite === 'heure' ? 'message.hourOfDay' : 'message.dayOfWeekN';

    const rows = await this.messageRepository
      .createQueryBuilder('message')
      .select(groupCol, 'groupe')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN message.direction = "IN"  THEN 1 ELSE 0 END)', 'messages_in')
      .addSelect('SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)', 'messages_out')
      // Sous-requête scalaire non-corrélée — remplace la Q2 séparée (N3)
      .addSelect(
        `(SELECT COUNT(DISTINCT DATE(m2.createdAt))
            FROM whatsapp_message m2
           WHERE m2.deletedAt IS NULL
             AND m2.createdAt >= :dateStart
             AND m2.createdAt <= :dateEnd)`,
        'nb_jours_global',
      )
      .where('message.deletedAt IS NULL')
      .andWhere('message.createdAt >= :dateStart', { dateStart })
      .andWhere('message.createdAt <= :dateEnd',   { dateEnd })
      .groupBy(groupCol)
      .orderBy('groupe', 'ASC')
      .getRawMany();

    // Nb jours distincts dans la plage (lu depuis n'importe quel groupe)
    const nbJoursGlobal = parseInt(rows[0]?.nb_jours_global) || 1;

    // Construire les N points (remplir les tranches sans données avec 0)
    const dataMap = new Map<number, { total: number; in: number; out: number }>();
    for (const row of rows) {
      const g = parseInt(row.groupe);
      dataMap.set(g, {
        total: parseInt(row.total)        || 0,
        in:    parseInt(row.messages_in)  || 0,
        out:   parseInt(row.messages_out) || 0,
      });
    }

    const points: TraficPointDto[] = Array.from({ length: nbUnites }, (_, i) => {
      const d = dataMap.get(i) ?? { total: 0, in: 0, out: 0 };
      const label = granularite === 'heure'
        ? `${String(i).padStart(2, '0')}:00`
        : this.DOW_LABELS[i];
      const nbSemaines = Math.max(1, Math.floor(nbJoursGlobal / 7));
      const avgParUnite = granularite === 'heure'
        ? (nbJoursGlobal > 1 ? Math.round((d.total / nbJoursGlobal) * 10) / 10 : d.total)
        : (nbJoursGlobal > 6 ? Math.round((d.total / nbSemaines) * 10) / 10 : d.total);
      return {
        index:         i,
        label,
        total:         d.total,
        messages_in:   d.in,
        messages_out:  d.out,
        avg_par_unite: avgParUnite,
      };
    });

    // Calcul statistiques (identique à la v1, adapté avec `points` au lieu de `horaire`)
    const totalMsg  = points.reduce((s, p) => s + p.total, 0);
    const totalIn   = points.reduce((s, p) => s + p.messages_in, 0);
    const totalOut  = points.reduce((s, p) => s + p.messages_out, 0);
    const unitesActives = points.filter(p => p.total > 0);
    const nbUnitesActives = unitesActives.length || 1;

    const dureeMs = dateEnd.getTime() - dateStart.getTime();
    const dureeMins = Math.max(1, Math.round(dureeMs / 60000));

    const picPoint = points.reduce((max, p) => p.total > max.total ? p : max, points[0]);
    const picInPoint = points.reduce((max, p) => p.messages_in > max.messages_in ? p : max, points[0]);
    const creuxPoint = unitesActives.length > 0
      ? unitesActives.reduce((min, p) => p.total < min.total ? p : min, unitesActives[0])
      : points[0];

    // Répartition journée uniquement pertinente en mode heure
    const tranche = (a: number, b: number) =>
      points.slice(a, b + 1).reduce((s, p) => s + p.total, 0);
    const tNuit  = granularite === 'heure' ? tranche(0, 5)   : 0;
    const tMatin = granularite === 'heure' ? tranche(6, 11)  : 0;
    const tAprem = granularite === 'heure' ? tranche(12, 17) : 0;
    const tSoir  = granularite === 'heure' ? tranche(18, 23) : 0;
    const pct = (v: number) => totalMsg > 0 ? Math.round((v / totalMsg) * 100) : 0;

    const isSameDay = dateStart.toDateString() === dateEnd.toDateString();

    const statistiques: TraficStatistiquesDto = {
      total:        totalMsg,
      messages_in:  totalIn,
      messages_out: totalOut,
      moy_par_minute: Math.round((totalMsg / dureeMins) * 100) / 100,
      moy_par_heure:  Math.round((totalMsg / nbUnitesActives) * 10) / 10,
      moy_par_jour:   Math.round((totalMsg / nbJoursGlobal) * 10) / 10,
      heure_pic:      picPoint.index,
      messages_pic:   picPoint.total,
      heure_creux:    creuxPoint.index,
      heure_pic_in:   picInPoint.index,
      ratio_in_out:   totalOut > 0 ? Math.round((totalIn / totalOut) * 100) / 100 : 0,
      pourcentage_in:  pct(totalIn),
      pourcentage_out: pct(totalOut),
      concentration_nuit:  pct(tNuit),
      concentration_matin: pct(tMatin),
      concentration_aprem: pct(tAprem),
      concentration_soir:  pct(tSoir),
      heures_actives: nbUnitesActives,
      nb_jours:       nbJoursGlobal,
      mode:           isSameDay ? 'journee' : 'periode',
    };

    return {
      granularite,
      points,
      statistiques,
      meta: {
        periode,
        dateStart: dateStart.toISOString(),
        dateEnd:   dateEnd.toISOString(),
        nb_unites: nbUnites,
        nb_jours:  nbJoursGlobal,
      },
    };
  }

  async getTraficConversations(
    periode      = 'today',
    dateFrom?:   string,
    dateTo?:     string,
    granularite: 'heure' | 'jour' = 'heure',
  ): Promise<TraficConversationsResponseDto> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    const nbUnites = granularite === 'heure' ? 24 : 7;
    const groupCol = granularite === 'heure'
      ? 'HOUR(chat.createdAt)'
      : 'WEEKDAY(chat.createdAt)';

    // ── Q1 : agrégation par créneau ───────────────────────────────────────
    const rows = await this.chatRepository
      .createQueryBuilder('chat')
      .select(groupCol, 'groupe')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        "SUM(CASE WHEN chat.status = 'fermé'      THEN 1 ELSE 0 END)", 'fermees',
      )
      .addSelect(
        "SUM(CASE WHEN chat.status = 'actif'      THEN 1 ELSE 0 END)", 'actives',
      )
      .addSelect(
        "SUM(CASE WHEN chat.status = 'en attente' THEN 1 ELSE 0 END)", 'en_attente',
      )
      .where('chat.deletedAt IS NULL')
      .andWhere('chat.createdAt >= :dateStart', { dateStart })
      .andWhere('chat.createdAt <= :dateEnd',   { dateEnd })
      .groupBy(groupCol)
      .getRawMany();

    // ── Q2 : stats globales ───────────────────────────────────────────────
    const globRaw = await this.chatRepository
      .createQueryBuilder('chat')
      .select('COUNT(*)',                                                        'total')
      .addSelect("SUM(CASE WHEN chat.status = 'fermé'      THEN 1 ELSE 0 END)", 'fermees')
      .addSelect("SUM(CASE WHEN chat.status = 'actif'      THEN 1 ELSE 0 END)", 'actives')
      .addSelect("SUM(CASE WHEN chat.status = 'en attente' THEN 1 ELSE 0 END)", 'en_attente')
      .addSelect('COUNT(DISTINCT DATE(chat.createdAt))',                         'nb_jours')
      .where('chat.deletedAt IS NULL')
      .andWhere('chat.createdAt >= :dateStart', { dateStart })
      .andWhere('chat.createdAt <= :dateEnd',   { dateEnd })
      .getRawOne();

    const totalGlob     = parseInt(globRaw?.total)       || 0;
    const fermeesGlob   = parseInt(globRaw?.fermees)     || 0;
    const activesGlob   = parseInt(globRaw?.actives)     || 0;
    const enAttenteGlob = parseInt(globRaw?.en_attente)  || 0;
    const nbJoursGlobal = parseInt(globRaw?.nb_jours)    || 1;

    const nbSemaines = Math.max(1, Math.floor(nbJoursGlobal / 7));

    // ── Construction des points (créneaux sans données → 0) ───────────────
    const dataMap = new Map<number, { total: number; fermees: number; actives: number }>();
    for (const row of rows) {
      dataMap.set(parseInt(row.groupe), {
        total:   parseInt(row.total)   || 0,
        fermees: parseInt(row.fermees) || 0,
        actives: parseInt(row.actives) || 0,
      });
    }

    const points: TraficConversationsPointDto[] = Array.from({ length: nbUnites }, (_, i) => {
      const d = dataMap.get(i) ?? { total: 0, fermees: 0, actives: 0 };
      const label = granularite === 'heure'
        ? `${String(i).padStart(2, '0')}:00`
        : this.DOW_LABELS[i];
      const avgParUnite = granularite === 'heure'
        ? (nbJoursGlobal > 1 ? Math.round((d.total / nbJoursGlobal) * 10) / 10 : d.total)
        : (nbJoursGlobal > 6 ? Math.round((d.total / nbSemaines)    * 10) / 10 : d.total);
      return { index: i, label, total: d.total, fermees: d.fermees,
               actives: d.actives, avg_par_unite: avgParUnite };
    });

    // ── Calcul statistiques ───────────────────────────────────────────────
    const unitesActives   = points.filter(p => p.total > 0);
    const nbUnitesActives = unitesActives.length || 1;
    const picPoint        = points.reduce((max, p) => p.total > max.total ? p : max, points[0]);
    const isSameDay       = dateStart.toDateString() === dateEnd.toDateString();
    const pct = (v: number) => totalGlob > 0 ? Math.round((v / totalGlob) * 100) : 0;

    const statistiques: TraficConversationsStatistiquesDto = {
      total:             totalGlob,
      actives:           activesGlob,
      fermees:           fermeesGlob,
      en_attente:        enAttenteGlob,
      taux_cloture:      pct(fermeesGlob),
      taux_actives:      pct(activesGlob),
      moy_par_heure:     Math.round((totalGlob / nbUnitesActives) * 10) / 10,
      moy_par_jour:      Math.round((totalGlob / nbJoursGlobal)   * 10) / 10,
      unite_pic:         picPoint.index,
      conversations_pic: picPoint.total,
      unites_actives:    nbUnitesActives,
      nb_jours:          nbJoursGlobal,
      mode:              isSameDay ? 'journee' : 'periode',
    };

    return {
      granularite,
      points,
      statistiques,
      meta: {
        periode,
        dateStart: dateStart.toISOString(),
        dateEnd:   dateEnd.toISOString(),
        nb_unites: nbUnites,
        nb_jours:  nbJoursGlobal,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Public — Conversations lues sans réponse pour un commercial
  // ---------------------------------------------------------------------------

  async getChatsLusSansReponse(
    commercialId: string,
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<ChatLuSansReponseDto[]> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    const rows = await this.chatRepository
      .createQueryBuilder('chat')
      .select('chat.id', 'id')
      .addSelect('chat.chat_id', 'chat_id')
      .addSelect('chat.name', 'name')
      .addSelect('chat.contact_client', 'contact_client')
      .addSelect('chat.status', 'status')
      .addSelect('chat.last_activity_at', 'last_activity_at')
      .addSelect('chat.last_client_message_at', 'last_client_message_at')
      .addSelect('chat.last_poste_message_at', 'last_poste_message_at')
      .addSelect(
        `(SELECT cs.started_at FROM chat_session cs WHERE cs.whatsapp_chat_id = chat.id ORDER BY cs.started_at DESC LIMIT 1)`,
        'last_opened_at',
      )
      .addSelect(
        `(SELECT cs.ended_at FROM chat_session cs WHERE cs.whatsapp_chat_id = chat.id ORDER BY cs.started_at DESC LIMIT 1)`,
        'last_closed_at',
      )
      .addSelect(
        `(SELECT CASE WHEN (SELECT COUNT(*) FROM chat_session cs2 WHERE cs2.whatsapp_chat_id = chat.id) > 1 THEN cs.started_at ELSE NULL END FROM chat_session cs WHERE cs.whatsapp_chat_id = chat.id ORDER BY cs.started_at DESC LIMIT 1)`,
        'last_relaunched_at',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM chat_session cs WHERE cs.whatsapp_chat_id = chat.id)`,
        'session_count',
      )
      .addSelect(
        `(SELECT MAX(m_read.read_by_commercial_at)
            FROM whatsapp_message m_read
           WHERE m_read.chat_id = chat.chat_id
             AND m_read.read_by_commercial_id = :commercialId
             AND m_read.read_by_commercial_at IS NOT NULL
             AND m_read.direction = 'IN'
             AND m_read.\`deletedAt\` IS NULL)`,
        'last_read_at',
      )
      .where('chat.deletedAt IS NULL')
      .andWhere(
        `EXISTS (
          SELECT 1 FROM whatsapp_message m_in
          WHERE m_in.chat_id = chat.chat_id
            AND m_in.read_by_commercial_id = :commercialId
            AND m_in.read_by_commercial_at IS NOT NULL
            AND m_in.direction = 'IN'
            AND m_in.\`deletedAt\` IS NULL
            AND m_in.\`createdAt\` >= :dateStart
            AND m_in.\`createdAt\` <= :dateEnd
        )`,
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM whatsapp_message m_out
          WHERE m_out.chat_id = chat.chat_id
            AND m_out.direction = 'OUT'
            AND m_out.\`deletedAt\` IS NULL
            AND m_out.timestamp > (
              SELECT MAX(m_rd.read_by_commercial_at)
              FROM whatsapp_message m_rd
              WHERE m_rd.chat_id = chat.chat_id
                AND m_rd.read_by_commercial_id = :commercialId
                AND m_rd.read_by_commercial_at IS NOT NULL
                AND m_rd.direction = 'IN'
                AND m_rd.\`deletedAt\` IS NULL
            )
        )`,
      )
      .setParameters({ commercialId, dateStart, dateEnd })
      .orderBy('chat.last_activity_at', 'DESC')
      .getRawMany<Record<string, unknown>>();

    return rows.map((r) => ({
      id:                     r['id'] as string,
      chat_id:                r['chat_id'] as string,
      name:                   (r['name'] as string | null) ?? '',
      contact_client:         (r['contact_client'] as string | null) ?? '',
      status:                 (r['status'] as string | null) ?? '',
      last_activity_at:        (r['last_activity_at'] as Date | null) ?? null,
      last_client_message_at:  (r['last_client_message_at'] as Date | null) ?? null,
      last_read_at:            (r['last_read_at'] as Date | null) ?? null,
      last_poste_message_at:   (r['last_poste_message_at'] as Date | null) ?? null,
      last_opened_at:          (r['last_opened_at'] as Date | null) ?? null,
      last_closed_at:          (r['last_closed_at'] as Date | null) ?? null,
      last_relaunched_at:      (r['last_relaunched_at'] as Date | null) ?? null,
      session_count:           (r['session_count'] as number | null) ?? 1,
    }));
  }

}