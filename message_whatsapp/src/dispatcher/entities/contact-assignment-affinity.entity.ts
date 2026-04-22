import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AffinityReleaseReason {
  MANUAL = 'MANUAL',
  CAPACITY = 'CAPACITY',
  OFFLINE = 'OFFLINE',
  TIMEOUT = 'TIMEOUT',
  CLOSED = 'CLOSED',
}

@Entity('contact_assignment_affinity')
@Index('IDX_affinity_chat_active', ['chatId', 'isActive'])
@Index('IDX_affinity_poste_active', ['posteId', 'isActive'])
export class ContactAssignmentAffinity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100 })
  chatId: string;

  @Column({ name: 'poste_id', type: 'char', length: 36 })
  posteId: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'conversation_count', type: 'int', default: 1 })
  conversationCount: number;

  @Column({ name: 'last_assigned_at', type: 'timestamp' })
  lastAssignedAt: Date;

  @Column({ name: 'released_at', type: 'timestamp', nullable: true, default: null })
  releasedAt: Date | null;

  @Column({ name: 'release_reason', type: 'varchar', length: 50, nullable: true, default: null })
  releaseReason: AffinityReleaseReason | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
