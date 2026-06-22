import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index couvrants pour les requêtes de service fréquentes (crons, jobs, webhooks).
 *
 * Tous les index sont créés avec ALGORITHM=INPLACE, LOCK=NONE :
 * - pas de verrouillage table pendant la création
 * - idempotent : vérification par INFORMATION_SCHEMA avant chaque création
 *
 * Colonnes SQL réelles vérifiées dans les entités :
 * - conversation_report  : chat_id, is_submitted (snake_case SQL)
 * - whatsapp_chat        : poste_id, window_slot, window_status, status, last_activity_at
 * - conversation_validation : criterion_type, is_validated, created_at
 * - missed_call_event    : status
 * - commercial_obligation_batch : poste_id, status (IDX_batch_poste_status existe déjà)
 * - call_task            : batch_id, category, status (IDX_call_task_batch_cat existe déjà)
 * - whatsapp_media       : local_path, provider_url_expired, createdAt (camelCase SQL)
 * - follow_up            : status, scheduled_at
 * - flow_session         : status, started_at (pas de created_at dans la table)
 * - integration_sync_log : status, created_at (IDX_sync_log_status existe déjà)
 *
 * transaction = false : requis pour DDL avec ALGORITHM=INPLACE
 */
export class AddMissingServiceIndexes1750780800001 implements MigrationInterface {
  name = 'AddMissingServiceIndexes1750780800001';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. conversation_report : filtre bulk chatId + soumission (window rotation) ──
    await this.addIndex(
      queryRunner,
      'conversation_report',
      'IDX_conv_report_chat_submitted',
      '`chat_id`, `is_submitted`',
    );

    // ── 2. whatsapp_chat : window_slot + window_status (cron fenêtre glissante/minute) ──
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'IDX_chat_window_slot_status',
      '`poste_id`, `window_slot`, `window_status`',
    );

    // ── 3. conversation_validation : type + is_validated + created_at (cron validation) ──
    await this.addIndex(
      queryRunner,
      'conversation_validation',
      'IDX_conv_validation_type_validated',
      '`criterion_type`, `is_validated`, `created_at`',
    );

    // ── 4. missed_call_event : status (getMetrics agrégation) ──
    await this.addIndex(
      queryRunner,
      'missed_call_event',
      'IDX_missed_call_status',
      '`status`',
    );

    // ── 7. whatsapp_media : local_path + provider_url_expired + createdAt (backfill cron) ──
    await this.addIndex(
      queryRunner,
      'whatsapp_media',
      'IDX_media_local_backfill',
      '`local_path`, `provider_url_expired`, `createdAt`',
    );

    // ── 8. follow_up : status + scheduled_at (markOverdue cron 30m) ──
    await this.addIndex(
      queryRunner,
      'follow_up',
      'IDX_followup_status_scheduled',
      '`status`, `scheduled_at`',
    );

    // ── 9. whatsapp_chat : status + last_activity_at (pollInactivity cron 5m) ──
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'IDX_chat_status_activity',
      '`status`, `last_activity_at`',
    );

    // ── 10. flow_session : status + started_at (findExpiredWaitingDelay cron 30s) ──
    // Utilise started_at : flow_session n'a pas de colonne created_at
    await this.addIndex(
      queryRunner,
      'flow_session',
      'IDX_flow_session_status_created',
      '`status`, `started_at`',
    );

    // Index 11 (integration_sync_log status+created_at) : couvert par IDX_sync_log_status existant
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(queryRunner, 'flow_session',         'IDX_flow_session_status_created');
    await this.dropIndex(queryRunner, 'whatsapp_chat',        'IDX_chat_status_activity');
    await this.dropIndex(queryRunner, 'follow_up',            'IDX_followup_status_scheduled');
    await this.dropIndex(queryRunner, 'whatsapp_media',       'IDX_media_local_backfill');
    await this.dropIndex(queryRunner, 'missed_call_event',    'IDX_missed_call_status');
    await this.dropIndex(queryRunner, 'conversation_validation', 'IDX_conv_validation_type_validated');
    await this.dropIndex(queryRunner, 'whatsapp_chat',        'IDX_chat_window_slot_status');
    await this.dropIndex(queryRunner, 'conversation_report',  'IDX_conv_report_chat_submitted');
  }

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND INDEX_NAME   = ?
    `, [table, indexName]) as Array<{ cnt: string }>;
    return parseInt(rows[0].cnt, 10) > 0;
  }

  private async addIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    columns: string,
  ): Promise<void> {
    if (await this.indexExists(queryRunner, table, indexName)) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns}) ALGORITHM=INPLACE, LOCK=NONE`,
    );
  }

  private async dropIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<void> {
    if (!(await this.indexExists(queryRunner, table, indexName))) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\` ALGORITHM=INPLACE, LOCK=NONE`,
    );
  }
}
