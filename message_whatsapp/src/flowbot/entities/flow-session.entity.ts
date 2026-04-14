import {
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { BotConversation } from './bot-conversation.entity';
import { FlowBot } from './flow-bot.entity';
import { FlowNode } from './flow-node.entity';
import { FlowSessionLog } from './flow-session-log.entity';
import { BotMessage } from './bot-message.entity';

export enum FlowSessionStatus {
  ACTIVE = 'active',
  WAITING_REPLY = 'waiting_reply',
  WAITING_DELAY = 'waiting_delay',
  COMPLETED = 'completed',
  ESCALATED = 'escalated',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('flow_session')
export class FlowSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'varchar', length: 36 })
  conversationId: string;

  @Column({ name: 'flow_id', type: 'varchar', length: 36 })
  flowId: string;

  @Column({ name: 'current_node_id', type: 'varchar', length: 36, nullable: true })
  currentNodeId: string | null;

  @Index('idx_session_conv_status')
  @Column({
    type: 'enum',
    enum: FlowSessionStatus,
    default: FlowSessionStatus.ACTIVE,
  })
  status: FlowSessionStatus;

  @Column({ type: 'json', default: '{}' })
  variables: Record<string, unknown>;

  @Column({ name: 'steps_count', type: 'int', default: 0 })
  stepsCount: number;

  @Column({ name: 'trigger_type', type: 'varchar', length: 50, nullable: true })
  triggerType: string | null;

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'last_activity_at', type: 'datetime', nullable: true })
  lastActivityAt: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'escalated_at', type: 'datetime', nullable: true })
  escalatedAt: Date | null;

  @ManyToOne(() => BotConversation, (c) => c.sessions)
  @JoinColumn({ name: 'conversation_id' })
  conversation: BotConversation;

  @ManyToOne(() => FlowBot, (f) => f.sessions)
  @JoinColumn({ name: 'flow_id' })
  flow: FlowBot;

  @ManyToOne(() => FlowNode, { nullable: true })
  @JoinColumn({ name: 'current_node_id' })
  currentNode: FlowNode | null;

  @OneToMany(() => FlowSessionLog, (l) => l.session)
  logs: FlowSessionLog[];

  @OneToMany(() => BotMessage, (m) => m.session)
  messages: BotMessage[];
}
