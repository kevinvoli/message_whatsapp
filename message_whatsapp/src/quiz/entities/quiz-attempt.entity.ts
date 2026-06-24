import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'quiz_attempt' })
@Index(['commercialId', 'sessionId', 'attemptNumber'])
export class QuizAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'char', length: 36 })
  commercialId: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({ name: 'attempt_number', type: 'tinyint', default: 1 })
  attemptNumber: number;

  @Column({ name: 'question_order', type: 'json' })
  questionOrder: string[];

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'timed_out', type: 'tinyint', default: 0 })
  timedOut: boolean;

  @Column({ name: 'score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  score: number | null;

  @Column({ name: 'max_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  maxScore: number | null;

  @Column({ name: 'is_passed', type: 'tinyint', nullable: true })
  isPassed: boolean | null;
}
