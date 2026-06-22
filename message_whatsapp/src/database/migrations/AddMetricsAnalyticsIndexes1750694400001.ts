import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index couvrants pour les requêtes de métriques et analytics.
 *
 * Cette migration ne crée que les index sur les petites tables (audit_log,
 * call_log, outbound_webhook_log) pour ne pas bloquer le déploiement.
 *
 * Les index sur whatsapp_message et whatsapp_chat sont volumineux et doivent
 * être appliqués manuellement hors déploiement :
 *
 *   ALTER TABLE `whatsapp_message` ADD INDEX IF NOT EXISTS `IDX_msg_chat_created`       (`chat_id`, `createdAt`)       ALGORITHM=INPLACE, LOCK=NONE;
 *   ALTER TABLE `whatsapp_message` ADD INDEX IF NOT EXISTS `IDX_msg_status_created`     (`status`, `createdAt`)        ALGORITHM=INPLACE, LOCK=NONE;
 *   ALTER TABLE `whatsapp_message` ADD INDEX IF NOT EXISTS `IDX_msg_direction_created`  (`direction`, `createdAt`)     ALGORITHM=INPLACE, LOCK=NONE;
 *   ALTER TABLE `whatsapp_message` ADD INDEX IF NOT EXISTS `IDX_msg_sentiment`          (`sentiment_label`, `createdAt`) ALGORITHM=INPLACE, LOCK=NONE;
 *   ALTER TABLE `whatsapp_chat`    ADD INDEX IF NOT EXISTS `IDX_chat_commercial_status` (`poste_id`, `status`, `createdAt`) ALGORITHM=INPLACE, LOCK=NONE;
 *   ALTER TABLE `whatsapp_chat`    ADD INDEX IF NOT EXISTS `IDX_chat_channel_status`    (`channel_id`, `status`, `createdAt`) ALGORITHM=INPLACE, LOCK=NONE;
 *   ALTER TABLE `whatsapp_chat`    ADD INDEX IF NOT EXISTS `IDX_chat_status_last_msg`   (`status`, `last_client_message_at`) ALGORITHM=INPLACE, LOCK=NONE;
 *
 * transaction = false : DDL online InnoDB non bloquant
 */
export class AddMetricsAnalyticsIndexes1750694400001 implements MigrationInterface {
  name = 'AddMetricsAnalyticsIndexes1750694400001';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── audit_log ─────────────────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'audit_log',           'IDX_audit_action_created',  '`action`, `created_at`');

    // ── call_log ──────────────────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'call_log',            'IDX_call_commercial_date',  '`commercial_id`, `called_at`');
    await this.addIndex(queryRunner, 'call_log',            'IDX_call_phone_date',       '`client_phone`, `called_at`');

    // ── outbound_webhook_log ──────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'outbound_webhook_log', 'IDX_webhook_log_status',   '`webhook_id`, `created_at`, `status`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(queryRunner, 'outbound_webhook_log', 'IDX_webhook_log_status');
    await this.dropIndex(queryRunner, 'call_log',             'IDX_call_phone_date');
    await this.dropIndex(queryRunner, 'call_log',             'IDX_call_commercial_date');
    await this.dropIndex(queryRunner, 'audit_log',            'IDX_audit_action_created');
  }

  private async indexExists(queryRunner: QueryRunner, table: string, indexName: string): Promise<boolean> {
    const rows = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND INDEX_NAME   = ?
    `, [table, indexName]) as Array<{ cnt: string }>;
    return parseInt(rows[0].cnt, 10) > 0;
  }

  private async addIndex(queryRunner: QueryRunner, table: string, indexName: string, columns: string): Promise<void> {
    if (await this.indexExists(queryRunner, table, indexName)) return;
    await queryRunner.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`);
  }

  private async dropIndex(queryRunner: QueryRunner, table: string, indexName: string): Promise<void> {
    if (!(await this.indexExists(queryRunner, table, indexName))) return;
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
  }
}
