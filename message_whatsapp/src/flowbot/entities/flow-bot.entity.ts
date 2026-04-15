import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FlowTrigger } from './flow-trigger.entity';
import { FlowNode } from './flow-node.entity';
import { FlowEdge } from './flow-edge.entity';
import { FlowSession } from './flow-session.entity';
import { FlowAnalytics } from './flow-analytics.entity';

@Entity('flow_bot')
export class FlowBot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  /** null = tous les types de canaux */
  @Column({ name: 'scope_channel_type', type: 'varchar', length: 50, nullable: true })
  scopeChannelType: string | null;

  /** null = tous les providers */
  @Column({ name: 'scope_provider_ref', type: 'varchar', length: 36, nullable: true })
  scopeProviderRef: string | null;

  /**
   * CTX-D1 — Optionnel : restreindre ce flux à un contexte spécifique.
   * null = ce flux peut s'exécuter dans n'importe quel contexte.
   */
  @Column({ name: 'scope_context_id', type: 'char', length: 36, nullable: true })
  scopeContextId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => FlowTrigger, (t) => t.flow, { cascade: true })
  triggers: FlowTrigger[];

  @OneToMany(() => FlowNode, (n) => n.flow, { cascade: true })
  nodes: FlowNode[];

  @OneToMany(() => FlowEdge, (e) => e.flow, { cascade: true })
  edges: FlowEdge[];

  @OneToMany(() => FlowSession, (s) => s.flow)
  sessions: FlowSession[];

  @OneToMany(() => FlowAnalytics, (a) => a.flow)
  analytics: FlowAnalytics[];
}
