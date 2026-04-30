import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

export enum WhatsappTemplateStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity({ name: 'whatsapp_template' })
@Index('IDX_whatsapp_template_channel_id', ['channelId'])
@Index('IDX_whatsapp_template_channel_status', ['channelId', 'status'])
export class WhatsappTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'char', length: 36, nullable: false })
  channelId: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'language', type: 'varchar', length: 10, default: 'fr' })
  language: string;

  @Column({ name: 'category', type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: WhatsappTemplateStatus,
    default: WhatsappTemplateStatus.PENDING,
  })
  status: WhatsappTemplateStatus;

  @Column({ name: 'components', type: 'json', nullable: true })
  components: any | null;

  @Column({ name: 'external_id', type: 'varchar', length: 191, nullable: true })
  externalId: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => WhapiChannel, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id', referencedColumnName: 'id' })
  channel: WhapiChannel;
}
