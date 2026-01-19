import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
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

export enum WhatsappChatStatus {
  ACTIF = 'actif',
  EN_ATTENTE = 'en attente',
  FERME = 'fermé',
}

@Entity()
@Index('UQ_whatsapp_chat_chat_id', ['chat_id'], { unique: true })
export class WhatsappChat {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'commercial_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  commercial_id: string | null;

  @ManyToOne(() => WhatsappCommercial, (data) => data.chats)
  @JoinColumn({
    name: 'commercial_id',
    referencedColumnName: 'id',
  })
  commercial: WhatsappCommercial;
  

  @Column({
    name: 'chat_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  chat_id: string; // chat_id WHAPI

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

   @Column({
    type: 'enum',
    enum: WhatsappChatStatus,
    default: WhatsappChatStatus.EN_ATTENTE,
  })
  status: WhatsappChatStatus;

  @Column({ name: 'type', type: 'varchar', length: 100, nullable: false })
  type: string; // private | group | newsletter

  @Column({ name: 'chat_pic', type: 'varchar', length: 100, nullable: false ,default: 'default.png'})
  chat_pic: string;

  @Column({
    name: 'chat_pic_full',
    type: 'varchar',
    length: 100,
    nullable: false,
    default: 'default.png'
  })
  chat_pic_full: string;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  is_pinned: boolean;

  @Column({ name: 'is_muted', type: 'boolean', default: false })
  is_muted: boolean;

  @Column({ name: 'mute_until', type: 'timestamp', nullable: true })
  mute_until: Date | null;

  @Column({
    name: 'is_archived',
    type: 'boolean',
    default: false,
  })
  is_archived: boolean;

  @Column({
    name: 'unread_count',
    type: 'int',
    default: 0,
    comment: 'Number of unread messages in the chat',
  })
  unread_count: number;

  @Column({
    name: 'unread_mention',
    type: 'boolean',
    default: false,
  })
  unread_mention: boolean;

  @Column({ name: 'read_only', type: 'boolean', default: false })
  read_only: boolean;

  @Column({ name: 'not_spam', type: 'boolean', default: true })
  not_spam: boolean;

  @Column({
    name: 'last_activity_at',
    type: 'timestamp',
    nullable: true,
  })
  last_activity_at: Date; // timestamp

  @Column({ name: 'contact_client', type: 'varchar', length: 100, nullable: false })
  contact_client: string;

  @OneToMany(() => WhatsappChatLabel, (data) => data.chat)
  chatLabel: WhatsappChatLabel[];


  @OneToMany(() => WhatsappMessage, (message) => message.chat)
  messages: WhatsappMessage[];

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
