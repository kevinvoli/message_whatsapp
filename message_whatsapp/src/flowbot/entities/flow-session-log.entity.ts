import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { FlowSession } from './flow-session.entity';

@Entity('flow_session_log')
export class FlowSessionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_session_log_session')
  @Column({ name: 'session_id', type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ name: 'node_id', type: 'varchar', length: 36, nullable: true })
  nodeId: string | null;

  @Column({ name: 'node_type', type: 'varchar', length: 50, nullable: true })
  nodeType: string | null;

  @Column({ name: 'edge_taken_id', type: 'varchar', length: 36, nullable: true })
  edgeTakenId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  action: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  result: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'executed_at', type: 'datetime' })
  executedAt: Date;

  @ManyToOne(() => FlowSession, (s) => s.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: FlowSession;
}
