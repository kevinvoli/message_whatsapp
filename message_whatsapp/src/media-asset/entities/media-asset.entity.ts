import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'media_asset' })
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath: string;

  @Column({ name: 'public_url', type: 'varchar', length: 500 })
  publicUrl: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({
    name: 'media_type',
    type: 'enum',
    enum: ['image', 'video', 'audio', 'document'],
  })
  mediaType: 'image' | 'video' | 'audio' | 'document';

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @Column({ name: 'category', type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ name: 'tags', type: 'json', nullable: true })
  tags: string[] | null;

  @Column({ name: 'color_label', type: 'varchar', length: 7, nullable: true })
  colorLabel: string | null;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
