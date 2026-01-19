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
@Index(
  'UQ_whatsapp_location_content_location_content_id',
  ['location_content_id'],
  { unique: true },
)
export class WhatsappLocationContent {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'location_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  location_content_id: string;

  @Column({
    name: 'message_content_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  message_content_id: string;

  @ManyToOne(
    () => WhatsappMessageContent,
    (messageContent) => messageContent.locationContent,
  )
  @JoinColumn({
    name: 'message_content_id',
    referencedColumnName: 'message_content_id',
  })
  messageContent: WhatsappMessageContent;

  @Column({ name: 'latitude', type: 'varchar', length: 100, nullable: false })
  latitude: string;

  @Column({ name: 'longitude', type: 'varchar', length: 100, nullable: false })
  longitude: string;

  @Column({ name: 'address', type: 'varchar', length: 100, nullable: false })
  address: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'url', type: 'varchar', length: 100, nullable: false })
  url: string;

  @Column({ name: 'accuracy', type: 'varchar', length: 100, nullable: false })
  accuracy: string;

  @Column({ name: 'speed', type: 'varchar', length: 100, nullable: false })
  speed: string;

  @Column({ name: 'degrees', type: 'varchar', length: 100, nullable: false })
  degrees: string;

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
