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

  @OneToMany(() => CampaignLinkClick, (click) => click.campaignLink)
  clicks: CampaignLinkClick[];

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
