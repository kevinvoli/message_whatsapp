import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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
    nullable: false,
    unique: true,
  })
  message_content_id: string;

  @Column({ name: 'media_type', type: 'varchar', length: 100, nullable: false })
  media_type: 'image' | 'video' | 'audio' | 'document' | 'gif' | 'voice';

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
