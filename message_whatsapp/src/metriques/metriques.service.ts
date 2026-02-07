import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { PendingMessage } from 'src/dispatcher/entities/pending-message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { IsNull, Repository } from 'typeorm';
import { ChargePosteDto, MetriquesGlobalesDto, PerformanceCommercialDto, StatutChannelDto } from './dto/create-metrique.dto';
import { PendingMessageStatus } from './utils';

// Importer vos entités existantes
@Injectable()
export class MetriquesService {
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
    
    @InjectRepository(PendingMessage)
    private pendingMessageRepository: Repository<PendingMessage>,
  ) {}

  /**
   * Récupère toutes les métriques globales du dashboard
   */
  async getMetriquesGlobales(): Promise<MetriquesGlobalesDto> {
    // Utiliser Promise.all pour paralléliser les requêtes
    const [
      metriquesMessages,
      metriquesChats,
      metriquesCommerciaux,
      metriquesContacts,
      metriquesPostes,
      metriquesChannels,
      chargePostes,
    ] = await Promise.all([
      this.getMetriquesMessages(),
      this.getMetriquesChats(),
      this.getMetriquesCommerciaux(),
      this.getMetriquesContacts(),
      this.getMetriquesPostes(),
      this.getMetriquesChannels(),
      this.getChargeParPoste(),
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
   * Métriques Messages
   */
  private async getMetriquesMessages() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total messages
    const totalMessages = await this.messageRepository.count({
      where: { deletedAt: IsNull() },
    });

    // Messages par direction
    const messagesParDirection = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.direction', 'direction')
      .addSelect('COUNT(*)', 'count')
      .where('message.deletedAt IS NULL')
      .groupBy('message.direction')
      .getRawMany();

    const messagesEntrants = messagesParDirection.find(m => m.direction === 'IN')?.count || 0;
    const messagesSortants = messagesParDirection.find(m => m.direction === 'OUT')?.count || 0;

    // Messages aujourd'hui
    const messagesAujourdhui = await this.messageRepository.count({
      where: {
        deletedAt: IsNull(),
        createdAt: { $gte: today } as any,
      },
    });

    // Taux de réponse
    const tauxReponse = messagesEntrants > 0 
      ? Math.round((messagesSortants / messagesEntrants) * 100) 
      : 0;

    // Temps de réponse moyen
    const tempsReponse = await this.messageRepository
      .createQueryBuilder('msg_out')
      .innerJoin(
        'whatsapp_message',
        'msg_in',
        'msg_out.chat_id = msg_in.chat_id AND msg_in.direction = :dirIn AND msg_out.direction = :dirOut AND msg_out.timestamp > msg_in.timestamp',
        { dirIn: 'IN', dirOut: 'OUT' }
      )
      .select('AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))', 'avg_seconds')
      .where('msg_out.deletedAt IS NULL')
      .andWhere('msg_in.deletedAt IS NULL')
      .andWhere('TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp) < 3600')
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
   * Métriques Chats
   */
  private async getMetriquesChats() {
    const totalChats = await this.chatRepository.count({
      where: { deletedAt: IsNull() },
    });

    // Chats par statut
    const chatsParStatut = await this.chatRepository
      .createQueryBuilder('chat')
      .select('chat.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('chat.deletedAt IS NULL')
      .groupBy('chat.status')
      .getRawMany();

    const chatsActifs = parseInt(chatsParStatut.find(c => c.status === 'actif')?.count || 0);
    const chatsEnAttente = parseInt(chatsParStatut.find(c => c.status === 'en attente')?.count || 0);
    const chatsFermes = parseInt(chatsParStatut.find(c => c.status === 'fermé')?.count || 0);

    // Chats non lus
    const chatsNonLus = await this.chatRepository.count({
      where: {
        deletedAt: IsNull(),
        unread_count: { $gt: 0 } as any,
      },
    });

    // Chats archivés
    const chatsArchives = await this.chatRepository.count({
      where: {
        deletedAt: IsNull(),
        is_archived: true,
      },
    });

    // Taux d'assignation
    const chatsAssignes = await this.chatRepository.count({
      where: {
        deletedAt: IsNull(),
        poste_id: { $ne: IsNull() } as any,
      },
    });

    const tauxAssignation = totalChats > 0 
      ? Math.round((chatsAssignes / totalChats) * 100) 
      : 0;

    // Temps première réponse
    const tempsPremiereReponse = await this.chatRepository
      .createQueryBuilder('chat')
      .select('AVG(TIMESTAMPDIFF(SECOND, chat.last_client_message_at, chat.first_response_deadline_at))', 'avg_seconds')
      .where('chat.first_response_deadline_at IS NOT NULL')
      .andWhere('chat.last_client_message_at IS NOT NULL')
      .andWhere('chat.deletedAt IS NULL')
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
   * Métriques Commerciaux
   */
  private async getMetriquesCommerciaux() {
    const commerciauxTotal = await this.commercialRepository.count({
      where: { deleted_at: IsNull() },
    });

    const commerciauxConnectes = await this.commercialRepository.count({
      where: {
        deleted_at: IsNull(),
        isConnected: true,
      },
    });

    // Commerciaux actifs (ayant au moins un chat actif)
    const commerciauxActifs = await this.commercialRepository
      .createQueryBuilder('commercial')
      .innerJoin('commercial.poste', 'poste')
      .innerJoin('poste.chats', 'chat', 'chat.status = :status', { status: 'actif' })
      .where('commercial.deleted_at IS NULL')
      .andWhere('chat.deletedAt IS NULL')
      .select('COUNT(DISTINCT commercial.id)', 'count')
      .getRawOne();

    return {
      commerciauxTotal,
      commerciauxConnectes,
      commerciauxActifs: parseInt(commerciauxActifs?.count) || 0,
    };
  }

  /**
   * Métriques Contacts
   */
  private async getMetriquesContacts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalContacts = await this.contactRepository.count({
      where: { deletedAt: IsNull() },
    });

    const nouveauxContactsAujourdhui = await this.contactRepository.count({
      where: {
        deletedAt: IsNull(),
        createdAt: { $gte: today } as any,
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
   * Métriques Postes
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
  private async getChargeParPoste(): Promise<ChargePosteDto[]> {
    const chargePostes = await this.posteRepository
      .createQueryBuilder('poste')
      .leftJoin('poste.chats', 'chat', 'chat.deletedAt IS NULL')
      .select('poste.id', 'poste_id')
      .addSelect('poste.name', 'poste_name')
      .addSelect('poste.code', 'poste_code')
      .addSelect('COUNT(chat.id)', 'nb_chats')
      .addSelect('SUM(CASE WHEN chat.status = "actif" THEN 1 ELSE 0 END)', 'nb_chats_actifs')
      .addSelect('SUM(CASE WHEN chat.status = "en attente" THEN 1 ELSE 0 END)', 'nb_chats_attente')
      .where('poste.is_active = 1')
      .groupBy('poste.id, poste.name, poste.code')
      .orderBy('nb_chats', 'DESC')
      .getRawMany();

    return chargePostes.map(cp => ({
      poste_id: cp.poste_id,
      poste_name: cp.poste_name,
      poste_code: cp.poste_code,
      nb_chats: parseInt(cp.nb_chats) || 0,
      nb_chats_actifs: parseInt(cp.nb_chats_actifs) || 0,
      nb_chats_attente: parseInt(cp.nb_chats_attente) || 0,
    }));
  }

  /**
   * Métriques Channels
   */
  private async getMetriquesChannels() {
    const totalChannels = await this.channelRepository.count();

    const channelsActifs = await this.channelRepository.count({
      where: {
        uptime: { $gt: 0 } as any,
      },
    });

    return {
      totalChannels,
      channelsActifs,
    };
  }

  /**
   * Messages Pending
   */


  /**
   * Performance détaillée par commercial
   */
  async getPerformanceCommerciaux(): Promise<PerformanceCommercialDto[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const performance = await this.commercialRepository
      .createQueryBuilder('commercial')
      .leftJoin('commercial.poste', 'poste')
      .leftJoin('poste.chats', 'chat', 'chat.deletedAt IS NULL')
      .leftJoin('chat.messages', 'message', 'message.deletedAt IS NULL AND DATE(message.createdAt) = CURDATE()')
      .select([
        'commercial.id as id',
        'commercial.name as name',
        'commercial.email as email',
        'commercial.isConnected as isConnected',
        'commercial.lastConnectionAt as lastConnectionAt',
        'poste.name as poste_name',
        'poste.id as poste_id',
        'COUNT(DISTINCT CASE WHEN chat.status = "actif" THEN chat.id END) as nbChatsActifs',
        'COUNT(CASE WHEN message.direction = "OUT" THEN 1 END) as nbMessagesEnvoyes',
        'COUNT(CASE WHEN message.direction = "IN" THEN 1 END) as nbMessagesRecus',
      ])
      .where('commercial.deleted_at IS NULL')
      .groupBy('commercial.id, commercial.name, commercial.email, commercial.isConnected, commercial.lastConnectionAt, poste.name, poste.id')
      .getRawMany();

    // Calculer le taux de réponse et temps moyen pour chaque commercial
    const performanceAvecCalculs = await Promise.all(
      performance.map(async (perf) => {
        const nbMessagesRecus = parseInt(perf.nbMessagesRecus) || 0;
        const nbMessagesEnvoyes = parseInt(perf.nbMessagesEnvoyes) || 0;
        
        const tauxReponse = nbMessagesRecus > 0 
          ? Math.round((nbMessagesEnvoyes / nbMessagesRecus) * 100) 
          : 0;

        // Temps de réponse moyen pour ce commercial
        const tempsReponse = await this.messageRepository
          .createQueryBuilder('msg_out')
          .innerJoin('whatsapp_message', 'msg_in', 
            'msg_out.chat_id = msg_in.chat_id AND msg_in.direction = "IN" AND msg_out.direction = "OUT" AND msg_out.timestamp > msg_in.timestamp'
          )
          .where('msg_out.poste_id = :posteId', { posteId: perf.poste_id })
          .andWhere('msg_out.deletedAt IS NULL')
          .andWhere('msg_in.deletedAt IS NULL')
          .andWhere('DATE(msg_out.createdAt) = CURDATE()')
          .andWhere('TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp) < 3600')
          .select('AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))', 'avg')
          .getRawOne();

        return {
          id: perf.id,
          name: perf.name,
          email: perf.email,
          isConnected: Boolean(perf.isConnected),
          lastConnectionAt: perf.lastConnectionAt,
          poste_name: perf.poste_name || 'Non assigné',
          poste_id: perf.poste_id,
          nbChatsActifs: parseInt(perf.nbChatsActifs) || 0,
          nbMessagesEnvoyes,
          nbMessagesRecus,
          tauxReponse,
          tempsReponseMoyen: parseInt(tempsReponse?.avg) || 0,
        };
      })
    );

    return performanceAvecCalculs.sort((a, b) => b.nbMessagesEnvoyes - a.nbMessagesEnvoyes);
  }

  /**
   * Statut détaillé des channels
   */
  async getStatutChannels(): Promise<StatutChannelDto[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const channels = await this.channelRepository
      .createQueryBuilder('channel')
      .leftJoin('channel.chats', 'chat', 'chat.deletedAt IS NULL AND chat.status = "actif"')
      .leftJoin('channel.messages', 'message', 'message.deletedAt IS NULL AND DATE(message.createdAt) = CURDATE()')
      .select([
        'channel.id as id',
        'channel.channel_id as channel_id',
        'channel.is_business as is_business',
        'channel.uptime as uptime',
        'channel.version as version',
        'channel.api_version as api_version',
        'channel.core_version as core_version',
        'channel.ip as ip',
        'COUNT(DISTINCT chat.id) as nb_chats_actifs',
        'COUNT(DISTINCT message.id) as nb_messages',
      ])
      .groupBy('channel.id, channel.channel_id, channel.is_business, channel.uptime, channel.version, channel.api_version, channel.core_version, channel.ip')
      .orderBy('nb_messages', 'DESC')
      .getRawMany();

    return channels.map(ch => ({
      id: ch.id,
      channel_id: ch.channel_id,
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
  async getPerformanceTemporelle(jours: number = 7) {
    const performance = await this.messageRepository
      .createQueryBuilder('message')
      .select('DATE(message.createdAt)', 'date')
      .addSelect('COUNT(*)', 'nb_messages')
      .addSelect('SUM(CASE WHEN message.direction = "IN" THEN 1 ELSE 0 END)', 'messages_in')
      .addSelect('SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)', 'messages_out')
      .addSelect('COUNT(DISTINCT message.chat_id)', 'nb_conversations')
      .where('message.createdAt >= DATE_SUB(CURDATE(), INTERVAL :jours DAY)', { jours })
      .andWhere('message.deletedAt IS NULL')
      .groupBy('DATE(message.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return performance.map(p => ({
      periode: p.date,
      nb_messages: parseInt(p.nb_messages),
      messages_in: parseInt(p.messages_in),
      messages_out: parseInt(p.messages_out),
      nb_conversations: parseInt(p.nb_conversations),
    }));
  }
}