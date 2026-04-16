import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Label } from './label.entity';

/**
 * P3.3 — Table d'assignation : lien entre une conversation (chat_id) et un label.
 * On garde `chat_id` varchar pour ne pas créer de FK vers WhatsappChat
 * (évite les cascades problématiques en cas de merge/archivage).
 */
@Entity({ name: 'chat_label_assignment' })
@Index('IDX_cla_chat_id', ['chat_id'])
@Index('IDX_cla_label_id', ['label_id'])
@Index('UQ_cla_chat_label', ['chat_id', 'label_id'], { unique: true })
export class ChatLabelAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  chat_id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  label_id: string;

  @ManyToOne(() => Label, (l) => l.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'label_id' })
  label: Label;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
