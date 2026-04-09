import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: index critiques pour la pagination à l'échelle (CDC_PAGINATION_SCALE)
 *
 * - IDX_msg_chat_status   : comptage unread bulk (chat_id, from_me, status, deletedAt)
 * - IDX_chat_poste_status_deleted : stats filtrées par poste (poste_id, status, deletedAt)
 *
 * Toutes les opérations sont online InnoDB et idempotentes.
 */
export class AddScaleIndexes1744185600000 implements MigrationInterface {
  name = 'AddScaleIndexes1744185600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── whatsapp_message ──────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_message')) {
      await this.idx(
        queryRunner,
        'whatsapp_message',
        'IDX_msg_chat_status',
        '`chat_id`, `from_me`, `status`, `deletedAt`',
      );
    }

    // ── whatsapp_chat ─────────────────────────────────────────────────────────
    if (await queryRunner.hasTable('whatsapp_chat')) {
      await this.idx(
        queryRunner,
        'whatsapp_chat',
        'IDX_chat_poste_status_deleted',
        '`poste_id`, `status`, `deletedAt`',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops: [string, string][] = [
      ['whatsapp_message', 'IDX_msg_chat_status'],
      ['whatsapp_chat',    'IDX_chat_poste_status_deleted'],
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
