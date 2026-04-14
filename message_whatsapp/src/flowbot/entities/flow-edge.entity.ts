import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { FlowBot } from './flow-bot.entity';
import { FlowNode } from './flow-node.entity';

@Entity('flow_edge')
export class FlowEdge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'flow_id', type: 'varchar', length: 36 })
  flowId: string;

  @Column({ name: 'source_node_id', type: 'varchar', length: 36 })
  sourceNodeId: string;

  @Column({ name: 'target_node_id', type: 'varchar', length: 36 })
  targetNodeId: string;

  @Column({ name: 'condition_type', type: 'varchar', length: 50, default: 'always' })
  conditionType: string;

  @Column({ name: 'condition_value', type: 'varchar', length: 500, nullable: true })
  conditionValue: string | null;

  @Column({ name: 'condition_negate', type: 'boolean', default: false })
  conditionNegate: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @ManyToOne(() => FlowBot, (f) => f.edges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flow_id' })
  flow: FlowBot;

  @ManyToOne(() => FlowNode, (n) => n.outgoingEdges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_node_id' })
  sourceNode: FlowNode;

  @ManyToOne(() => FlowNode, (n) => n.incomingEdges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_node_id' })
  targetNode: FlowNode;
}
