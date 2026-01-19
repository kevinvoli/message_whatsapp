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
@Index('UQ_whatsapp_status_status_id', ['status_id'], { unique: true })
export class WhatsappStatus {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'status_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  status_id: string;

  @Column({ name: 'code', type: 'varchar', length: 100, nullable: false })
  code: number;

  @Column({ name: 'status', type: 'varchar', length: 100, nullable: false })
  status: string;

  @Column({
    name: 'recipient_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  recipient_id: boolean;

  @Column({ name: 'viewer_id', type: 'varchar', length: 100, nullable: false })
  viewer_id: string;

  @Column({ name: 'timestamp', type: 'varchar', length: 100, nullable: false })
  timestamp: string;

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
