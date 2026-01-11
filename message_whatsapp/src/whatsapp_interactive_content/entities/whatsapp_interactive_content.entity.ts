import { WhatsappButton } from 'src/whatsapp_button/entities/whatsapp_button.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
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
@Index('UQ_whatsapp_interactive_content_interactive_content_id', ['interactive_content_id'], { unique: true })
export class WhatsappInteractiveContent {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'interactive_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  interactive_content_id: string;

  @Column({
    name: 'message_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  message_content_id: string;

  @ManyToOne(
    () => WhatsappMessageContent,
    (messageContent) => messageContent.interactiveContent,
  )
  @JoinColumn({
    name: 'message_content_id',
    referencedColumnName: 'message_content_id',
  })
  messageContent: WhatsappMessageContent;

  @Column({
    name: 'interactive_type',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  interactive_type: 'button' | 'list' | 'product';

  @Column({
    name: 'header_text',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  header_text: string;

  @Column({ name: 'body_text', type: 'varchar', length: 100, nullable: false })
  body_text: string;

  @Column({
    name: 'footer_text',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  footer_text: string;

  @OneToMany(() => WhatsappButton, (button) => button.interactiveContent)
  @JoinColumn({
    name: 'interractive_content_id',
    referencedColumnName: 'interactive_content_id',
  })
  button: WhatsappButton[];

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
