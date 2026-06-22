import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration : index couvrants pour les requêtes de métriques et analytics
 *
 * Colonnes SQL réelles (vérifiées dans les entités) :
 * - whatsapp_message  : chat_id, status, direction, sentiment_label, createdAt (camelCase SQL)
 * - whatsapp_chat     : poste_id, channel_id, status, last_client_message_at, createdAt
 * - audit_log         : action, created_at (snake_case SQL)
 * - call_log          : commercial_id, called_at, client_phone (pas "phone")
 * - whatsapp_broadcast_recipient : broadcast_id, status  → IDX_bcr_status déjà en place
 * - outbound_webhook_log : webhook_id, createdAt, status → IDX_owhl_webhook déjà en place
 *
 * Index déjà existants dans les entités (ignorés ici pour éviter les doublons) :
 * - IDX_bcr_status              : whatsapp_broadcast_recipient(broadcast_id, status)
 * - IDX_owhl_webhook            : outbound_webhook_log(webhook_id, createdAt)
 * - IDX_chat_analytics_status_time : whatsapp_chat(status, createdAt, deletedAt)
 * - IDX_chat_channel_activity   : whatsapp_chat(channel_id, last_activity_at, deletedAt)
 * - IDX_chat_poste_status       : whatsapp_chat(poste_id, status, deletedAt)
 * - IDX_call_log_commercial_createdat : call_log(commercial_id, createdAt)
 * - IDX_call_log_commercial_id  : call_log(commercial_id)
 * - IDX_call_log_called_at      : call_log(called_at)
 *
 * transaction = false : DDL online InnoDB non bloquant
 */
export class AddMetricsAnalyticsIndexes1750694400001 implements MigrationInterface {
  name = 'AddMetricsAnalyticsIndexes1750694400001';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET SESSION innodb_lock_wait_timeout = 15');

    // ── whatsapp_message ─────────────────────────────────────────────────────

    // (chat_id, createdAt) : historique messages par conversation sur période
    await this.addIndex(
      queryRunner,
      'whatsapp_message',
      'IDX_msg_chat_created',
      '`chat_id`, `createdAt`',
    );

    // (status, createdAt) : distribution des statuts de livraison sur période
    await this.addIndex(
      queryRunner,
      'whatsapp_message',
      'IDX_msg_status_created',
      '`status`, `createdAt`',
    );

    // (direction, createdAt) : volume entrant/sortant sur période
    // NB : IDX_msg_analytics_dir_time couvre (direction, createdAt, deletedAt)
    // Cet index sans deletedAt est plus sélectif pour les requêtes sans soft-delete
    await this.addIndex(
      queryRunner,
      'whatsapp_message',
      'IDX_msg_direction_created',
      '`direction`, `createdAt`',
    );

    // (sentiment_label, createdAt) : analyse de sentiment sur période
    await this.addIndex(
      queryRunner,
      'whatsapp_message',
      'IDX_msg_sentiment',
      '`sentiment_label`, `createdAt`',
    );

    // ── whatsapp_chat ─────────────────────────────────────────────────────────

    // (poste_id, status, createdAt) : conversations par commercial/statut sur période
    // NB : IDX_chat_poste_status couvre (poste_id, status, deletedAt) — colonnes différentes
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'IDX_chat_commercial_status',
      '`poste_id`, `status`, `createdAt`',
    );

    // (channel_id, status, createdAt) : conversations par canal/statut sur période
    // NB : IDX_chat_channel_activity couvre (channel_id, last_activity_at, deletedAt)
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'IDX_chat_channel_status',
      '`channel_id`, `status`, `createdAt`',
    );

    // (status, last_client_message_at) : SLA et temps de réponse par statut
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'IDX_chat_status_last_msg',
      '`status`, `last_client_message_at`',
    );

    // ── audit_log ─────────────────────────────────────────────────────────────
    // Colonne SQL : created_at (snake_case — @CreateDateColumn({ name: 'created_at' }))

    await this.addIndex(
      queryRunner,
      'audit_log',
      'IDX_audit_action_created',
      '`action`, `created_at`',
    );

    // ── call_log ──────────────────────────────────────────────────────────────
    // (commercial_id, called_at) : appels par commercial sur période
    // NB : IDX_call_log_commercial_createdat couvre (commercial_id, createdAt) — colonne différente
    await this.addIndex(
      queryRunner,
      'call_log',
      'IDX_call_commercial_date',
      '`commercial_id`, `called_at`',
    );

    // (client_phone, called_at) : historique appels par numéro sur période
    // NB : la colonne s'appelle client_phone dans l'entité (pas phone)
    await this.addIndex(
      queryRunner,
      'call_log',
      'IDX_call_phone_date',
      '`client_phone`, `called_at`',
    );

    // ── whatsapp_broadcast_recipient ──────────────────────────────────────────
    // IDX_bcr_status (broadcast_id, status) existe déjà dans l'entité — index ignoré

    // ── outbound_webhook_log ──────────────────────────────────────────────────
    // IDX_owhl_webhook (webhook_id, createdAt) existe déjà dans l'entité
    // On ajoute un index couvrant incluant status pour les requêtes analytiques filtrées par statut
    await this.addIndex(
      queryRunner,
      'outbound_webhook_log',
      'IDX_webhook_log_status',
      '`webhook_id`, `created_at`, `status`',
    );

    await queryRunner.query('SET SESSION innodb_lock_wait_timeout = 50');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(queryRunner, 'outbound_webhook_log', 'IDX_webhook_log_status');
    await this.dropIndex(queryRunner, 'call_log', 'IDX_call_phone_date');
    await this.dropIndex(queryRunner, 'call_log', 'IDX_call_commercial_date');
    await this.dropIndex(queryRunner, 'audit_log', 'IDX_audit_action_created');
    await this.dropIndex(queryRunner, 'whatsapp_chat', 'IDX_chat_status_last_msg');
    await this.dropIndex(queryRunner, 'whatsapp_chat', 'IDX_chat_channel_status');
    await this.dropIndex(queryRunner, 'whatsapp_chat', 'IDX_chat_commercial_status');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_sentiment');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_direction_created');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_status_created');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_chat_created');
  }

  // ── Helpers idempotents ────────────────────────────────────────────────────

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query<{ cnt: string }[]>(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND INDEX_NAME   = ?
    `, [table, indexName]);
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
