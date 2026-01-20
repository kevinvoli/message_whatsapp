import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToOne,
  JoinColumn,
} from 'typeorm';

export enum PendingMessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export enum PendingMessageStatus {
  WAITING = 'WAITING',
  DISPATCHED = 'DISPATCHED',
  EXPIRED = 'EXPIRED',
}

export enum MessageSource {
  CLIENT = 'CLIENT',
  SYSTEM = 'SYSTEM',
}


@Entity('pending_messages')
@Index(['conversationId', 'status'])
export class PendingMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @Column('text')
  content: string;

  @Column({
    type: 'enum',
    enum: PendingMessageType,
  })
  type: PendingMessageType;

  @Column({ name: 'media_url', nullable: true })
  mediaUrl?: string;

  @Column({
    type: 'enum',
    enum: PendingMessageStatus,
    default: PendingMessageStatus.WAITING,
  })
  status: PendingMessageStatus;

  @Column({
    type: 'enum',
    enum: MessageSource,
    default: MessageSource.CLIENT,
  })
  source: MessageSource;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;

  @Column({ name: 'message_id', type: 'char', length: 36, nullable: true })
messageId: string;

  // 🔗 Relation One-to-One vers le message réel
  @OneToOne(() => WhatsappMessage, { nullable: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'message_id' })
  message?: WhatsappMessage;
}
