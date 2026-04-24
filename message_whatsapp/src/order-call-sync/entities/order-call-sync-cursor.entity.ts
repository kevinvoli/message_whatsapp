import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Mémorise le curseur du dernier appel synchronisé depuis call_logs DB2.
 * Une seule ligne par scope (ex: 'global').
 */
@Entity('order_call_sync_cursor')
export class OrderCallSyncCursor {
  @PrimaryColumn({ name: 'scope', type: 'varchar', length: 50 })
  scope: string;

  /** Timestamp du dernier appel traité (used as WHERE call_timestamp > lastCallTimestamp). */
  @Column({ name: 'last_call_timestamp', type: 'datetime', nullable: true })
  lastCallTimestamp: Date | null;

  /** ID du dernier appel traité (tie-breaker si même timestamp). */
  @Column({ name: 'last_call_id', type: 'varchar', length: 36, nullable: true })
  lastCallId: string | null;

  /** Nombre total d'appels traités depuis le début. */
  @Column({ name: 'processed_count', type: 'bigint', default: 0 })
  processedCount: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
