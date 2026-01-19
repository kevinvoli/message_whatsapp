import { WhatsappContact } from 'src/whatsapp_contacts/entities/whatsapp_contact.entity';
import { WhatsappInteractiveContent } from 'src/whatsapp_interactive_content/entities/whatsapp_interactive_content.entity';
import { WhatsappLocationContent } from 'src/whatsapp_location_content/entities/whatsapp_location_content.entity';
import { WhatsappMediaContent } from 'src/whatsapp_media_content/entities/whatsapp_media_content.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappTextContent } from 'src/whatsapp_text_content/entities/whatsapp_text_content.entity';
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
@Index(
  'UQ_whatsapp_message_content_message_content_id',
  ['message_content_id'],
  { unique: true },
)
export class WhatsappMessageContent {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'message_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  message_content_id: string;

  @Column({ name: 'message_id', type: 'varchar', length: 100, nullable: false })
  message_id: string;

  @ManyToOne(() => WhatsappMessage, (message) => message.messageCnntent)
  @JoinColumn({ name: 'message_id', referencedColumnName: 'message_id' })
  message: WhatsappMessage;

  @OneToMany(() => WhatsappTextContent, (message) => message.messageContent)
  textContent: WhatsappTextContent[];

  @OneToMany(() => WhatsappContact, (message) => message.messageContent)
  contact: WhatsappContact[];

  @OneToMany(() => WhatsappMediaContent, (message) => message.messageContent)
  mediaContent: WhatsappMediaContent[];

  @OneToMany(() => WhatsappLocationContent, (message) => message.messageContent)
  locationContent: WhatsappLocationContent[];

  @OneToMany(
    () => WhatsappInteractiveContent,
    (message) => message.messageContent,
  )
  interactiveContent: WhatsappInteractiveContent[];

  @Column({
    name: 'content_type',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  content_type: string;

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
