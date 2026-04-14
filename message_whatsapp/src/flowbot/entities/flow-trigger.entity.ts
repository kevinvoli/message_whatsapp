import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { FlowBot } from './flow-bot.entity';

export enum FlowTriggerType {
  INBOUND_MESSAGE = 'INBOUND_MESSAGE',
  CONVERSATION_OPEN = 'CONVERSATION_OPEN',
  CONVERSATION_REOPEN = 'CONVERSATION_REOPEN',
  OUT_OF_HOURS = 'OUT_OF_HOURS',
  ON_ASSIGN = 'ON_ASSIGN',
  QUEUE_WAIT = 'QUEUE_WAIT',
  NO_RESPONSE = 'NO_RESPONSE',
  INACTIVITY = 'INACTIVITY',
  KEYWORD = 'KEYWORD',
  SCHEDULE = 'SCHEDULE',
}

@Entity('flow_trigger')
export class FlowTrigger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'flow_id', type: 'varchar', length: 36 })
  flowId: string;

  @Column({
    name: 'trigger_type',
    type: 'enum',
    enum: FlowTriggerType,
  })
  triggerType: FlowTriggerType;

  @Column({ type: 'json', default: '{}' })
  config: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => FlowBot, (f) => f.triggers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flow_id' })
  flow: FlowBot;
}
