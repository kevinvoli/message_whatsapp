import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import {
  BeforeInsert,
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
  // Add this import
} from 'typeorm';

export enum MessageDirection {
  IN = 'IN',
  OUT = 'OUT',
}
export enum WhatsappMessageStatus {
  FAILED = 'failed',
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  PLAYED = 'played',
  DELETED = 'deleted',
}

@Entity({ engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('IDX_whatsapp_message_tenant_id', ['tenant_id'])
@Index(
  'UQ_whatsapp_message_tenant_provider_msg_direction',
  ['tenant_id', 'provider', 'provider_message_id', 'direction'],
  { unique: true },
)
// Index pour les requêtes analytiques (filtre temporel + soft-delete)
@Index('IDX_msg_analytics_time',       ['createdAt', 'deletedAt'])
@Index('IDX_msg_analytics_dir_time',   ['direction', 'createdAt', 'deletedAt'])
// Index pour le calcul du temps de réponse (self-join sur chat_id + direction + timestamp)
@Index('IDX_msg_response_time',        ['chat_id', 'direction', 'timestamp'])
// Index pour la performance des commerciaux (messages OUT par commercial)
@Index('IDX_msg_commercial_dir_time',  ['commercial_id', 'direction', 'createdAt'])
// Index pour les requêtes par poste
@Index('IDX_msg_poste_dir_time',       ['poste_id', 'direction', 'createdAt'])
// message_id : déduplication sur chaque message entrant Whapi (saveIncomingFromWhapi)
@Index('IDX_msg_message_id',           ['message_id'])
// external_id : lookup lors des mises à jour de statut (updateByStatus)
@Index('IDX_msg_external_id',          ['external_id'])
// provider_message_id seul : dedup rapide saveIncomingFromUnified (sans tenant ni direction)
@Index('IDX_msg_provider_message_id',  ['provider_message_id'])
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenant_id?: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 32, nullable: true })
  provider?: string | null;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  provider_message_id?: string | null;

  @Column({
    name: 'message_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  message_id: string | null;

  @Column({
    name: 'external_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  external_id?: string;

  @Column({
    name: 'chat_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  chat_id: string;

  @Column({
    name: 'channel_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  channel_id: string;

  @Column({
    name: 'type',
    type: 'varchar',
    length: 100,
    nullable: false,
    default: 'text',
  })
  type: string;

  @Column({
    name: 'poste_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  poste_id: string | null;

  @Column({
    name: 'texte',
    type: 'longtext',
    nullable: true,
  })
  text?: string | null;

  @ManyToOne(() => WhapiChannel, (data) => data.messages)
  @JoinColumn({
    name: 'channel_id',
    referencedColumnName: 'channel_id',
  })
  channel: WhapiChannel;

  @ManyToOne(() => WhatsappChat, (data) => data.messages)
  @JoinColumn({
    name: 'chat_id',
    referencedColumnName: 'chat_id',
  })
  chat: WhatsappChat;

  @ManyToOne(() => WhatsappPoste, (data) => data.messages, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'poste_id',
    referencedColumnName: 'id',
  })
  poste?: WhatsappPoste | null;

  @OneToMany(
    () => WhatsappMessageContent,
    (messageContent) => messageContent.message,
  )
  messageCnntent: WhatsappMessageContent[];

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contact_id: string | null;

  @ManyToOne(() => Contact, (contact) => contact.messages, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact | null;

  @OneToMany(() => WhatsappMedia, (media) => media.message)
  medias: WhatsappMedia[];

  @Column({
    name: 'direction',
    type: 'enum',
    enum: MessageDirection,
    nullable: false,
  })
  direction: MessageDirection;

  @Column({ name: 'from_me', type: 'bool', nullable: false })
  from_me: boolean;

  @Column({
    name: 'sender_phone',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  from: string;

  @Column({
    name: 'sender_name',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  from_name: string;

  @Column({
    name: 'timestamp',
    type: 'timestamp',
    precision: 0,
    nullable: false,
  })
  timestamp: Date;

  @Column({
    name: 'status',
    type: 'enum',
    enum: WhatsappMessageStatus,
    nullable: false,
    default: WhatsappMessageStatus.DELIVERED,
  })
  status: WhatsappMessageStatus;

  @Column({ name: 'source', type: 'varchar', length: 100, nullable: false })
  source: string;

  @Column({ name: 'error_code', type: 'int', nullable: true })
  error_code?: number | null;

  @Column({ name: 'error_title', type: 'varchar', length: 255, nullable: true })
  error_title?: string | null;

  @Column({
    name: 'commercial_id',
    type: 'uuid',
    nullable: true,
  })
  commercial_id?: string | null;

  @ManyToOne(() => WhatsappCommercial, (commercial) => commercial.messages, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'commercial_id', referencedColumnName: 'id' })
  commercial?: WhatsappCommercial | null;

  /**
   * ID du canal dédié si ce message est arrivé (ou a été envoyé) via un canal dédié à un poste.
   * NULL = canal normal (pool global).
   * Utilisé pour isoler les messages par canal dans la vue conversation.
   */
  @Column({ name: 'dedicated_channel_id', type: 'varchar', length: 100, nullable: true, default: null })
  dedicated_channel_id?: string | null;

  @Column({ name: 'quoted_message_id', type: 'char', length: 36, nullable: true })
  quoted_message_id: string | null;

  @ManyToOne(() => WhatsappMessage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quoted_message_id' })
  quotedMessage?: WhatsappMessage | null;

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
  deletedAt?: Date | null;

  // @BeforeInsert()
  // clearContactForAgentMessage() {
  //   if (this.from_me) {
  //     this.contact = null;
  //   }
  // }
}
