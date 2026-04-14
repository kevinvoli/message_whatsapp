import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { FlowSession } from './flow-session.entity';

export enum BotMessageContentType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  TEMPLATE = 'template',
}

@Entity('bot_message')
export class BotMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_bot_msg_session')
  @Column({ name: 'session_id', type: 'varchar', length: 36 })
  sessionId: string;

  @Index('idx_bot_msg_node')
  @Column({ name: 'flow_node_id', type: 'varchar', length: 36, nullable: true })
  flowNodeId: string | null;

  @Column({
    name: 'content_type',
    type: 'enum',
    enum: BotMessageContentType,
    default: BotMessageContentType.TEXT,
  })
  contentType: BotMessageContentType;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'media_url', type: 'varchar', length: 500, nullable: true })
  mediaUrl: string | null;

  /** Référence souple vers l'ID message dans le provider */
  @Column({ name: 'external_msg_ref', type: 'varchar', length: 255, nullable: true })
  externalMsgRef: string | null;

  @Column({ name: 'sent_at', type: 'datetime' })
  sentAt: Date;

  @ManyToOne(() => FlowSession, (s) => s.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: FlowSession;
}
