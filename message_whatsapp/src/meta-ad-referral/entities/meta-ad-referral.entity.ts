import {
  Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Entity({ name: 'meta_ad_referral', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class MetaAdReferral {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'chat_id', type: 'char', length: 36, unique: true })
  chatId: string;

  @OneToOne(() => WhatsappChat, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: WhatsappChat;

  @Column({ name: 'source_url',  type: 'varchar', length: 2048, nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'source_type', type: 'varchar', length: 50 })
  sourceType: string;

  @Column({ name: 'source_id',   type: 'varchar', length: 255 })
  sourceId: string;

  @Column({ name: 'headline',    type: 'varchar', length: 512, nullable: true })
  headline: string | null;

  @Column({ name: 'body',        type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'media_type',  type: 'varchar', length: 50, nullable: true })
  mediaType: string | null;

  @Column({ name: 'image_url',   type: 'varchar', length: 2048, nullable: true })
  imageUrl: string | null;

  @Column({ name: 'ctwa_clid',   type: 'varchar', length: 512, nullable: true })
  ctwaClid: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
