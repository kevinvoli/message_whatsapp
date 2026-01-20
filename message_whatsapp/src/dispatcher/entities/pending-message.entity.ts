import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
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

  // 🔗 Conversation concernée
  @Column({ name: 'conversation_id' })
  conversationId: string;

  // 🧠 Contenu
  @Column('text')
  content: string;

  // 📦 Type de message
  @Column({
    type: 'enum',
    enum: PendingMessageType,
  })
  type: PendingMessageType;

  // 🖼️ Média éventuel
  @Column({ name: 'media_url', nullable: true })
  mediaUrl?: string;

  // 📌 Statut dans la file
  @Column({
    type: 'enum',
    enum: PendingMessageStatus,
    default: PendingMessageStatus.WAITING,
  })
  status: PendingMessageStatus;

  // 📥 Source du message
  @Column({
    type: 'enum',
    enum: MessageSource,
    default: MessageSource.CLIENT,
  })
  source: MessageSource;

  // ⏱️ Date de réception
  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;
}
