import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index couvrants pour les requêtes de service fréquentes (crons, jobs, webhooks).
 *
 * Seuls les index sur petites tables sont créés ici pour ne pas bloquer le déploiement.
 * Les index sur conversation_report et whatsapp_chat (grandes tables) doivent être
 * appliqués manuellement hors déploiement :
 *
 *   ALTER TABLE `conversation_report` ADD INDEX IF NOT EXISTS `IDX_conv_report_chat_submitted` (`chat_id`, `is_submitted`);
 *   ALTER TABLE `whatsapp_chat` ADD INDEX IF NOT EXISTS `IDX_chat_window_slot_status` (`poste_id`, `window_slot`, `window_status`);
 *   ALTER TABLE `whatsapp_chat` ADD INDEX IF NOT EXISTS `IDX_chat_status_activity` (`status`, `last_activity_at`);
 *
 * transaction = false : requis pour les DDL (MariaDB crée les index en ligne par défaut)
 */
export class AddMissingServiceIndexes1750780800001 implements MigrationInterface {
  name = 'AddMissingServiceIndexes1750780800001';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── conversation_validation : type + is_validated + created_at (cron validation) ──
    await this.addIndex(
      queryRunner,
      'conversation_validation',
      'IDX_conv_validation_type_validated',
      '`criterion_type`, `is_validated`, `created_at`',
    );

    // ── missed_call_event : status (getMetrics agrégation) ──
    await this.addIndex(
      queryRunner,
      'missed_call_event',
      'IDX_missed_call_status',
      '`status`',
    );

    // ── whatsapp_media : local_path + provider_url_expired + createdAt (backfill cron) ──
    await this.addIndex(
      queryRunner,
      'whatsapp_media',
      'IDX_media_local_backfill',
      '`local_path`, `provider_url_expired`, `createdAt`',
    );

    // ── follow_up : status + scheduled_at (markOverdue cron 30m) ──
    await this.addIndex(
      queryRunner,
      'follow_up',
      'IDX_followup_status_scheduled',
      '`status`, `scheduled_at`',
    );

    // ── flow_session : status + started_at (findExpiredWaitingDelay cron 30s) ──
    await this.addIndex(
      queryRunner,
      'flow_session',
      'IDX_flow_session_status_created',
      '`status`, `started_at`',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(queryRunner, 'flow_session',            'IDX_flow_session_status_created');
    await this.dropIndex(queryRunner, 'follow_up',               'IDX_followup_status_scheduled');
    await this.dropIndex(queryRunner, 'whatsapp_media',          'IDX_media_local_backfill');
    await this.dropIndex(queryRunner, 'missed_call_event',       'IDX_missed_call_status');
    await this.dropIndex(queryRunner, 'conversation_validation', 'IDX_conv_validation_type_validated');
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
      `ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`,
    );
  }

  private async dropIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<void> {
    if (!(await this.indexExists(queryRunner, table, indexName))) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``,
    );
  }
}
