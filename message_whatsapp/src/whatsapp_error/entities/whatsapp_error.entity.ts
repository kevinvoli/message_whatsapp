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
@Index('UQ_whatsapp_error_error_id', ['error_id'], { unique: true })
export class WhatsappError {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'error_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  error_id: string;

  @Column({ name: 'code', type: 'int', nullable: false })
  code: number;

  @Column({ name: 'message', type: 'varchar', length: 100, nullable: false })
  message: string;

  @Column({ name: 'details', type: 'varchar', length: 100, nullable: false })
  details: string;

  @Column({ name: 'href', type: 'varchar', length: 100, nullable: false })
  href: string;

  @Column({ name: 'support', type: 'varchar', length: 100, nullable: false })
  support: string;

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
