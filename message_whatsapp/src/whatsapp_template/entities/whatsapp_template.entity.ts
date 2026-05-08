import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

export enum WhatsappTemplateStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('whatsapp_template')
export class WhatsappTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_whatsapp_template_channel_id')
  @Column({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  language: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Index('IDX_whatsapp_template_channel_status')
  @Column({ type: 'enum', enum: WhatsappTemplateStatus, default: WhatsappTemplateStatus.PENDING })
  status: WhatsappTemplateStatus;

  @Column({ type: 'json', nullable: true })
  components: any | null;

  @Column({ name: 'external_id', type: 'varchar', length: 191, nullable: true })
  externalId: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => WhapiChannel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'channel_id', referencedColumnName: 'id' })
  channel: WhapiChannel | null;
}
