import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tag } from './tag.entity';

@Entity('chat_tag')
@Index('IDX_chat_tag_chat_id', ['chat_id'])
@Index('UQ_chat_tag', ['chat_id', 'tag_id'], { unique: true })
export class ChatTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  chat_id: string;

  @Column({ type: 'char', length: 36 })
  tag_id: string;

  @Column({ type: 'char', length: 36, nullable: true })
  tenant_id?: string | null;

  @ManyToOne(() => Tag, (tag) => tag.chatTags, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp' })
  createdAt: Date;
}
