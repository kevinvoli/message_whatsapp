import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'canned_responses', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_canned_tenant_shortcut', ['tenantId', 'shortcut'], { unique: true })
export class CannedResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenantId?: string | null;

  /** Raccourci de déclenchement ex: "/bonjour" */
  @Column({ name: 'shortcut', type: 'varchar', length: 64 })
  shortcut: string;

  @Column({ name: 'title', type: 'varchar', length: 128 })
  title: string;

  @Column({ name: 'content', type: 'text' })
  content: string;

  @Column({ name: 'category', type: 'varchar', length: 64, nullable: true })
  category?: string | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
