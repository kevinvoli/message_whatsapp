import { WhatsappChatEvent } from 'src/whatsapp_chat_event/entities/whatsapp_chat_event.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index('UQ_whatsapp_chat_chat_id', ['chat_id'], { unique: true }) 
export class WhatsappChat {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: false, unique: true })
  chat_id: string; // chat_id WHAPI

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'type', type: 'varchar', length: 100, nullable: false })
  type: string; // private | group | newsletter

  @Column({ name: 'chat_pic', type: 'varchar', length: 100, nullable: false })
  chat_pic: string;

  @Column({
    name: 'chat_pic_full',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  chat_pic_full: string;

  @Column({ name: 'is_pinned', type: 'varchar', length: 100, nullable: false })
  is_pinned: string;

  @Column({ name: 'is_muted', type: 'varchar', length: 100, nullable: false })
  is_muted: string;

  @Column({ name: 'mute_until', type: 'varchar', length: 100, nullable: false })
  mute_until: string;

  @Column({ name: 'is_archived', type: 'varchar', length: 100, nullable: false })
  is_archived: string;

  @Column({
    name: 'unread_count',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  unread_count: string;

  @Column({
    name: 'unread_mention',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  unread_mention: string;

  @Column({ name: 'read_only', type: 'varchar', length: 100, nullable: false })
  read_only: string;

  @Column({ name: 'not_spam', type: 'varchar', length: 100, nullable: false })
  not_spam: string;

  @Column({
    name: 'last_activity_at',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  last_activity_at: string; // timestamp

  @Column({ name: 'created_at', type: 'varchar', length: 100, nullable: false })
  created_at: string;

  @Column({ name: 'updated_at', type: 'varchar', length: 100, nullable: false })
  updated_at: string;

  @OneToMany(() => WhatsappChatLabel, (data) => data.chat)
    chatLabel: WhatsappChatLabel[];

     @OneToMany(() => WhatsappConversation, (data) => data.chat)
    conversation: WhatsappConversation[];

     @OneToMany(() => WhatsappChatEvent, (data) => data.chat)
    chatEvent: WhatsappChatEvent[];

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
