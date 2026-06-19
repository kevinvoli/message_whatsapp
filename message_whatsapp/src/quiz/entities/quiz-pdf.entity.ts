import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizSession } from './quiz-session.entity';

@Entity({ name: 'quiz_pdf' })
export class QuizPdf {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => QuizSession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session: QuizSession | null;

  @Column({ name: 'session_id', type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'storage_path', length: 500 })
  storagePath: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @Column({ name: 'allow_inline_view', type: 'tinyint', default: 0 })
  allowInlineView: boolean;

  @Column({ name: 'is_permanent', type: 'tinyint', default: 1 })
  isPermanent: boolean;

  @Column({ name: 'available_from', type: 'date', nullable: true })
  availableFrom: string | null;

  @Column({ name: 'available_until', type: 'date', nullable: true })
  availableUntil: string | null;

  @Column({ name: 'uploaded_at', type: 'datetime' })
  uploadedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
