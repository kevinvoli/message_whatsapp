import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizQuestion } from './quiz-question.entity';

@Entity({ name: 'quiz_answer' })
export class QuizAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => QuizQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: QuizQuestion;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'text', type: 'text' })
  text: string;

  @Column({ name: 'is_correct', type: 'tinyint', default: 0 })
  isCorrect: boolean;

  @Column({ name: 'position', type: 'tinyint', default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
