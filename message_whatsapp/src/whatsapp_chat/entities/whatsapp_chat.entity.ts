import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum WhatsappChatStatus {
  ACTIF = 'actif',
  EN_ATTENTE = 'en attente',
  FERME = 'fermé',
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

  @Column({
    name: 'chat_pic',
    type: 'varchar',
    length: 100,
    nullable: false,
    default: 'default.png',
  })
  chat_pic: string;

  @Column({
    name: 'chat_pic_full',
    type: 'varchar',
    length: 100,
    nullable: false,
    default: 'default.png',
  })
  chat_pic_full: string;

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

  @Column({
    name: 'auto_message_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  auto_message_id?: string | null;

  @Column({
    name: 'current_auto_message_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  current_auto_message_id?: string | null;

  @Column({
    name: 'auto_message_status',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  auto_message_status?: string | null;

  @Column({ type: 'int', default: 0 })
  auto_message_step: number;

  @Column({ type: 'boolean', default: false })
  waiting_client_reply: boolean;

  @Column({
    name: 'last_auto_message_sent_at',
    type: 'timestamp',
    nullable: true,
  })
  last_auto_message_sent_at: Date | null;

  // ─── Trigger A — Sans réponse ─────────────────────────────────────────────

  @Column({ name: 'no_response_auto_step', type: 'int', default: 0 })
  no_response_auto_step: number;

  @Column({ name: 'last_no_response_auto_sent_at', type: 'timestamp', nullable: true })
  last_no_response_auto_sent_at: Date | null;

  // ─── Trigger C — Hors horaires ────────────────────────────────────────────

  @Column({ name: 'out_of_hours_auto_sent', type: 'boolean', default: false })
  out_of_hours_auto_sent: boolean;

  // ─── Trigger D — Réouverture ──────────────────────────────────────────────

  @Column({ name: 'reopened_at', type: 'timestamp', nullable: true })
  reopened_at: Date | null;

  @Column({ name: 'reopened_auto_sent', type: 'boolean', default: false })
  reopened_auto_sent: boolean;

  // ─── Trigger E — Attente queue ────────────────────────────────────────────

  @Column({ name: 'queue_wait_auto_step', type: 'int', default: 0 })
  queue_wait_auto_step: number;

  @Column({ name: 'last_queue_wait_auto_sent_at', type: 'timestamp', nullable: true })
  last_queue_wait_auto_sent_at: Date | null;

  // ─── Trigger F — Mot-clé ─────────────────────────────────────────────────

  @Column({ name: 'keyword_auto_sent_at', type: 'timestamp', nullable: true })
  keyword_auto_sent_at: Date | null;

  // ─── Trigger G — Type de client ───────────────────────────────────────────

  @Column({ name: 'client_type_auto_sent', type: 'boolean', default: false })
  client_type_auto_sent: boolean;

  @Column({ name: 'is_known_client', type: 'boolean', nullable: true })
  is_known_client: boolean | null;

  // ─── Trigger H — Inactivité totale ───────────────────────────────────────

  @Column({ name: 'inactivity_auto_step', type: 'int', default: 0 })
  inactivity_auto_step: number;

  @Column({ name: 'last_inactivity_auto_sent_at', type: 'timestamp', nullable: true })
  last_inactivity_auto_sent_at: Date | null;

  // ─── Trigger I — Après assignation ───────────────────────────────────────

  @Column({ name: 'on_assign_auto_sent', type: 'boolean', default: false })
  on_assign_auto_sent: boolean;

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
}
