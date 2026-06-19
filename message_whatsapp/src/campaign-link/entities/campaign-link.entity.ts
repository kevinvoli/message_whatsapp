import { WhapiChannel } from 'src/channel/entities/channel.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CampaignLinkClick } from './campaign-link-click.entity';
import { MediaAsset } from 'src/media-asset/entities/media-asset.entity';

@Entity({ name: 'campaign_link' })
@Index('UQ_campaign_link_short_code', ['shortCode'], { unique: true })
export class CampaignLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 100 })
  channelId: string;

  @ManyToOne(() => WhapiChannel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'channel_id', referencedColumnName: 'channel_id' })
  channel: WhapiChannel;

  @Column({ name: 'predefined_message', type: 'text' })
  predefinedMessage: string;

  @Column({ name: 'short_code', type: 'varchar', length: 16, unique: true })
  shortCode: string;

  @Column({ name: 'direct_url', type: 'text' })
  directUrl: string;

  @Column({ name: 'tracked_url', type: 'text' })
  trackedUrl: string;

  @Column({ name: 'click_count', type: 'int', default: 0 })
  clickCount: number;

  @Column({ name: 'conversion_count', type: 'int', default: 0 })
  conversionCount: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'media_asset_id', type: 'varchar', length: 36, nullable: true })
  mediaAssetId: string | null;

  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset: MediaAsset | null;

  @OneToMany(() => CampaignLinkClick, (click) => click.campaignLink)
  clicks: CampaignLinkClick[];

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
