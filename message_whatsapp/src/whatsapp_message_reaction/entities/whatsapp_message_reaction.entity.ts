import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index(
  'UQ_whatsapp_message_reaction_message_reaction_id',
  ['message_reaction'],
  { unique: true },
)
export class WhatsappMessageReaction {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'message_reaction',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  message_reaction: string;

  @Column({ name: 'message_id', type: 'varchar', length: 100, nullable: false })
  message_id: string;

  @ManyToOne(() => WhatsappMessage, (message) => message.reaction)
  @JoinColumn({ name: 'message_id', referencedColumnName: 'message_id' })
  message: WhatsappMessage;

  @Column({ name: 'emoji', type: 'varchar', length: 100, nullable: false })
  emoji: string;

  @Column({ name: 'author', type: 'varchar', length: 100, nullable: false })
  author: string;

  @Column({ name: 'count', type: 'varchar', length: 100, nullable: false })
  count: string;
  @Column({ name: 'unread', type: 'varchar', length: 100, nullable: false })
  unread: string;

  @Column({ name: 'reacted_at', type: 'varchar', length: 100, nullable: false })
  reacted_at: string;

  @CreateDateColumn({
    name: 'createdAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was created',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updatedAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was last updated',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    name: 'deletedAt',
    type: 'timestamp',
    nullable: true,
    comment: 'Timestamp when the trajet was deleted',
  })
  deletedAt: Date | null;
}
