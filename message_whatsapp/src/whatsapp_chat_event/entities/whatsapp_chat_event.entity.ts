import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
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
@Index('UQ_whatsapp_chat_event_chat_event_id', ['chat_event_id'], {
  unique: true,
})
export class WhatsappChatEvent {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'chat_event_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  chat_event_id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: false })
  chat_id: string;

  @ManyToOne(() => WhatsappChat, (data) => data.chatEvent)
  @JoinColumn({
    name: 'chat_id',
    referencedColumnName: 'chat_id',
  })
  chat: WhatsappChat;

  @Column({ name: 'event_type', type: 'varchar', length: 100, nullable: false })
  event_type: string;

  @Column({ name: 'value', type: 'varchar', length: 100, nullable: false })
  value: string;

  @Column({ name: 'timestamp', type: 'varchar', length: 100, nullable: false })
  timestamp: string;

  @Column({
    name: 'raw_payload',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
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
