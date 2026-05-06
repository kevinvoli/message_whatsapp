import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FollowUpType } from './follow_up.entity';

@Entity({ name: 'follow_up_template_mapping' })
@Unique('UQ_follow_up_template_mapping_type', ['followUpType'])
export class FollowUpTemplateMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'follow_up_type', type: 'enum', enum: FollowUpType })
  followUpType: FollowUpType;

  @Column({ name: 'template_id', type: 'varchar', length: 36, nullable: true })
  templateId: string | null;

  @Column({ name: 'template_name', type: 'varchar', length: 512, nullable: true })
  templateName: string | null;

  @Column({ name: 'language_code', type: 'varchar', length: 20, default: 'fr' })
  languageCode: string;

  @Column({ name: 'active', type: 'tinyint', default: 1 })
  active: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
