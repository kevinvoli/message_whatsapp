import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('csat_responses')
@Index('IDX_csat_chat_id', ['chat_id'])
export class CsatResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100 })
  chat_id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenant_id?: string | null;

  @Column({ name: 'commercial_id', type: 'char', length: 36, nullable: true })
  commercial_id?: string | null;

  /** Score de satisfaction : 1 (Insuffisant), 3 (Bien), 5 (Excellent) */
  @Column({ name: 'score', type: 'tinyint' })
  score: number;

  @CreateDateColumn({ name: 'responded_at', type: 'timestamp' })
  respondedAt: Date;
}
