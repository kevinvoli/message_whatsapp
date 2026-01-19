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
@Index('UQ_whatsapp_chat_label_chat_label_id', ['chat_label_id'], { unique: true })
export class WhatsappChatLabel {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'chat_label_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  chat_label_id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: false })
  chat_id: string;

  @ManyToOne(() => WhatsappChat, (data) => data.chatLabel)
  @JoinColumn({
    name: 'chat_id',
    referencedColumnName: 'chat_id',
  })
  chat: WhatsappChat;

  @Column({
    name: 'label_external_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  label_external_id?: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'color', type: 'varchar', length: 100, nullable: false })
  color: string;

  @Column({ name: 'count', type: 'varchar', length: 100, nullable: false })
  count: string;

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
