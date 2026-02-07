export class CreateMetriqueDto {}
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';

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

  @ApiProperty({ description: 'Messages créés aujourd\'hui' })
  @IsNumber()
  messagesAujourdhui: number;

  @ApiProperty({ description: 'Taux de réponse en %' })
  @IsNumber()
  tauxReponse: number;

  @ApiProperty({ description: 'Temps de réponse moyen en secondes' })
  @IsNumber()
  tempsReponseMoyen: number;

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

  @ApiProperty({ description: 'Nouveaux contacts aujourd\'hui' })
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

  @ApiProperty({ description: 'Temps moyen avant première réponse en secondes' })
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

  @ApiProperty({ description: 'Compte business ou personnel' })
  @IsBoolean()
  is_business: boolean;

  @ApiProperty({ description: 'Temps de fonctionnement en secondes' })
  @IsNumber()
  uptime: number;

  @ApiProperty({ description: 'Version du channel' })
  @IsString()
  version: string;

  @ApiProperty({ description: 'Version de l\'API' })
  @IsString()
  api_version: string;

  @ApiProperty({ description: 'Version du core' })
  @IsString()
  core_version: string;

  @ApiProperty({ description: 'IP du serveur' })
  @IsString()
  ip: string;

  @ApiProperty({ description: 'Nombre de chats actifs' })
  @IsNumber()
  nb_chats_actifs: number;

  @ApiProperty({ description: 'Nombre de messages aujourd\'hui' })
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

  @ApiProperty({ description: 'Nombre de conversations uniques', required: false })
  @IsOptional()
  @IsNumber()
  nb_conversations?: number;

  @ApiProperty({ description: 'Nombre de commerciaux actifs', required: false })
  @IsOptional()
  @IsNumber()
  nb_commerciaux_actifs?: number;
}