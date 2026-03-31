import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('queue_positions')
// UNIQUE sur poste_id : un poste ne peut être en queue qu'une seule fois
@Index('UQ_queue_positions_poste_id', ['poste_id'], { unique: true })
// tri ORDER BY position ASC pour getNextInQueue()
@Index('IDX_queue_positions_position', ['position'])
export class QueuePosition {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'poste_id' })
  poste_id: string;

  @Column()
  position: number;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => WhatsappPoste)
  @JoinColumn({ name: 'poste_id' })
  poste: WhatsappPoste;
}
