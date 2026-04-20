import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'commercial_session' })
@Index('IDX_session_commercial_id', ['commercial_id'])
@Index('IDX_session_connected_at', ['connected_at'])
export class CommercialSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'char', length: 36 })
  commercial_id: string;

  @Column({ name: 'commercial_name', type: 'varchar', length: 200, nullable: true })
  commercial_name?: string | null;

  @Column({ name: 'connected_at', type: 'timestamp' })
  connected_at: Date;

  @Column({ name: 'disconnected_at', type: 'timestamp', nullable: true })
  disconnected_at?: Date | null;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  duration_seconds?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
