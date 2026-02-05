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

@Entity()
@Index('UQ_whatsapp_chat_chat_id', ['chat_id'], { unique: true })
export class WhatsappChat {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

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

  @ManyToOne(() => WhapiChannel, (channel) => channel.chats)
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
    unique: true,
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
    name: 'readonly',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  readonly: boolean;

  @Column({
    name: 'auto_message_status',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  auto_message_status?: string | null;

  @Column({ type: 'int', default: 0 })
  auto_message_step: number;
  // 0 = aucun envoyé
  // 1 = message 1 envoyé
  // 2 = message 2 envoyé
  // 3 = message 3 envoyé (STOP)

  @Column({ type: 'boolean', default: false })
  waiting_client_reply: boolean;

  @Column({
    name: 'last_auto_message_sent_at',
    type: 'timestamp',
    nullable: true,
  })
  last_auto_message_sent_at: Date | null;

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
