import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCustomer } from 'src/whatsapp_customer/entities/whatsapp_customer.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index('UQ_whatsapp_conversation_conversation_id', ['conversation_id'], { unique: true })
export class WhatsappConversation {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;
  @Column({
    name: 'conversation_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true
  })
  conversation_id: string;

  @Column({ name: 'customer_id', type: 'varchar', length: 100, nullable: false })
  customer_id: string;

  @ManyToOne(() => WhatsappCustomer, (data) => data.conversation)
  @JoinColumn({
    name: 'customer_id',
    referencedColumnName: 'customer_id',
  })
  customer: WhatsappCustomer;

  @Column({
    name: 'assigned_agent_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  assigned_agent_id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: false })
  chat_id: string;

  @ManyToOne(() => WhatsappChat, (data) => data.conversation)
  @JoinColumn({
    name: 'chat_id',
    referencedColumnName: 'chat_id',
  })
  chat: WhatsappChat;

  @OneToMany(() => WhatsappMessage, (agent) => agent.conversation)
  message: WhatsappMessage[];

  @Column({ name: 'status', type: 'varchar', length: 100, nullable: false })
  status: 'open' | 'close';

  @Column({ name: 'unread_count', type: 'int', default: 0 })
  unreadCount: number;

  @Column({
    name: 'started_at',
    type: 'timestamp',
    nullable: false,
  })
  started_at: Date;

  @Column({ name: 'closed_at', type: 'varchar', length: 100, nullable: false })
  closed_at: Date;


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
