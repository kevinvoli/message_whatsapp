import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MessageAuto } from './message-auto.entity';

export enum KeywordMatchType {
  EXACT       = 'exact',
  CONTAINS    = 'contains',
  STARTS_WITH = 'starts_with',
}

@Entity({ name: 'auto_message_keyword', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class AutoMessageKeyword {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  keyword: string;

  @Column({
    name: 'match_type',
    type: 'enum',
    enum: KeywordMatchType,
    default: KeywordMatchType.CONTAINS,
  })
  matchType: KeywordMatchType;

  @Column({ name: 'case_sensitive', type: 'boolean', default: false })
  caseSensitive: boolean;

  @Column({ name: 'message_auto_id', type: 'char', length: 36, nullable: false })
  messageAutoId: string;

  @ManyToOne(() => MessageAuto, (m) => m.keywords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_auto_id' })
  messageAuto: MessageAuto;

  @Column({ type: 'boolean', default: true })
  actif: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
