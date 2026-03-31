import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: ajout de tous les index de performance
 *
 * Couvre les optimisations des sessions du 2026-03-31 :
 *  - whatsapp_message  : analytiques, temps de réponse, commercial, poste, dedup
 *  - whatsapp_chat     : analytiques, statut, poste
 *  - contact           : phone (hot-path), chat_id, temporel
 *  - whatsapp_commercial : isConnected, deleted_at
 *  - whatsapp_poste    : is_active, is_queue_enabled
 *  - call_log          : contact_id, commercial_id, called_at
 *  - whatsapp_media    : message_id (FK), chat_id (FK)
 *  - whatsapp_chat_label : chat_id
 *  - queue_positions   : poste_id (UNIQUE), position
 *  - dispatch_settings_audit : created_at, settings_id
 *  - admin_notification : read + created_at
 */
export class AddPerformanceIndexes1743379200000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1743379200000';

  // ---------------------------------------------------------------------------
  // UP
  // ---------------------------------------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── whatsapp_message ──────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_message')) {
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_analytics_time',
        '`createdAt`, `deletedAt`');
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_analytics_dir_time',
        '`direction`, `createdAt`, `deletedAt`');
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_response_time',
        '`chat_id`, `direction`, `timestamp`');
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_commercial_dir_time',
        '`commercial_id`, `direction`, `createdAt`');
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_poste_dir_time',
        '`poste_id`, `direction`, `createdAt`');
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_message_id',
        '`message_id`');
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_external_id',
        '`external_id`');
      await this.idx(queryRunner, 'whatsapp_message', 'IDX_msg_provider_message_id',
        '`provider_message_id`');
    }

    // ── whatsapp_chat ─────────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_chat')) {
      await this.idx(queryRunner, 'whatsapp_chat', 'IDX_chat_analytics_time',
        '`createdAt`, `deletedAt`');
      await this.idx(queryRunner, 'whatsapp_chat', 'IDX_chat_analytics_status_time',
        '`status`, `createdAt`, `deletedAt`');
      await this.idx(queryRunner, 'whatsapp_chat', 'IDX_chat_poste_time',
        '`poste_id`, `createdAt`, `deletedAt`');
    }

    // ── contact ───────────────────────────────────────────────────────────────
    // Attention : la colonne "phone" est stockée sous le nom "contact" en base
    if (await queryRunner.hasTable('contact')) {
      await this.idx(queryRunner, 'contact', 'IDX_contact_phone',
        '`contact`');
      await this.idx(queryRunner, 'contact', 'IDX_contact_chat_id',
        '`chat_id`');
      await this.idx(queryRunner, 'contact', 'IDX_contact_created_deleted',
        '`createdAt`, `deletedAt`');
    }

    // ── whatsapp_commercial ───────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_commercial')) {
      await this.idx(queryRunner, 'whatsapp_commercial', 'IDX_commercial_is_connected',
        '`isConnected`');
      await this.idx(queryRunner, 'whatsapp_commercial', 'IDX_commercial_deleted_at',
        '`deleted_at`');
    }

    // ── whatsapp_poste ────────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_poste')) {
      await this.idx(queryRunner, 'whatsapp_poste', 'IDX_poste_is_active',
        '`is_active`');
      await this.idx(queryRunner, 'whatsapp_poste', 'IDX_poste_queue_enabled',
        '`is_queue_enabled`');
    }

    // ── call_log ──────────────────────────────────────────────────────────────
    if (await queryRunner.hasTable('call_log')) {
      await this.idx(queryRunner, 'call_log', 'IDX_call_log_contact_id',
        '`contact_id`');
      await this.idx(queryRunner, 'call_log', 'IDX_call_log_commercial_id',
        '`commercial_id`');
      await this.idx(queryRunner, 'call_log', 'IDX_call_log_called_at',
        '`called_at`');
    }

    // ── whatsapp_media ────────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_media')) {
      await this.idx(queryRunner, 'whatsapp_media', 'IDX_whatsapp_media_message_id',
        '`message_id`');
      await this.idx(queryRunner, 'whatsapp_media', 'IDX_whatsapp_media_chat_id',
        '`chat_id`');
    }

    // ── whatsapp_chat_label ───────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_chat_label')) {
      await this.idx(queryRunner, 'whatsapp_chat_label', 'IDX_chat_label_chat_id',
        '`chat_id`');
    }

    // ── queue_positions ───────────────────────────────────────────────────────
    if (await queryRunner.hasTable('queue_positions')) {
      await this.idx(queryRunner, 'queue_positions', 'UQ_queue_positions_poste_id',
        '`poste_id`', 'UNIQUE');
      await this.idx(queryRunner, 'queue_positions', 'IDX_queue_positions_position',
        '`position`');
    }

    // ── dispatch_settings_audit ───────────────────────────────────────────────
    if (await queryRunner.hasTable('dispatch_settings_audit')) {
      await this.idx(queryRunner, 'dispatch_settings_audit', 'IDX_audit_created_at',
        '`created_at`');
      await this.idx(queryRunner, 'dispatch_settings_audit', 'IDX_audit_settings_id',
        '`settings_id`');
    }

    // ── admin_notification ────────────────────────────────────────────────────
    if (await queryRunner.hasTable('admin_notification')) {
      await this.idx(queryRunner, 'admin_notification', 'IDX_notification_read_created',
        '`read`, `created_at`');
    }
  }

  // ---------------------------------------------------------------------------
  // DOWN
  // ---------------------------------------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops: [string, string][] = [
      ['whatsapp_message',       'IDX_msg_analytics_time'],
      ['whatsapp_message',       'IDX_msg_analytics_dir_time'],
      ['whatsapp_message',       'IDX_msg_response_time'],
      ['whatsapp_message',       'IDX_msg_commercial_dir_time'],
      ['whatsapp_message',       'IDX_msg_poste_dir_time'],
      ['whatsapp_message',       'IDX_msg_message_id'],
      ['whatsapp_message',       'IDX_msg_external_id'],
      ['whatsapp_message',       'IDX_msg_provider_message_id'],
      ['whatsapp_chat',          'IDX_chat_analytics_time'],
      ['whatsapp_chat',          'IDX_chat_analytics_status_time'],
      ['whatsapp_chat',          'IDX_chat_poste_time'],
      ['contact',                'IDX_contact_phone'],
      ['contact',                'IDX_contact_chat_id'],
      ['contact',                'IDX_contact_created_deleted'],
      ['whatsapp_commercial',    'IDX_commercial_is_connected'],
      ['whatsapp_commercial',    'IDX_commercial_deleted_at'],
      ['whatsapp_poste',         'IDX_poste_is_active'],
      ['whatsapp_poste',         'IDX_poste_queue_enabled'],
      ['call_log',               'IDX_call_log_contact_id'],
      ['call_log',               'IDX_call_log_commercial_id'],
      ['call_log',               'IDX_call_log_called_at'],
      ['whatsapp_media',         'IDX_whatsapp_media_message_id'],
      ['whatsapp_media',         'IDX_whatsapp_media_chat_id'],
      ['whatsapp_chat_label',    'IDX_chat_label_chat_id'],
      ['queue_positions',        'UQ_queue_positions_poste_id'],
      ['queue_positions',        'IDX_queue_positions_position'],
      ['dispatch_settings_audit','IDX_audit_created_at'],
      ['dispatch_settings_audit','IDX_audit_settings_id'],
      ['admin_notification',     'IDX_notification_read_created'],
    ];

    for (const [table, indexName] of drops) {
      if (await queryRunner.hasTable(table)) {
        await this.dropIdx(queryRunner, table, indexName);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`,
      [indexName],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async idx(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    columns: string,
    type: 'INDEX' | 'UNIQUE' = 'INDEX',
  ): Promise<void> {
    if (await this.indexExists(queryRunner, table, indexName)) return;
    const keyword = type === 'UNIQUE' ? 'ADD UNIQUE KEY' : 'ADD INDEX';
    await queryRunner.query(
      `ALTER TABLE \`${table}\` ${keyword} \`${indexName}\` (${columns})`,
    );
  }

  private async dropIdx(
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
