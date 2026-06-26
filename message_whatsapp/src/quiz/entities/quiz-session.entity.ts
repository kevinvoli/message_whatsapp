import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuizSessionQuestion } from './quiz-session-question.entity';

@Entity({ name: 'quiz_session' })
export class QuizSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title', length: 200 })
  title: string;

  @Column({ name: 'session_date', type: 'date', unique: true })
  sessionDate: string;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: boolean;

  @Column({ name: 'passing_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  passingScore: number | null;

  @Column({ name: 'max_attempts', type: 'tinyint', default: 1 })
  maxAttempts: number;

  @Column({ name: 'require_pass', type: 'tinyint', width: 1, default: 0 })
  requirePass: boolean;

  @Column({ name: 'history_visible', type: 'tinyint', width: 1, default: 1 })
  historyVisible: boolean;

  @Column({ name: 'total_time_minutes', type: 'int', nullable: true })
  totalTimeMinutes: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @OneToMany(() => QuizSessionQuestion, (sq) => sq.session, { eager: false })
  sessionQuestions: QuizSessionQuestion[];
}
