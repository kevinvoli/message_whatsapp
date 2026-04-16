import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P1.3 — Indexes BDD manquants identifiés dans l'audit technique 2026-04-15.
 *
 * Ajouts :
 *   whatsapp_chat
 *     IDX_chat_sla          : (tenant_id, status, last_client_message_at) — queries SLA checker
 *     IDX_chat_by_poste     : (tenant_id, poste_id, status)               — liste conversations par agent
 *     IDX_chat_unread       : (tenant_id, status, unread_count)            — comptage non-lus
 *
 *   whatsapp_message
 *     IDX_msg_dedup_out     : (tenant_id, provider_message_id, direction)  — déduplication outbound
 *     IDX_msg_chat_ts       : (chat_id, timestamp)                         — historique ordonné
 *
 * Toutes les opérations sont idempotentes (vérifient l'existence avant de créer).
 */
export class AddMissingIndexes1744761600000 implements MigrationInterface {
  name = 'AddMissingIndexes1744761600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── whatsapp_chat ─────────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_chat')) {
      await this.idx(
        queryRunner,
        'whatsapp_chat',
        'IDX_chat_sla',
        '`tenant_id`, `status`, `last_client_message_at`',
      );
      await this.idx(
        queryRunner,
        'whatsapp_chat',
        'IDX_chat_by_poste',
        '`tenant_id`, `poste_id`, `status`',
      );
      await this.idx(
        queryRunner,
        'whatsapp_chat',
        'IDX_chat_unread',
        '`tenant_id`, `status`, `unread_count`',
      );
    }

    // ── whatsapp_message ──────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_message')) {
      await this.idx(
        queryRunner,
        'whatsapp_message',
        'IDX_msg_dedup_out',
        '`tenant_id`, `provider_message_id`(64), `direction`',
      );
      await this.idx(
        queryRunner,
        'whatsapp_message',
        'IDX_msg_chat_ts',
        '`chat_id`, `timestamp`',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops: [string, string][] = [
      ['whatsapp_chat',    'IDX_chat_sla'],
      ['whatsapp_chat',    'IDX_chat_by_poste'],
      ['whatsapp_chat',    'IDX_chat_unread'],
      ['whatsapp_message', 'IDX_msg_dedup_out'],
      ['whatsapp_message', 'IDX_msg_chat_ts'],
    ];
    for (const [table, indexName] of drops) {
      if (await queryRunner.hasTable(table)) {
        await this.dropIdx(queryRunner, table, indexName);
      }
    }
  }

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
  ): Promise<void> {
    if (await this.indexExists(queryRunner, table, indexName)) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`,
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
