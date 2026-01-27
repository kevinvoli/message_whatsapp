import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('queue_positions')
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
