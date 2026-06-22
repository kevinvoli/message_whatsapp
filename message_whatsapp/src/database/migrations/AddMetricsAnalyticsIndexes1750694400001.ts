import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index couvrants pour les requêtes de métriques et analytics.
 *
 * Tous les index sont créés avec ALGORITHM=INPLACE, LOCK=NONE :
 * - pas de verrouillage table → l'application continue de fonctionner pendant la création
 * - idempotent : chaque index est vérifié avant création (IF NOT EXISTS via INFORMATION_SCHEMA)
 *
 * Durée estimée sur grandes tables (whatsapp_message, whatsapp_chat) : plusieurs minutes.
 * La migration bloquera le démarrage le temps de construire les index — c'est attendu.
 *
 * Colonnes SQL réelles (vérifiées dans les entités) :
 * - whatsapp_message  : chat_id, status, direction, sentiment_label, createdAt (camelCase SQL)
 * - whatsapp_chat     : poste_id, channel_id, status, last_client_message_at, createdAt
 * - audit_log         : action, created_at (snake_case SQL)
 * - call_log          : commercial_id, called_at, client_phone
 * - outbound_webhook_log : webhook_id, created_at, status
 *
 * transaction = false : requis pour DDL avec ALGORITHM=INPLACE
 */
export class AddMetricsAnalyticsIndexes1750694400001 implements MigrationInterface {
  name = 'AddMetricsAnalyticsIndexes1750694400001';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── whatsapp_message ──────────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'whatsapp_message', 'IDX_msg_chat_created',
      '`chat_id`, `createdAt`');

    await this.addIndex(queryRunner, 'whatsapp_message', 'IDX_msg_status_created',
      '`status`, `createdAt`');

    await this.addIndex(queryRunner, 'whatsapp_message', 'IDX_msg_direction_created',
      '`direction`, `createdAt`');

    await this.addIndex(queryRunner, 'whatsapp_message', 'IDX_msg_sentiment',
      '`sentiment_label`, `createdAt`');

    // ── whatsapp_chat ─────────────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'whatsapp_chat', 'IDX_chat_commercial_status',
      '`poste_id`, `status`, `createdAt`');

    await this.addIndex(queryRunner, 'whatsapp_chat', 'IDX_chat_channel_status',
      '`channel_id`, `status`, `createdAt`');

    await this.addIndex(queryRunner, 'whatsapp_chat', 'IDX_chat_status_last_msg',
      '`status`, `last_client_message_at`');

    // ── audit_log ─────────────────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'audit_log', 'IDX_audit_action_created',
      '`action`, `created_at`');

    // ── call_log ──────────────────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'call_log', 'IDX_call_commercial_date',
      '`commercial_id`, `called_at`');

    await this.addIndex(queryRunner, 'call_log', 'IDX_call_phone_date',
      '`client_phone`, `called_at`');

    // ── outbound_webhook_log ──────────────────────────────────────────────────
    await this.addIndex(queryRunner, 'outbound_webhook_log', 'IDX_webhook_log_status',
      '`webhook_id`, `created_at`, `status`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(queryRunner, 'outbound_webhook_log', 'IDX_webhook_log_status');
    await this.dropIndex(queryRunner, 'call_log',             'IDX_call_phone_date');
    await this.dropIndex(queryRunner, 'call_log',             'IDX_call_commercial_date');
    await this.dropIndex(queryRunner, 'audit_log',            'IDX_audit_action_created');
    await this.dropIndex(queryRunner, 'whatsapp_chat',        'IDX_chat_status_last_msg');
    await this.dropIndex(queryRunner, 'whatsapp_chat',        'IDX_chat_channel_status');
    await this.dropIndex(queryRunner, 'whatsapp_chat',        'IDX_chat_commercial_status');
    await this.dropIndex(queryRunner, 'whatsapp_message',     'IDX_msg_sentiment');
    await this.dropIndex(queryRunner, 'whatsapp_message',     'IDX_msg_direction_created');
    await this.dropIndex(queryRunner, 'whatsapp_message',     'IDX_msg_status_created');
    await this.dropIndex(queryRunner, 'whatsapp_message',     'IDX_msg_chat_created');
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
