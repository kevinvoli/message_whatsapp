import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { FlowBot } from './flow-bot.entity';
import { FlowEdge } from './flow-edge.entity';

export enum FlowNodeType {
  MESSAGE = 'MESSAGE',
  QUESTION = 'QUESTION',
  CONDITION = 'CONDITION',
  ACTION = 'ACTION',
  WAIT = 'WAIT',
  ESCALATE = 'ESCALATE',
  END = 'END',
  AB_TEST = 'AB_TEST',
}

@Entity('flow_node')
export class FlowNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'flow_id', type: 'varchar', length: 36 })
  flowId: string;

  @Column({ type: 'enum', enum: FlowNodeType })
  type: FlowNodeType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ name: 'position_x', type: 'float', nullable: true })
  positionX: number | null;

  @Column({ name: 'position_y', type: 'float', nullable: true })
  positionY: number | null;

  @Column({ type: 'json', default: '{}' })
  config: Record<string, unknown>;

  @Column({ name: 'timeout_seconds', type: 'int', nullable: true })
  timeoutSeconds: number | null;

  @Column({ name: 'is_entry_point', type: 'boolean', default: false })
  isEntryPoint: boolean;

  @ManyToOne(() => FlowBot, (f) => f.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flow_id' })
  flow: FlowBot;

  @OneToMany(() => FlowEdge, (e) => e.sourceNode)
  outgoingEdges: FlowEdge[];

  @OneToMany(() => FlowEdge, (e) => e.targetNode)
  incomingEdges: FlowEdge[];
}
