import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'conversation_validation' })
@Index('UQ_conv_validation_chat_criterion', ['chat_id', 'criterion_type'], { unique: true })
export class ConversationValidation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100 })
  chat_id: string;

  @Column({ name: 'criterion_type', type: 'varchar', length: 50 })
  criterion_type: string;

  @Column({ name: 'is_validated', type: 'boolean', default: false })
  is_validated: boolean;

  @Column({ name: 'validated_at', type: 'timestamp', nullable: true })
  validated_at: Date | null;

  @Column({ name: 'external_id', type: 'varchar', length: 100, nullable: true })
  external_id: string | null;

  @Column({ name: 'external_data', type: 'json', nullable: true })
  external_data: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
