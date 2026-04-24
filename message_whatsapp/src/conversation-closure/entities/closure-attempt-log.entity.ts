import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('closure_attempt_log')
@Index('IDX_closure_log_chat_id', ['chatId'])
export class ClosureAttemptLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100 })
  chatId: string;

  @Column({ name: 'commercial_id', type: 'char', length: 36, nullable: true })
  commercialId: string | null;

  @Column({ name: 'blockers', type: 'json', nullable: true })
  blockers: object | null;

  @Column({ name: 'was_blocked', type: 'tinyint', width: 1, default: 1 })
  wasBlocked: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
