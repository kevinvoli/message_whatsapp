import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { Between, IsNull, MoreThan, MoreThanOrEqual, Not, Repository } from 'typeorm';
import {
  ChargePosteDto,
  MetriquesGlobalesDto,
  PerformanceCommercialDto,
  StatutChannelDto,
} from './dto/create-metrique.dto';
import { QueueMetricsDto } from './dto/create-metrique.dto';

// Importer vos entitÃ©s existantes
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

  /**
   * RÃ©cupÃ¨re toutes les mÃ©triques globales du dashboard
   */
  async getMetriquesGlobales(periode = 'today', dateFrom?: string, dateTo?: string): Promise<MetriquesGlobalesDto> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);
    // Utiliser Promise.all pour parallÃ©liser les requÃªtes
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

  /**
   * MÃ©triques Messages
   */
  private async getMetriquesMessages(dateStart: Date, dateEnd: Date) {
    // Total messages dans la pÃ©riode
    const totalMessages = await this.messageRepository.count({
      where: { deletedAt: IsNull(), createdAt: Between(dateStart, dateEnd) },
    });

    // Messages par direction dans la pÃ©riode
    const messagesParDirection = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.direction', 'direction')
      .addSelect('COUNT(*)', 'count')
      .where('message.deletedAt IS NULL')
      .andWhere('message.createdAt >= :dateStart', { dateStart })
      .andWhere('message.createdAt <= :dateEnd', { dateEnd })
      .groupBy('message.direction')
      .getRawMany();

    const messagesEntrants =
      messagesParDirection.find((m) => m.direction === 'IN')?.count || 0;
    const messagesSortants =
      messagesParDirection.find((m) => m.direction === 'OUT')?.count || 0;

    // messagesAujourdhui = total de la pÃ©riode (compatibilitÃ© DTO)
    const messagesAujourdhui = totalMessages;

    // Taux de rÃ©ponse
    const tauxReponse =
      messagesEntrants > 0
        ? Math.round((messagesSortants / messagesEntrants) * 100)
        : 0;

    // Temps de rÃ©ponse moyen dans la pÃ©riode
    const tempsReponse = await this.messageRepository
      .createQueryBuilder('msg_out')
      .innerJoin(
        'whatsapp_message',
        'msg_in',
        'msg_out.chat_id = msg_in.chat_id AND msg_in.direction = :dirIn AND msg_out.direction = :dirOut AND msg_out.timestamp > msg_in.timestamp',
        { dirIn: 'IN', dirOut: 'OUT' },
      )
      .select(
        'AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))',
        'avg_seconds',
      )
      .where('msg_out.deletedAt IS NULL')
      .andWhere('msg_in.deletedAt IS NULL')
      .andWhere(
        'TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp) < 3600',
      )
      .andWhere('msg_out.createdAt >= :dateStart', { dateStart })
      .andWhere('msg_out.createdAt <= :dateEnd', { dateEnd })
      .getRawOne();

    const tempsReponseMoyen = parseInt(tempsReponse?.avg_seconds) || 0;

    return {
      totalMessages,
      messagesEntrants: parseInt(messagesEntrants),
      messagesSortants: parseInt(messagesSortants),
      messagesAujourdhui,
      tauxReponse,
      tempsReponseMoyen,
    };
  }

  /**
   * MÃ©triques Chats
   */
  private async getMetriquesChats(dateStart: Date, dateEnd: Date) {
    const totalChats = await this.chatRepository.count({
      where: { deletedAt: IsNull(), createdAt: Between(dateStart, dateEnd) },
    });

    // Chats par statut dans la période
    const chatsParStatut = await this.chatRepository
      .createQueryBuilder('chat')
      .select('chat.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('chat.deletedAt IS NULL')
      .andWhere('chat.createdAt >= :dateStart', { dateStart })
      .andWhere('chat.createdAt <= :dateEnd', { dateEnd })
      .groupBy('chat.status')
      .getRawMany();

    const chatsActifs = parseInt(
      chatsParStatut.find((c) => c.status === 'actif')?.count || 0,
    );
    const chatsEnAttente = parseInt(
      chatsParStatut.find((c) => c.status === 'en attente')?.count || 0,
    );
    const chatsFermes = parseInt(
      chatsParStatut.find((c) => c.status === 'fermé')?.count || 0,
    );

    // Chats non lus dans la période
    const chatsNonLus = await this.chatRepository.count({
      where: {
        deletedAt: IsNull(),
        unread_count: MoreThan(0),
        createdAt: Between(dateStart, dateEnd),
      },
    });

    // Chats archivés dans la période
    const chatsArchives = await this.chatRepository.count({
      where: {
        deletedAt: IsNull(),
        is_archived: true,
        createdAt: Between(dateStart, dateEnd),
      },
    });

    // Taux d'assignation dans la période
    const chatsAssignes = await this.chatRepository.count({
      where: {
        deletedAt: IsNull(),
        poste_id: Not(IsNull()),
        createdAt: Between(dateStart, dateEnd),
      },
    });

    const tauxAssignation =
      totalChats > 0 ? Math.round((chatsAssignes / totalChats) * 100) : 0;

    // Temps première réponse dans la période
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
      .andWhere('chat.createdAt <= :dateEnd', { dateEnd })
      .getRawOne();

    return {
      totalChats,
      chatsActifs,
      chatsEnAttente,
      chatsFermes,
      chatsNonLus,
      chatsArchives,
      tauxAssignation,
      tempsPremiereReponse: parseInt(tempsPremiereReponse?.avg_seconds) || 0,
    };
  }

  /**
   * MÃ©triques Commerciaux
   */
  private async getMetriquesCommerciaux(dateStart?: Date, dateEnd?: Date) {
    const commerciauxTotal = await this.commercialRepository.count({
      where: { deletedAt: IsNull() },
    });

    const commerciauxConnectes = await this.commercialRepository.count({
      where: {
        deletedAt: IsNull(),
        isConnected: true,
      },
    });

    // Commerciaux ayant eu au moins un chat actif dans la période
    const qb = this.commercialRepository
      .createQueryBuilder('commercial')
      .innerJoin('commercial.poste', 'poste')
      .innerJoin(
        'poste.chats',
        'chat',
        'chat.status = :status AND chat.deletedAt IS NULL',
        { status: 'actif' },
      )
      .where('commercial.deletedAt IS NULL');

    if (dateStart && dateEnd) {
      qb.andWhere('chat.createdAt >= :dateStart', { dateStart })
        .andWhere('chat.createdAt <= :dateEnd', { dateEnd });
    }

    const commerciauxActifs = await qb
      .select('COUNT(DISTINCT commercial.id)', 'count')
      .getRawOne();

    return {
      commerciauxTotal,
      commerciauxConnectes,
      commerciauxActifs: parseInt(commerciauxActifs?.count) || 0,
    };
  }

  /**
   * MÃ©triques Contacts
   */
  private async getMetriquesContacts(dateStart: Date, dateEnd: Date) {
    const totalContacts = await this.contactRepository.count({
      where: { deletedAt: IsNull() },
    });

    const nouveauxContactsAujourdhui = await this.contactRepository.count({
      where: {
        deletedAt: IsNull(),
        createdAt: Between(dateStart, dateEnd),
      },
    });

    const contactsActifs = await this.contactRepository.count({
      where: {
        deletedAt: IsNull(),
        is_active: true,
      },
    });

    return {
      totalContacts,
      nouveauxContactsAujourdhui,
      contactsActifs,
    };
  }

  /**
   * MÃ©triques Postes
   */
  private async getMetriquesPostes() {
    const totalPostes = await this.posteRepository.count();

    const postesActifs = await this.posteRepository.count({
      where: { is_active: true },
    });

    return {
      totalPostes,
      postesActifs,
    };
  }

  /**
   * Charge par Poste
   */
  private async getChargeParPoste(dateStart: Date, dateEnd: Date): Promise<ChargePosteDto[]> {
    const chargePostes = await this.posteRepository
      .createQueryBuilder('poste')
      .leftJoin(
        'poste.chats',
        'chat',
        'chat.deletedAt IS NULL AND chat.createdAt >= :dateStart AND chat.createdAt <= :dateEnd',
        { dateStart, dateEnd },
      )
      .select('poste.id', 'poste_id')
      .addSelect('poste.name', 'poste_name')
      .addSelect('poste.code', 'poste_code')
      .addSelect('COUNT(chat.id)', 'nb_chats')
      .addSelect(
        'SUM(CASE WHEN chat.status = "actif" THEN 1 ELSE 0 END)',
        'nb_chats_actifs',
      )
      .addSelect(
        'SUM(CASE WHEN chat.status = "en attente" THEN 1 ELSE 0 END)',
        'nb_chats_attente',
      )
      .where('poste.is_active = 1')
      .groupBy('poste.id, poste.name, poste.code')
      .orderBy('nb_chats', 'DESC')
      .getRawMany();

    return chargePostes.map((cp) => ({
      poste_id: cp.poste_id,
      poste_name: cp.poste_name,
      poste_code: cp.poste_code,
      nb_chats: parseInt(cp.nb_chats) || 0,
      nb_chats_actifs: parseInt(cp.nb_chats_actifs) || 0,
      nb_chats_attente: parseInt(cp.nb_chats_attente) || 0,
    }));
  }

  /**
   * MÃ©triques Channels
   */
  private async getMetriquesChannels() {
    const totalChannels = await this.channelRepository.count();

    const channelsActifs = await this.channelRepository.count({
      where: {
        uptime: MoreThan(0),
      },
    });

    return {
      totalChannels,
      channelsActifs,
    };
  }
  /**
   * Performance dÃ©taillÃ©e par commercial
   */
  async getPerformanceCommerciaux(periode = 'today', dateFrom?: string, dateTo?: string): Promise<PerformanceCommercialDto[]> {
    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

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
        'commercial.id as id',
        'commercial.name as name',
        'commercial.email as email',
        'commercial.isConnected as isConnected',
        'commercial.lastConnectionAt as lastConnectionAt',
        'poste.name as poste_name',
        'poste.id as poste_id',
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
            .andWhere('msg.createdAt <= :dateEnd', { dateEnd }),
        'nbMessagesEnvoyes',
      )
      .where('commercial.deletedAt IS NULL')
      .groupBy(
        'commercial.id, commercial.name, commercial.email, commercial.isConnected, commercial.lastConnectionAt, poste.name, poste.id',
      )
      .getRawMany();

    // Calculer le taux de rÃ©ponse et temps moyen pour chaque commercial
    const performanceAvecCalculs = await Promise.all(
      performance.map(async (perf) => {
        const nbMessagesRecus = parseInt(perf.nbMessagesRecus) || 0;
        const nbMessagesEnvoyes = parseInt(perf.nbMessagesEnvoyes) || 0;

        const tauxReponse =
          nbMessagesRecus > 0
            ? Math.round((nbMessagesEnvoyes / nbMessagesRecus) * 100)
            : 0;

        // Temps de rÃ©ponse moyen pour ce commercial dans la pÃ©riode
        const tempsReponse = await this.messageRepository
          .createQueryBuilder('msg_out')
          .innerJoin(
            'whatsapp_message',
            'msg_in',
            'msg_out.chat_id = msg_in.chat_id AND msg_in.direction = "IN" AND msg_out.direction = "OUT" AND msg_out.timestamp > msg_in.timestamp',
          )
          .where('msg_out.poste_id = :posteId', { posteId: perf.poste_id })
          .andWhere('msg_out.createdAt >= :dateStart', { dateStart })
          .andWhere('msg_out.createdAt <= :dateEnd', { dateEnd })
          .andWhere('msg_out.deletedAt IS NULL')
          .andWhere('msg_in.deletedAt IS NULL')
          .andWhere(
            'TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp) < 3600',
          )
          .select(
            'AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))',
            'avg',
          )
          .getRawOne();

        return {
          id: perf.id,
          name: perf.name,
          email: perf.email,
          isConnected: Boolean(perf.isConnected),
          lastConnectionAt: perf.lastConnectionAt,
          poste_name: perf.poste_name || 'Non assignÃ©',
          poste_id: perf.poste_id,
          nbChatsActifs: parseInt(perf.nbChatsActifs) || 0,
          nbMessagesEnvoyes,
          nbMessagesRecus,
          tauxReponse,
          tempsReponseMoyen: parseInt(tempsReponse?.avg) || 0,
        };
      }),
    );

    return performanceAvecCalculs.sort(
      (a, b) => b.nbMessagesEnvoyes - a.nbMessagesEnvoyes,
    );
  }

  /**
   * Statut dÃ©taillÃ© des channels
   */
  async getStatutChannels(periode = 'today', dateFrom?: string, dateTo?: string): Promise<StatutChannelDto[]> {
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
        'channel.id as id',
        'channel.channel_id as channel_id',
        'channel.label as label',
        'channel.is_business as is_business',
        'channel.uptime as uptime',
        'channel.version as version',
        'channel.api_version as api_version',
        'channel.core_version as core_version',
        'channel.ip as ip',
        'COUNT(DISTINCT chat.id) as nb_chats_actifs',
        'COUNT(DISTINCT message.id) as nb_messages',
      ])
      .groupBy(
        'channel.id, channel.channel_id, channel.label, channel.is_business, channel.uptime, channel.version, channel.api_version, channel.core_version, channel.ip',
      )
      .orderBy('nb_messages', 'DESC')
      .getRawMany();

    return channels.map((ch) => ({
      id: ch.id,
      channel_id: ch.channel_id,
      label: ch.label ?? null,
      is_business: Boolean(ch.is_business),
      uptime: parseInt(ch.uptime) || 0,
      version: ch.version,
      api_version: ch.api_version,
      core_version: ch.core_version,
      ip: ch.ip,
      nb_chats_actifs: parseInt(ch.nb_chats_actifs) || 0,
      nb_messages: parseInt(ch.nb_messages) || 0,
    }));
  }

  /**
   * Performance temporelle (7 derniers jours)
   */
  async getPerformanceTemporelle(jours: number = 7, dateFrom?: string, dateTo?: string) {
    const qb = this.messageRepository
      .createQueryBuilder('message')
      .select('DATE(message.createdAt)', 'date')
      .addSelect('COUNT(*)', 'nb_messages')
      .addSelect(
        'SUM(CASE WHEN message.direction = "IN" THEN 1 ELSE 0 END)',
        'messages_in',
      )
      .addSelect(
        'SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)',
        'messages_out',
      )
      .addSelect('COUNT(DISTINCT message.chat_id)', 'nb_conversations')
      .andWhere('message.deletedAt IS NULL');

    if (dateFrom && dateTo) {
      qb.where('message.createdAt >= :dateStart AND message.createdAt <= :dateEnd', {
        dateStart: new Date(dateFrom),
        dateEnd: new Date(dateTo),
      });
    } else {
      qb.where('message.createdAt >= DATE_SUB(CURDATE(), INTERVAL :jours DAY)', { jours });
    }

    const performance = await qb
      .groupBy('DATE(message.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return performance.map((p) => ({
      periode: p.date,
      nb_messages: parseInt(p.nb_messages),
      messages_in: parseInt(p.messages_in),
      messages_out: parseInt(p.messages_out),
      nb_conversations: parseInt(p.nb_conversations),
    }));
  }

  /**
   * Metriques Queue
   */
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
      this.logger.warn('QUEUE_ALERT high_backlog', {
        queue_size: queueSize,
      });
    }

    return {
      queue_size: queueSize,
      average_age_seconds: averageAgeSeconds,
      max_age_seconds: maxAgeSeconds,
      churn_24h: churn24h,
    };
  }
}
