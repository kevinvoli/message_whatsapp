import {
  Column, CreateDateColumn, Entity, Index,
  JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { WhatsappCommercial } from '../../whatsapp_commercial/entities/user.entity';
import { WhatsappPoste } from '../../whatsapp_poste/entities/whatsapp_poste.entity';

@Entity('commercial_planning')
@Unique(['commercialId', 'date'])
@Index(['date'])
@Index(['type', 'date'])
export class CommercialPlanning {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id' })
  commercialId: string;

  @ManyToOne(() => WhatsappCommercial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commercial_id' })
  commercial?: WhatsappCommercial;

  @Column({ type: 'enum', enum: ['absence', 'exceptional'] })
  type: 'absence' | 'exceptional';

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'linked_commercial_id', type: 'varchar', length: 36, nullable: true, default: null })
  linkedCommercialId?: string | null;

  @ManyToOne(() => WhatsappCommercial, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linked_commercial_id' })
  linkedCommercial?: WhatsappCommercial | null;

  @Column({ name: 'override_poste_id', type: 'varchar', length: 36, nullable: true, default: null })
  overridePosteId?: string | null;

  @ManyToOne(() => WhatsappPoste, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'override_poste_id' })
  overridePoste?: WhatsappPoste | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  reason?: string | null;

  @Column({ name: 'declared_by', type: 'varchar', length: 100, nullable: true, default: null })
  declaredBy?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
