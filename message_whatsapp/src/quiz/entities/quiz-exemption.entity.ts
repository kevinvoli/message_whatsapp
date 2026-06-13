import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'quiz_exemption' })
export class QuizExemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'scope', type: 'enum', enum: ['commercial', 'poste'] })
  scope: 'commercial' | 'poste';

  @Column({ name: 'commercial_id', type: 'varchar', length: 36, nullable: true })
  commercialId: string | null;

  @Column({ name: 'poste_id', type: 'varchar', length: 36, nullable: true })
  posteId: string | null;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
