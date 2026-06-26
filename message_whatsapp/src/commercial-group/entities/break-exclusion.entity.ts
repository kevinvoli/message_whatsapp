import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('break_exclusion')
@Index('IDX_exclusion_subgroup', ['subGroupId'])
export class BreakExclusion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sub_group_id', type: 'char', length: 36 })
  subGroupId: string;

  @Column({ name: 'scope', type: 'enum', enum: ['poste', 'commercial'] })
  scope: 'poste' | 'commercial';

  @Column({ name: 'poste_id', type: 'char', length: 36, nullable: true, default: null })
  posteId: string | null;

  @Column({ name: 'commercial_id', type: 'char', length: 36, nullable: true, default: null })
  commercialId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;
}
