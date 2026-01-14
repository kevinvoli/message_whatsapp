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
@Index('UQ_whatsapp_message_event_message_event_id', ['message_event_id'], {
  unique: true,
})
export class WhatsappMessageEvent {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'message_event_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  message_event_id: string;

  @Column({ name: 'message_id', type: 'varchar', length: 100, nullable: false })
  message_id: string;

  @ManyToOne(() => WhatsappMessage, (message) => message.event)
  @JoinColumn({ name: 'message_id', referencedColumnName: 'message_id' })
  message: WhatsappMessage;

  @Column({ name: 'event_type', type: 'varchar', length: 100, nullable: false })
  event_type: 'edited' | 'reaction' | 'status' | 'poll_vote' | 'system';

  @Column({ name: 'created_at', type: 'varchar', length: 100, nullable: false })
  created_at: string;

  @Column({ name: 'raw_payload', type: 'json', nullable: false })
  raw_payload: string;

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
