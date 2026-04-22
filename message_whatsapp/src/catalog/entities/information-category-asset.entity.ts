import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AssetCategory {
  PRODUIT     = 'produit',
  SERVICE     = 'service',
  PROMO       = 'promo',
  INFO        = 'info',
}

export enum AssetMediaType {
  IMAGE    = 'image',
  VIDEO    = 'video',
  DOCUMENT = 'document',
  AUDIO    = 'audio',
}

@Entity('information_category_asset')
@Index('IDX_asset_category_active', ['category', 'isActive'])
export class InformationCategoryAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'category', type: 'enum', enum: AssetCategory })
  category: AssetCategory;

  @Column({ name: 'media_type', type: 'enum', enum: AssetMediaType })
  mediaType: AssetMediaType;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'media_url', type: 'varchar', length: 1000 })
  mediaUrl: string;

  @Column({ name: 'text_template', type: 'text', nullable: true })
  textTemplate: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
