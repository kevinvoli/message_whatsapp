import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index('UQ_whatsapp_contact_contact_id', ['contact_id'], { unique: true })
export class WhatsappContact {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'contact_id', type: 'varchar', length: 100, nullable: false })
  contact_id: string;

  @Column({
    name: 'message_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  message_content_id: string;

  @ManyToOne(
    () => WhatsappMessageContent,
    (messagecontent) => messagecontent.contact,
  )
  @JoinColumn({
    name: 'message_content_id',
    referencedColumnName: 'message_content_id',
  })
  messageContent: WhatsappMessageContent;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'vcard', type: 'varchar', length: 100, nullable: false })
  vcard: string;

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
