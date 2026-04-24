import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type SyncStatus = 'pending' | 'success' | 'failed';

export type SyncEntityType =
  | 'client_dossier'
  | 'conversation_closure'
  | 'call_validation'
  | 'follow_up';

@Entity('integration_sync_log')
@Index('IDX_sync_log_entity',  ['entityType', 'entityId'])
@Index('IDX_sync_log_status',  ['status', 'createdAt'])
@Index('IDX_sync_log_pending', ['status', 'attemptCount'])
export class IntegrationSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Type d'entité synchronisée (ex: 'client_dossier') */
  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType: SyncEntityType;

  /** Identifiant local de l'entité (UUID DB1) */
  @Column({ name: 'entity_id', type: 'varchar', length: 36 })
  entityId: string;

  /** Table cible en DB2 (ex: 'messaging_client_dossier_mirror') */
  @Column({ name: 'target_table', type: 'varchar', length: 100 })
  targetTable: string;

  @Column({ name: 'status', type: 'enum', enum: ['pending', 'success', 'failed'], default: 'pending' })
  status: SyncStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'synced_at', type: 'timestamp', nullable: true })
  syncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
