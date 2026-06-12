import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { QuizSession } from './quiz-session.entity';
import { QuizQuestion } from './quiz-question.entity';

@Entity({ name: 'quiz_session_question' })
@Unique(['sessionId', 'questionId'])
export class QuizSessionQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => QuizSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: QuizSession;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => QuizQuestion)
  @JoinColumn({ name: 'question_id' })
  question: QuizQuestion;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'position', type: 'smallint', default: 0 })
  position: number;
}
