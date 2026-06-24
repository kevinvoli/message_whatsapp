import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

@Entity('window_reminder_log')
export class WindowReminderLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'char', length: 36 })
  sessionId: string;

  @Column({ name: 'attempt_number', type: 'int' })
  attemptNumber: number;

  @Column({ name: 'sent_at', type: 'datetime' })
  sentAt: Date;

  @Column({ name: 'client_responded_at', type: 'datetime', nullable: true, default: null })
  clientRespondedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ChatSession)
  @JoinColumn({ name: 'session_id' })
  session: ChatSession;
}
