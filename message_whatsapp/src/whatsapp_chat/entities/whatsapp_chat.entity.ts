import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { MetaAdReferral } from 'src/meta-ad-referral/entities/meta-ad-referral.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
export enum WhatsappChatStatus {
  ACTIF = 'actif',
  EN_ATTENTE = 'en attente',
  FERME = 'fermé',
}

export enum WindowStatus {
  ACTIVE    = 'active',
  LOCKED    = 'locked',
  RELEASED  = 'released',
}

export enum ConversationResult {
  COMMANDE_CONFIRMEE = 'commande_confirmee',
  COMMANDE_A_SAISIR = 'commande_a_saisir',
  A_RELANCER = 'a_relancer',
  RAPPEL_PROGRAMME = 'rappel_programme',
  PAS_INTERESSE = 'pas_interesse',
  SANS_REPONSE = 'sans_reponse',
  INFOS_INCOMPLETES = 'infos_incompletes',
  DEJA_CLIENT = 'deja_client',
  ANNULE = 'annule',
}

@Entity({ engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('IDX_whatsapp_chat_tenant_id', ['tenant_id'])
@Index('UQ_whatsapp_chat_tenant_chat_id', ['tenant_id', 'chat_id'], {
  unique: true,
})
// Index pour les requêtes analytiques (filtre temporel + soft-delete)
@Index('IDX_chat_analytics_time',        ['createdAt', 'deletedAt'])
// Index pour les agrégations par statut dans une période
@Index('IDX_chat_analytics_status_time', ['status', 'createdAt', 'deletedAt'])
// Index pour les chats par poste dans une période
@Index('IDX_chat_poste_time',            ['poste_id', 'createdAt', 'deletedAt'])
// Index hot-path : liste des conversations d'un poste triées par activité récente
@Index('IDX_chat_poste_activity',        ['poste_id', 'last_activity_at'])
// Index pour les agrégations par résultat de conversation (objectifs/ranking)
@Index('IDX_chat_conversation_result',   ['conversation_result', 'deletedAt'])
export class WhatsappChat {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenant_id?: string | null;

  @Column({
    name: 'poste_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  poste_id?: string | null;

  @Column({
    name: 'last_msg_client_channel_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  last_msg_client_channel_id?: string;

  @Column({
    name: 'channel_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  channel_id?: string;

  @ManyToOne(() => WhapiChannel, (channel) => channel.chats, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'channel_id', referencedColumnName: 'channel_id' })
  channel: WhapiChannel;

  // pour les regle du dispatch
  @Column({ type: 'timestamp', nullable: true })
  assigned_at: Date | null;

  @Column({
    type: 'enum',
    enum: ['ONLINE', 'OFFLINE'],
    nullable: true,
  })
  assigned_mode: 'ONLINE' | 'OFFLINE' | null;

  @Column({ type: 'timestamp', nullable: true })
  first_response_deadline_at: Date | null; // R4

  @Column({ type: 'timestamp', nullable: true })
  last_client_message_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_poste_message_at: Date | null;

  //

  @ManyToOne(() => WhatsappPoste, (poste) => poste.chats)
  @JoinColumn({
    name: 'poste_id',
    referencedColumnName: 'id',
  })
  poste?: WhatsappPoste | null;

  @Column({
    name: 'chat_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  chat_id: string; // chat_id WHAPI

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({
    type: 'enum',
    enum: WhatsappChatStatus,
    default: WhatsappChatStatus.EN_ATTENTE,
  })
  status: WhatsappChatStatus;

  @Column({ name: 'type', type: 'varchar', length: 100, nullable: false })
  type: string; // private | group | newsletter

  @Column({ name: 'chat_pic', type: 'text', nullable: true, default: null })
  chat_pic: string | null;

  @Column({ name: 'chat_pic_full', type: 'text', nullable: true, default: null })
  chat_pic_full: string | null;

  @Column({ name: 'chat_pic_refreshed_at', type: 'datetime', nullable: true, default: null })
  chatPicRefreshedAt: Date | null;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  is_pinned: boolean;

  @Column({ name: 'is_muted', type: 'boolean', default: false })
  is_muted: boolean;

  @Column({ name: 'mute_until', type: 'timestamp', nullable: true })
  mute_until: Date | null;

  @Column({
    name: 'is_archived',
    type: 'boolean',
    default: false,
  })
  is_archived: boolean;

  @Column({
    name: 'unread_count',
    type: 'int',
    default: 0,
    comment: 'Number of unread messages in the chat',
  })
  unread_count: number;

  @Column({
    name: 'unread_mention',
    type: 'boolean',
    default: false,
  })
  unread_mention: boolean;

  @Column({ name: 'read_only', type: 'boolean', default: false })
  read_only: boolean;

  @Column({ name: 'not_spam', type: 'boolean', default: true })
  not_spam: boolean;

  @Column({
    name: 'last_activity_at',
    type: 'timestamp',
    nullable: true,
  })
  last_activity_at: Date; // timestamp

  @Column({
    name: 'contact_client',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  contact_client: string;

  // ─── Trigger D — Réouverture (conservé pour FlowBot isReopened) ──────────

  @Column({ name: 'reopened_at', type: 'timestamp', nullable: true })
  reopened_at: Date | null;

  // ─── P7 — Statut métier de fin de conversation ──────────────────────────────
  @Column({
    name: 'conversation_result',
    type: 'enum',
    enum: ConversationResult,
    nullable: true,
    default: null,
  })
  conversation_result: ConversationResult | null;

  @Column({ name: 'conversation_result_at', type: 'timestamp', nullable: true, default: null })
  conversation_result_at: Date | null;

  @Column({ name: 'conversation_result_by', type: 'char', length: 36, nullable: true, default: null })
  conversation_result_by: string | null;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  is_locked: boolean;

  /** Conv rouverte par le client après soumission de rapport — traitement urgent. */
  @Column({ name: 'is_priority', type: 'boolean', default: false })
  is_priority: boolean;

  @Column({ name: 'window_slot', type: 'int', nullable: true, default: null })
  window_slot: number | null;

  @Column({ name: 'window_status', type: 'enum', enum: WindowStatus, nullable: true, default: null })
  window_status: WindowStatus | null;

  @Column({ name: 'customer_window_expires_at', type: 'datetime', nullable: true })
  customerWindowExpiresAt: Date | null;

  /** Nombre de messages sortants (commerciaux + auto) depuis la dernière réponse client. */
  @Column({ name: 'outbound_message_count', type: 'int', default: 0 })
  outboundMessageCount: number;

  @Column({ name: 'campaign_link_id', type: 'char', length: 36, nullable: true, default: null })
  campaignLinkId: string | null;

  /** Cache synchronisé depuis ChatSession.lastWindowReminderSentAt (source de vérité) */
  @Column({ name: 'last_window_reminder_sent_at', type: 'timestamp', nullable: true })
  last_window_reminder_sent_at: Date | null;

  @Column({ name: 'is_ctwa', type: 'boolean', default: false })
  isCtwa: boolean;

  @Column({ name: 'active_session_id', type: 'char', length: 36, nullable: true, default: null })
  activeSessionId: string | null;

  /**
   * Dénormalisation de ChatSession.autoCloseAt (session active).
   * Mis à jour par chat-session.service.ts à chaque computeWindows, NULL à la fermeture.
   * Permet d'exclure les conversations à fenêtre expirée sans join.
   */
  @Column({ name: 'window_expires_at', type: 'timestamp', nullable: true, default: null })
  windowExpiresAt: Date | null;

  @OneToMany(() => WhatsappChatLabel, (data) => data.chat)
  chatLabel: WhatsappChatLabel[];

  @OneToMany(() => WhatsappMessage, (message) => message.chat)
  messages: WhatsappMessage[];

  @OneToMany(() => WhatsappMedia, (media) => media.chat)
  medias: WhatsappMedia[];

  @CreateDateColumn({
    name: 'createdAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was created',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updatedAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was last updated',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    name: 'deletedAt',
    type: 'timestamp',
    nullable: true,
    comment: 'Timestamp when the trajet was deleted',
  })
  deletedAt: Date | null;

  @OneToOne(() => MetaAdReferral, (referral) => referral.chat, { nullable: true, eager: false })
  metaAdReferral: MetaAdReferral | null;
}
