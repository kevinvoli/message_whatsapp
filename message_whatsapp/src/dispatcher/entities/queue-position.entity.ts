import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { WhatsappCommercial } from '../../users/entities/user.entity';

@Entity('queue_positions')
export class QueuePosition {
   @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  position: number;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => WhatsappCommercial)
  @JoinColumn({ name: 'user_id' })
  user: WhatsappCommercial;
}
