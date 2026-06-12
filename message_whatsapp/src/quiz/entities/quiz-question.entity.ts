import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuizCategory } from './quiz-category.entity';
import { QuizAnswer } from './quiz-answer.entity';

@Entity({ name: 'quiz_question' })
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => QuizCategory, (c) => c.questions)
  @JoinColumn({ name: 'category_id' })
  category: QuizCategory;

  @Column({ name: 'category_id' })
  categoryId: string;

  @Column({ name: 'text', type: 'text' })
  text: string;

  @Column({ name: 'points', type: 'decimal', precision: 5, scale: 2, default: 1 })
  points: number;

  @Column({ name: 'time_limit_seconds', nullable: true })
  timeLimitSeconds: number | null;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @OneToMany(() => QuizAnswer, (a) => a.question, { eager: false })
  answers: QuizAnswer[];
}
