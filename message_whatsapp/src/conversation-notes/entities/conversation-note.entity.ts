import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'conversation_notes', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('IDX_notes_chat', ['chatId'])
export class ConversationNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100 })
  chatId: string;

  @Column({ name: 'author_id', type: 'char', length: 36 })
  authorId: string;

  @Column({ name: 'author_name', type: 'varchar', length: 128, nullable: true })
  authorName?: string | null;

  /** 'commercial' | 'admin' */
  @Column({ name: 'author_type', type: 'enum', enum: ['commercial', 'admin'] })
  authorType: 'commercial' | 'admin';

  @Column({ name: 'content', type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deletedAt', nullable: true })
  deletedAt?: Date | null;
}
