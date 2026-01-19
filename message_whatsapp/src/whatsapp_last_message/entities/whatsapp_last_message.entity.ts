import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index('UQ_whatsapp_last_message_last_message_id', ['last_message_id'], {
  unique: true,
})
export class WhatsappLastMessage {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'last_message_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  last_message_id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: false })
  chat_id: string;

  @Column({ name: 'message_id', type: 'varchar', length: 100, nullable: false })
  message_id: string;

  @Column({
    name: 'timestamp',
    type: 'timestamp',
    precision: 0,
    nullable: false,
  })
  timestamp: Date;

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
