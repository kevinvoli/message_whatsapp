import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
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

@Entity()
@Index('UQ_whatsapp_media_content_media_content_id', ['media_content_id'], { unique: true })
export class WhatsappMediaContent {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'media_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  media_content_id: string;

  @Column({
    name: 'message_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  message_content_id: string;
    @ManyToOne(() => WhatsappMessageContent, (messageContent) => messageContent.mediaContent)
    @JoinColumn({ name: 'message_content_id', referencedColumnName: 'message_content_id' })
    messageContent: WhatsappMessageContent;

  @Column({ name: 'media_type', type: 'varchar', length: 100, nullable: false })
  media_type: string;

  @Column({
    name: 'whapi_media_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  whapi_media_id: string;
 

  @Column({ name: 'url', type: 'varchar', length: 100, nullable: false })
  url: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: false })
  mime_type: string;

  @Column({ name: 'file_name', type: 'varchar', length: 100, nullable: false })
  file_name: string;

  @Column({ name: 'file_size', type: 'varchar', length: 100, nullable: false })
  file_size: string;

  @Column({ name: 'sha256', type: 'varchar', length: 100, nullable: false })
  sha256: string;

  @Column({ name: 'width', type: 'varchar', length: 100, nullable: false })
  width: string;

  @Column({ name: 'height', type: 'varchar', length: 100, nullable: false })
  height: string;

  @Column({
    name: 'duration_seconds',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  duration_seconds: string;

  @Column({ name: 'caption', type: 'varchar', length: 100, nullable: false })
  caption: string;

  @Column({ name: 'preview', type: 'varchar', length: 100, nullable: false })
  preview: string;

  @Column({ name: 'view_once', type: 'varchar', length: 100, nullable: false })
  view_once: string;

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
