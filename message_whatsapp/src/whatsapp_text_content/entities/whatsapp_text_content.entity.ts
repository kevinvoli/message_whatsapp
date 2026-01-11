import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
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
@Index('UQ_whatsapp_text_content_text_content_id', ['text_content_id'], { unique: true })
export class WhatsappTextContent {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'text_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  text_content_id: string;

  @Column({
    name: 'message_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  message_content_id: string;

  @ManyToOne(
    () => WhatsappMessageContent,
    (messagecontent) => messagecontent.textContent,
  )
  @JoinColumn({
    name: 'message_content_id',
    referencedColumnName: 'message_content_id',
  })
  messageContent: WhatsappMessageContent;

  @Column({ name: 'body', type: 'varchar', length: 100, nullable: false })
  body: string;

  @Column({ name: 'view_once', type: 'varchar', length: 100, nullable: false })
  view_once: string;

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
