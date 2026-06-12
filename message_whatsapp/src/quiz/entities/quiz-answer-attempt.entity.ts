import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'quiz_answer_attempt' })
@Unique(['attemptId', 'questionId'])
export class QuizAnswerAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'attempt_id' })
  attemptId: string;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'answer_id', nullable: true })
  answerId: string | null;

  @Column({ name: 'is_correct', type: 'tinyint', default: 0 })
  isCorrect: boolean;

  @Column({ name: 'points_earned', type: 'decimal', precision: 5, scale: 2, default: 0 })
  pointsEarned: number;

  @Column({ name: 'answered_at', type: 'datetime', nullable: true })
  answeredAt: Date | null;

  @Column({ name: 'timed_out', type: 'tinyint', default: 0 })
  timedOut: boolean;
}
