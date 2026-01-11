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
@Index('UQ_whatsapp_chat_participant_chat_participant_id', ['chat_participant_id'], { unique: true })
export class WhatsappChatParticipant {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'chat_participant_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  chat_participant_id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: false })
  chat_id: string;

  @Column({ name: 'phone', type: 'varchar', length: 100, nullable: false })
  phone: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'role', type: 'varchar', length: 100, nullable: false })
  role: 'admin' | 'member';

  @Column({ name: 'joined_at', type: 'varchar', length: 100, nullable: false })
  joined_at: string;

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
