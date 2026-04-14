import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { FlowSession } from './flow-session.entity';

export enum BotConversationStatus {
  IDLE = 'idle',
  BOT_ACTIVE = 'bot_active',
  WAITING = 'waiting',
  ESCALATED = 'escalated',
  COMPLETED = 'completed',
}

@Entity('bot_conversation')
export class BotConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence souple vers la conversation source — PAS de FK TypeORM */
  @Column({ name: 'chat_ref', type: 'varchar', length: 255, unique: true })
  chatRef: string;

  @Index('idx_bot_conv_status')
  @Column({
    type: 'enum',
    enum: BotConversationStatus,
    default: BotConversationStatus.IDLE,
  })
  status: BotConversationStatus;

  /** ID de la session FlowBot active — référence souple */
  @Index('idx_bot_conv_session')
  @Column({ name: 'active_session_id', type: 'varchar', length: 36, nullable: true })
  activeSessionId: string | null;

  /** Le bot a déjà vu ce contact */
  @Column({ name: 'is_known_contact', type: 'boolean', default: false })
  isKnownContact: boolean;

  /** Conversation rouverte après clôture bot */
  @Column({ name: 'is_reopened', type: 'boolean', default: false })
  isReopened: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => FlowSession, (s) => s.conversation)
  sessions: FlowSession[];
}
