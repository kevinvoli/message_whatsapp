import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableColumn } from 'typeorm';

/**
 * Phase 6 — Intelligence & Automatisation
 * - Sentiment columns sur whatsapp_message (P6.1)
 * - outbound_webhook + outbound_webhook_log (P6.3)
 * FlowBot enum changes (P6.2) : gérées via synchronize ou migration séparée
 */
export class Phase6Features1744761600006 implements MigrationInterface {
  name = 'Phase6Features1744761600006';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── P6.1 — Colonnes sentiment sur whatsapp_message ───────────────────────
    const hasSentimentScore = await queryRunner.hasColumn('whatsapp_message', 'sentiment_score');
    if (!hasSentimentScore) {
      await queryRunner.addColumn(
        'whatsapp_message',
        new TableColumn({ name: 'sentiment_score', type: 'float', isNullable: true }),
      );
    }

    const hasSentimentLabel = await queryRunner.hasColumn('whatsapp_message', 'sentiment_label');
    if (!hasSentimentLabel) {
      await queryRunner.addColumn(
        'whatsapp_message',
        new TableColumn({
          name: 'sentiment_label',
          type: 'enum',
          enum: ['positive', 'neutral', 'negative'],
          isNullable: true,
        }),
      );
    }

    // ─── P6.3 — outbound_webhook ──────────────────────────────────────────────
    if (!(await queryRunner.hasTable('outbound_webhook'))) {
      await queryRunner.createTable(
        new Table({
          name: 'outbound_webhook',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'tenant_id', type: 'char', length: '36', isNullable: false },
            { name: 'name', type: 'varchar', length: '100', isNullable: false },
            { name: 'url', type: 'varchar', length: '500', isNullable: false },
            { name: 'events', type: 'json', isNullable: false },
            { name: 'secret', type: 'varchar', length: '200', isNullable: true },
            { name: 'max_retries', type: 'int', default: 3 },
            { name: 'retry_delay_seconds', type: 'int', default: 60 },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
          ],
          indices: [{ name: 'IDX_owh_tenant', columnNames: ['tenant_id'] }],
        }),
        true,
      );
    }

    // ─── P6.3 — outbound_webhook_log ──────────────────────────────────────────
    if (!(await queryRunner.hasTable('outbound_webhook_log'))) {
      await queryRunner.createTable(
        new Table({
          name: 'outbound_webhook_log',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'webhook_id', type: 'char', length: '36', isNullable: false },
            { name: 'event', type: 'varchar', length: '100', isNullable: false },
            { name: 'payload', type: 'json', isNullable: true },
            {
              name: 'status',
              type: 'enum',
              enum: ['pending', 'success', 'failed', 'retrying'],
              default: "'pending'",
            },
            { name: 'response_status', type: 'int', isNullable: true },
            { name: 'response_body', type: 'text', isNullable: true },
            { name: 'error', type: 'text', isNullable: true },
            { name: 'attempt', type: 'int', default: 0 },
            { name: 'next_retry_at', type: 'datetime', isNullable: true },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_owhl_webhook', columnNames: ['webhook_id', 'created_at'] },
            { name: 'IDX_owhl_status', columnNames: ['status'] },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        'outbound_webhook_log',
        new TableForeignKey({
          name: 'FK_owhl_webhook',
          columnNames: ['webhook_id'],
          referencedTableName: 'outbound_webhook',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('outbound_webhook_log')) {
      await queryRunner.dropTable('outbound_webhook_log', true);
    }
    if (await queryRunner.hasTable('outbound_webhook')) {
      await queryRunner.dropTable('outbound_webhook', true);
    }
    if (await queryRunner.hasColumn('whatsapp_message', 'sentiment_label')) {
      await queryRunner.dropColumn('whatsapp_message', 'sentiment_label');
    }
    if (await queryRunner.hasColumn('whatsapp_message', 'sentiment_score')) {
      await queryRunner.dropColumn('whatsapp_message', 'sentiment_score');
    }
  }
}
