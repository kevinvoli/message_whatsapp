import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WhatsappMediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'voice'
  | 'gif'
  | 'short'
  | 'location'
  | 'live_location'
  | 'contact'
  | 'contact_list';

@Entity()
@Index('UQ_whatsapp_media_media_id', ['media_id'], { unique: true })
export class WhatsappMedia {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'media_id', type: 'varchar', length: 100, nullable: false })
  media_id: string;

  @Column({
    name: 'message_content_id',
    type: 'varchar',
    length: 100,
    nullable: true,
    // unique: true,
  })
  message_content_id?: string |null;

  @Column({ name: 'media_type', type: 'varchar', length: 100, nullable: false })
  media_type: WhatsappMediaType;

  @Column({
    name: 'whapi_media_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  whapi_media_id: string;

  @Column({ name: 'url', type: 'text', nullable: true })
  url?: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: false })
  mime_type: string;

  @Column({ name: 'file_name', type: 'varchar', length: 100, nullable: true })
  file_name?: string | null;

  @Column({ name: 'file_size', type: 'varchar', length: 100, nullable: true })
  file_size?: string | null;

  @Column({ name: 'sha256', type: 'varchar', length: 100, nullable: true })
  sha256?: string | null;

  @Column({ name: 'width', type: 'varchar', length: 100, nullable: true })
  width?: string | null;

  @Column({ name: 'height', type: 'varchar', length: 100, nullable: true })
  height?: string | null;
 

  @Column({ name: 'caption', type: 'varchar', length: 255, nullable: true })
  caption?: string | null;

  @Column({ name: 'preview', type: 'varchar', length: 255, nullable: true })
  preview?: string | null;

  @Column({ name: 'view_once', type: 'varchar', length: 100, nullable: false })
  view_once: string;

  // 🎵 AUDIO / 🎥 VIDEO / 🎙️ VOICE
@Column({ name: 'duration_seconds', type: 'int', nullable: true })
duration_seconds?: number |null;

// 📍 LOCATION
@Column({ name: 'latitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
latitude?: number | null;

@Column({ name: 'longitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
longitude?: number | null;

  // Relation avec le message
  @ManyToOne(() => WhatsappMessage, (message) => message.medias, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: WhatsappMessage;

  // Relation avec le chat (via le message)
  @ManyToOne(() => WhatsappChat, (chat) => chat.medias, { nullable: true })
  @JoinColumn({ name: 'chat_id' })
  chat?: WhatsappChat;

  // Optionnel : lien direct avec le channel
  @ManyToOne(() => WhapiChannel, (channel) => channel.medias, {
    nullable: true,
  })
  @JoinColumn({ name: 'channel_id' })
  channel?: WhapiChannel | null;

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
