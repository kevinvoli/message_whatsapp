import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import {
  BeforeInsert,
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
  // Add this import
} from 'typeorm';

export enum MessageDirection {
  IN = 'IN',
  OUT = 'OUT',
}
export enum WhatsappMessageStatus {
  FAILED = 'failed',
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  PLAYED = 'played',
  DELETED = 'deleted',
}

@Entity()
@Index('UQ_whatsapp_message_message_id', ['message_id'], { unique: true })
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'message_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  message_id: string | null;

  @Column({
    name: 'external_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  external_id?: string;

  @Column({
    name: 'chat_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  chat_id: string;

  @Column({
    name: 'channel_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  channel_id: string;

  @ManyToOne(() => WhapiChannel, (data) => data.messages)
  @JoinColumn({
    name: 'channel_id',
    referencedColumnName: 'channel_id',
  })
  channel: WhapiChannel;

  @Column({
    name: 'type',
    type: 'varchar',
    length: 100,
    nullable: false,
    default: 'text',
  })
  type: string;

  @ManyToOne(() => WhatsappChat, (data) => data.messages)
  @JoinColumn({
    name: 'chat_id',
    referencedColumnName: 'chat_id',
  })
  chat: WhatsappChat;

  @Column({
    name: 'poste_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  poste_id: string | null;

  @Column({
    name: 'longtext',
    type: 'varchar',
    nullable: true,
  })
  text: string | null;

  @ManyToOne(() => WhatsappPoste, (data) => data.messages, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'poste_id',
    referencedColumnName: 'id',
  })
  poste?: WhatsappPoste | null;

  @OneToMany(
    () => WhatsappMessageContent,
    (messageContent) => messageContent.message,
  )
  messageCnntent: WhatsappMessageContent[];

  @Column({ name: 'contact_id', type: 'uuid',nullable:true })
  contact_id: string |null;

  @ManyToOne(() => Contact, (contact) => contact.messages, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact | null;

  @Column({
    name: 'direction',
    type: 'enum',
    enum: MessageDirection,
    nullable: false,
  })
  direction: MessageDirection;

  @Column({ name: 'from_me', type: 'bool', nullable: false })
  from_me: boolean;

  @Column({
    name: 'sender_phone',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  from: string;

  @Column({
    name: 'sender_name',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  from_name: string;

  @Column({
    name: 'timestamp',
    type: 'timestamp',
    precision: 0,
    nullable: false,
  })
  timestamp: Date;

  @Column({
    name: 'status',
    type: 'enum',
    enum: WhatsappMessageStatus,
    nullable: false,
    default: WhatsappMessageStatus.DELIVERED,
  })
  status: WhatsappMessageStatus;

  @Column({ name: 'source', type: 'varchar', length: 100, nullable: false })
  source: string;

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

  @BeforeInsert()
  clearContactForAgentMessage() {
    if (this.from_me) {
      this.contact = null;
    }
  }
}
