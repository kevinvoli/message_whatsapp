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
  'UQ_whatsapp_message_context_message_context_id',
  ['message_context_id'],
  { unique: true },
)
export class WhatsappMessageContext {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'message_context_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  message_context_id: string;

  @Column({ name: 'message_id', type: 'varchar', length: 100, nullable: false })
  message_id: string;

  @ManyToOne(() => WhatsappMessage, (message) => message.messagecontext)
  @JoinColumn({ name: 'message_id', referencedColumnName: 'message_id' })
  message: WhatsappMessage;

  @Column({ name: 'forwarded', type: 'varchar', length: 100, nullable: false })
  forwarded: string;

  @Column({
    name: 'forwarding_score',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  forwarding_score: string;

  @Column({
    name: 'quoted_message_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  quoted_message_id: string;

  @Column({
    name: 'quoted_author',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  quoted_author: string;

  @Column({
    name: 'ephemeral_duration',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  ephemeral_duration: string;

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
