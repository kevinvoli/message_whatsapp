import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  JoinColumn,
} from 'typeorm';
import { FlowBot } from './flow-bot.entity';
import { FlowNode } from './flow-node.entity';

@Entity('flow_analytics')
@Unique('uk_flow_date', ['flowId', 'periodDate'])
export class FlowAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'flow_id', type: 'varchar', length: 36 })
  flowId: string;

  @Column({ name: 'period_date', type: 'date' })
  periodDate: string;

  @Column({ name: 'sessions_started', type: 'int', default: 0 })
  sessionsStarted: number;

  @Column({ name: 'sessions_completed', type: 'int', default: 0 })
  sessionsCompleted: number;

  @Column({ name: 'sessions_escalated', type: 'int', default: 0 })
  sessionsEscalated: number;

  @Column({ name: 'sessions_expired', type: 'int', default: 0 })
  sessionsExpired: number;

  @Column({ name: 'avg_steps', type: 'float', nullable: true })
  avgSteps: number | null;

  @Column({ name: 'avg_duration_seconds', type: 'float', nullable: true })
  avgDurationSeconds: number | null;

  @ManyToOne(() => FlowBot, (f) => f.analytics)
  @JoinColumn({ name: 'flow_id' })
  flow: FlowBot;
}

@Entity('flow_node_analytics')
@Unique('uk_node_date', ['nodeId', 'periodDate'])
export class FlowNodeAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'node_id', type: 'varchar', length: 36 })
  nodeId: string;

  @Column({ name: 'period_date', type: 'date' })
  periodDate: string;

  @Column({ type: 'int', default: 0 })
  visits: number;

  @Column({ name: 'exits_completed', type: 'int', default: 0 })
  exitsCompleted: number;

  @Column({ name: 'exits_escalated', type: 'int', default: 0 })
  exitsEscalated: number;

  @Column({ name: 'exits_expired', type: 'int', default: 0 })
  exitsExpired: number;

  @Column({ name: 'avg_wait_seconds', type: 'float', nullable: true })
  avgWaitSeconds: number | null;

  @ManyToOne(() => FlowNode)
  @JoinColumn({ name: 'node_id' })
  node: FlowNode;
}
