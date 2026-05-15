import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CampaignLink } from './campaign-link.entity';

@Entity({ name: 'campaign_link_click' })
@Index('IDX_click_link_date', ['campaignLinkId', 'clickedAt'])
export class CampaignLinkClick {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_link_id', type: 'char', length: 36 })
  campaignLinkId: string;

  @ManyToOne(() => CampaignLink, (link) => link.clicks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_link_id' })
  campaignLink: CampaignLink;

  @CreateDateColumn({ name: 'clicked_at' })
  clickedAt: Date;

  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true, default: null })
  ipHash: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true, default: null })
  userAgent: string | null;

  @Column({ name: 'device_type', type: 'varchar', length: 16, nullable: true, default: null })
  deviceType: string | null;

  @Column({ name: 'converted', type: 'boolean', default: false })
  converted: boolean;

  @Column({ name: 'converted_at', type: 'timestamp', nullable: true, default: null })
  convertedAt: Date | null;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: true, default: null })
  chatId: string | null;
}
