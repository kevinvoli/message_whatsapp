import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
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

  @Column({ name: 'channel_id', type: 'varchar', length: 36, nullable: false })
  channelId: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'language', type: 'varchar', length: 10, nullable: false, default: 'fr' })
  language: string;

  @Column({ name: 'category', type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ name: 'status', type: 'enum', enum: WhatsappTemplateStatus, default: WhatsappTemplateStatus.PENDING, nullable: false })
  status: WhatsappTemplateStatus;

  @Column({ name: 'components', type: 'json', nullable: true })
  components: any | null;

  @Column({ name: 'external_id', type: 'varchar', length: 191, nullable: true })
  externalId: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true })
  rejectionReason: string | null;

  @ManyToOne(() => WhapiChannel, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id', referencedColumnName: 'id' })
  channel: WhapiChannel;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
