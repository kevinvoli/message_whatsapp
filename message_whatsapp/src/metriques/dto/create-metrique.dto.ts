export class CreateMetriqueDto {}
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
} from 'class-validator';

/**
 * DTO pour la charge d'un poste
 */
export class ChargePosteDto {
  @ApiProperty({ description: 'ID du poste' })
  @IsString()
  poste_id: string;

  @ApiProperty({ description: 'Nom du poste' })
  @IsString()
  poste_name: string;

  @ApiProperty({ description: 'Code du poste' })
  @IsString()
  poste_code: string;

  @ApiProperty({ description: 'Nombre total de chats assignés' })
  @IsNumber()
  nb_chats: number;

  @ApiProperty({ description: 'Nombre de chats actifs' })
  @IsNumber()
  nb_chats_actifs: number;

  @ApiProperty({ description: 'Nombre de chats en attente' })
  @IsNumber()
  nb_chats_attente: number;
}

/**
 * DTO pour les métriques globales
 */
export class MetriquesGlobalesDto {
  // ========== MÉTRIQUES MESSAGES ==========
  @ApiProperty({ description: 'Nombre total de messages' })
  @IsNumber()
  totalMessages: number;

  @ApiProperty({ description: 'Nombre de messages entrants' })
  @IsNumber()
  messagesEntrants: number;

  @ApiProperty({ description: 'Nombre de messages sortants' })
  @IsNumber()
  messagesSortants: number;

  @ApiProperty({ description: "Messages créés aujourd'hui" })
  @IsNumber()
  messagesAujourdhui: number;

  @ApiProperty({ description: 'Taux de réponse en %' })
  @IsNumber()
  tauxReponse: number;

  @ApiProperty({ description: 'Temps de réponse moyen en secondes' })
  @IsNumber()
  tempsReponseMoyen: number;

  @ApiProperty({ description: 'Messages en attente de traitement' })
  @IsNumber()
  messagesEnAttente: number;

  // ========== MÉTRIQUES CHATS ==========
  @ApiProperty({ description: 'Nombre total de conversations' })
  @IsNumber()
  totalChats: number;

  @ApiProperty({ description: 'Conversations actives' })
  @IsNumber()
  chatsActifs: number;

  @ApiProperty({ description: 'Conversations en attente' })
  @IsNumber()
  chatsEnAttente: number;

  @ApiProperty({ description: 'Conversations fermées' })
  @IsNumber()
  chatsFermes: number;

  @ApiProperty({ description: 'Conversations avec messages non lus' })
  @IsNumber()
  chatsNonLus: number;

  @ApiProperty({ description: 'Conversations archivées' })
  @IsNumber()
  chatsArchives: number;


  @ApiProperty({ description: 'Total conversations sur la période' })
  @IsNumber()
  totalConversations: number;

  @ApiProperty({ description: 'Conversations avec nouveaux clients' })
  @IsNumber()
  conversationsNouveauxClients: number;

  @ApiProperty({ description: 'Conversations avec anciens clients' })
  @IsNumber()
  conversationsAnciensClients: number;

  @ApiProperty({ description: 'Conversations lues sans réponse du poste' })
  @IsNumber()
  chatsLusSansReponse: number;

  @ApiProperty({ description: 'Conversations lues avec réponse du poste' })
  @IsNumber()
  chatsLusAvecReponse: number;

  // ========== MÉTRIQUES COMMERCIAUX ==========
  @ApiProperty({ description: 'Nombre total de commerciaux' })
  @IsNumber()
  commerciauxTotal: number;

  @ApiProperty({ description: 'Commerciaux connectés' })
  @IsNumber()
  commerciauxConnectes: number;

  @ApiProperty({ description: 'Commerciaux avec au moins un chat actif' })
  @IsNumber()
  commerciauxActifs: number;

  // ========== MÉTRIQUES CONTACTS ==========
  @ApiProperty({ description: 'Nombre total de contacts' })
  @IsNumber()
  totalContacts: number;

  @ApiProperty({ description: "Nouveaux contacts aujourd'hui" })
  @IsNumber()
  nouveauxContactsAujourdhui: number;

  @ApiProperty({ description: 'Contacts actifs' })
  @IsNumber()
  contactsActifs: number;

  // ========== MÉTRIQUES POSTES ==========
  @ApiProperty({ description: 'Nombre total de postes' })
  @IsNumber()
  totalPostes: number;

  @ApiProperty({ description: 'Postes actifs' })
  @IsNumber()
  postesActifs: number;

  @ApiProperty({ description: 'Charge par poste', type: [ChargePosteDto] })
  @IsArray()
  chargePostes: ChargePosteDto[];

  // ========== MÉTRIQUES CHANNELS ==========
  @ApiProperty({ description: 'Nombre total de channels' })
  @IsNumber()
  totalChannels: number;

  @ApiProperty({ description: 'Channels actifs' })
  @IsNumber()
  channelsActifs: number;

  // ========== MÉTRIQUES PERFORMANCE ==========
  @ApiProperty({ description: 'Messages en attente de traitement' })
  @ApiProperty({ description: 'Pourcentage de chats assignés' })
  @IsNumber()
  tauxAssignation: number;

  @ApiProperty({
    description: 'Temps moyen avant première réponse en secondes',
  })
  @IsNumber()
  tempsPremiereReponse: number;
}

/**
 * DTO pour la performance d'un commercial
 */
export class PerformanceCommercialDto {
  @ApiProperty({ description: 'ID du commercial' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Nom du commercial' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email du commercial' })
  @IsString()
  email: string;

  @ApiProperty({ description: 'Statut de connexion' })
  @IsBoolean()
  isConnected: boolean;

  @ApiProperty({ description: 'Autorisation connexion hors horaires' })
  @IsBoolean()
  allowOutsideHours: boolean;

  @ApiProperty({ description: 'Nom du poste' })
  @IsString()
  poste_name: string;

  @ApiProperty({ description: 'ID du poste', required: false })
  @IsOptional()
  @IsString()
  poste_id?: string | null;

  @ApiProperty({ description: 'Nombre de chats actifs' })
  @IsNumber()
  nbChatsActifs: number;

  @ApiProperty({ description: 'Nombre de messages envoyés' })
  @IsNumber()
  nbMessagesEnvoyes: number;

  @ApiProperty({ description: 'Nombre de messages reçus' })
  @IsNumber()
  nbMessagesRecus: number;

  @ApiProperty({ description: 'Taux de réponse en %' })
  @IsNumber()
  tauxReponse: number;

  @ApiProperty({ description: 'Temps de réponse moyen en secondes' })
  @IsNumber()
  tempsReponseMoyen: number;

  @ApiProperty({ description: 'Date de dernière connexion', required: false })
  @IsOptional()
  @IsString()
  lastConnectionAt?: string | null;

  @ApiProperty({ description: 'Minutes de connexion totales', required: false })
  @IsOptional()
  @IsNumber()
  totalConnectionMinutes?: number;
}

/**
 * DTO pour le statut d'un channel
 */
export class StatutChannelDto {
  @ApiProperty({ description: 'ID du channel' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'ID externe du channel' })
  @IsString()
  channel_id: string;

  @ApiProperty({ description: 'Nom lisible du channel', required: false })
  @IsString()
  @IsOptional()
  label?: string | null;

  @ApiProperty({ description: 'Compte business ou personnel' })
  @IsBoolean()
  is_business: boolean;

  @ApiProperty({ description: 'Temps de fonctionnement en secondes' })
  @IsNumber()
  uptime: number;

  @ApiProperty({ description: 'Nombre de chats actifs' })
  @IsNumber()
  nb_chats_actifs: number;

  @ApiProperty({ description: "Nombre de messages aujourd'hui" })
  @IsNumber()
  nb_messages: number;
}

/**
 * DTO pour la performance temporelle
 */
export class PerformanceTemporelleDto {
  @ApiProperty({ description: 'Date ou période (YYYY-MM-DD)' })
  @IsString()
  periode: string;

  @ApiProperty({ description: 'Nombre de messages' })
  @IsNumber()
  nb_messages: number;

  @ApiProperty({ description: 'Messages entrants' })
  @IsNumber()
  messages_in: number;

  @ApiProperty({ description: 'Messages sortants' })
  @IsNumber()
  messages_out: number;

  @ApiProperty({
    description: 'Nombre de conversations uniques',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  nb_conversations?: number;

  @ApiProperty({ description: 'Nombre de commerciaux actifs', required: false })
  @IsOptional()
  @IsNumber()
  nb_commerciaux_actifs?: number;
}

/**
 * DTO pour les statistiques d'un lien campagne dans le contexte d'un channel
 */
export class ChannelLinkStatsDto {
  @ApiProperty({ description: 'ID du lien' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Nom du lien' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Code court' })
  @IsString()
  shortCode: string;

  @ApiProperty({ description: 'Lien actif' })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({ description: 'Nombre de clics' })
  @IsNumber()
  clickCount: number;

  @ApiProperty({ description: 'Nombre de conversions' })
  @IsNumber()
  conversionCount: number;

  @ApiProperty({ description: 'Conversations ouvertes via ce lien' })
  @IsNumber()
  conversations_count: number;

  @ApiProperty({ description: 'Messages entrants dans ces conversations' })
  @IsNumber()
  messages_in: number;

  @ApiProperty({ description: 'Messages sortants dans ces conversations' })
  @IsNumber()
  messages_out: number;
}

/**
 * DTO pour un point de données temporelles d'un channel
 */
export class ChannelTemporalPointDto {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Messages entrants' })
  @IsNumber()
  messages_in: number;

  @ApiProperty({ description: 'Messages sortants' })
  @IsNumber()
  messages_out: number;

  @ApiProperty({ description: 'Total messages' })
  @IsNumber()
  total: number;
}

/**
 * DTO pour les statistiques détaillées d'un channel
 */
export class ChannelDetailStatsDto {
  @ApiProperty({ description: 'ID externe du channel' })
  @IsString()
  channel_id: string;

  // Conversations
  @ApiProperty({ description: 'Total conversations' })
  @IsNumber()
  conversations_total: number;

  @ApiProperty({ description: 'Conversations actives' })
  @IsNumber()
  conversations_actif: number;

  @ApiProperty({ description: 'Conversations en attente' })
  @IsNumber()
  conversations_attente: number;

  @ApiProperty({ description: 'Conversations fermées' })
  @IsNumber()
  conversations_ferme: number;

  // Messages
  @ApiProperty({ description: 'Total messages' })
  @IsNumber()
  messages_total: number;

  @ApiProperty({ description: 'Messages entrants' })
  @IsNumber()
  messages_in: number;

  @ApiProperty({ description: 'Messages sortants' })
  @IsNumber()
  messages_out: number;

  // Liens campagne
  @ApiProperty({ description: 'Nombre de liens campagne' })
  @IsNumber()
  links_count: number;

  @ApiProperty({ description: 'Total clics sur les liens' })
  @IsNumber()
  links_clicks_total: number;

  @ApiProperty({ description: 'Total conversions sur les liens' })
  @IsNumber()
  links_conversions_total: number;

  // Temporel
  @ApiProperty({ description: 'Messages par jour sur la période', type: [ChannelTemporalPointDto] })
  @IsArray()
  temporal: ChannelTemporalPointDto[];

  // Liens détaillés
  @ApiProperty({ description: 'Stats par lien campagne', type: [ChannelLinkStatsDto] })
  @IsArray()
  links: ChannelLinkStatsDto[];
}

/**
 * DTO pour les metriques de queue
 */
export class QueueMetricsDto {
  @ApiProperty({ description: 'Nombre total de postes en queue' })
  @IsNumber()
  queue_size: number;

  @ApiProperty({ description: 'Age moyen en queue (secondes)' })
  @IsNumber()
  average_age_seconds: number;

  @ApiProperty({ description: 'Age max en queue (secondes)' })
  @IsNumber()
  max_age_seconds: number;

  @ApiProperty({ description: 'Churn 24h (positions mises a jour)' })
  @IsNumber()
  churn_24h: number;
}

/** @deprecated Voir TraficPointDto (alias TraficHorairePointDto à la fin) */

/** Statistiques calculées sur la période */
export class TraficStatistiquesDto {
  total: number;
  messages_in: number;
  messages_out: number;
  moy_par_minute: number;
  moy_par_heure: number;
  moy_par_jour: number;
  heure_pic: number;
  messages_pic: number;
  heure_creux: number;
  heure_pic_in: number;
  ratio_in_out: number;
  pourcentage_in: number;
  pourcentage_out: number;
  concentration_matin: number;
  concentration_aprem: number;
  concentration_soir: number;
  concentration_nuit: number;
  heures_actives: number;
  nb_jours: number;
  mode: 'journee' | 'periode';
}

/** @deprecated Utiliser TraficResponseDto — conservé pour compatibilité */
// export class TraficHoraireResponseDto — voir alias à la fin du fichier


/** Point du diagramme trafic (heure OU jour selon granularité) */
export class TraficPointDto {
  @ApiProperty({ description: 'Index : 0-23 (heure) ou 0-6 (jour, 0=Lun)' })
  index: number;

  @ApiProperty({ description: "Label : '00:00' ou 'Lun'" })
  label: string;

  @ApiProperty() total: number;
  @ApiProperty() messages_in: number;
  @ApiProperty() messages_out: number;
  @ApiProperty({ description: 'Moyenne par jour (mode heure) ou par semaine (mode jour)' })
  avg_par_unite: number;
}

/** Réponse trafic v2 — remplace TraficHoraireResponseDto */
export class TraficResponseDto {
  @ApiProperty({ enum: ['heure', 'jour'] })
  granularite: 'heure' | 'jour';

  @ApiProperty({ type: [TraficPointDto] })
  points: TraficPointDto[];

  @ApiProperty({ type: TraficStatistiquesDto })
  statistiques: TraficStatistiquesDto;

  meta: {
    periode: string;
    dateStart: string;
    dateEnd: string;
    nb_unites: number;
    nb_jours: number;
  };
}

// Alias de rétro-compatibilité
export { TraficResponseDto as TraficHoraireResponseDto };
export { TraficPointDto    as TraficHorairePointDto    };

/** Un point horaire/journalier du graphique conversations */
export class TraficConversationsPointDto {
  index:         number;   // heure 0-23 ou jour 0-6
  label:         string;   // "00:00" ou "Lun"
  total:         number;   // conversations ouvertes sur ce créneau
  fermees:       number;   // fermées créées sur ce créneau
  actives:       number;   // encore actives créées sur ce créneau
  avg_par_unite: number;   // moyenne par jour (mode multi-jours)
}

/** Statistiques conversations calculées sur la période */
export class TraficConversationsStatistiquesDto {
  total:             number;
  actives:           number;
  fermees:           number;
  en_attente:        number;
  taux_cloture:      number;
  taux_actives:      number;
  moy_par_heure:     number;
  moy_par_jour:      number;
  unite_pic:         number;
  conversations_pic: number;
  unites_actives:    number;
  nb_jours:          number;
  mode:              'journee' | 'periode';
}

/** Réponse complète de l'endpoint trafic-conversations */
export class TraficConversationsResponseDto {
  granularite:   'heure' | 'jour';
  points:        TraficConversationsPointDto[];
  statistiques:  TraficConversationsStatistiquesDto;
  meta: {
    periode:   string;
    dateStart: string;
    dateEnd:   string;
    nb_unites: number;
    nb_jours:  number;
  };
}
