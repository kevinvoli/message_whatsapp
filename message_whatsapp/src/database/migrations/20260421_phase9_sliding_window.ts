import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export class Phase9SlidingWindow1745424000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── 1. whatsapp_chat : colonnes fenêtre glissante ───────────────────────

    // whatsapp_chat pre-dates migrations — use raw SQL to avoid TypeORM cache issues
    if (!(await qr.hasColumn('whatsapp_chat', 'window_slot'))) {
      await qr.query('ALTER TABLE `whatsapp_chat` ADD COLUMN `window_slot` INT NULL DEFAULT NULL');
    }
    if (!(await qr.hasColumn('whatsapp_chat', 'window_status'))) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`window_status\` ENUM('active','locked','validated','released') NULL DEFAULT NULL`);
    }
    try {
      await qr.query('CREATE INDEX `IDX_chat_window_slot` ON `whatsapp_chat` (`poste_id`, `window_slot`)');
    } catch {
      // Index déjà existant — ignoré
    }

    // ── 2. conversation_validation ──────────────────────────────────────────

    const hasValidationTable = await qr.hasTable('conversation_validation');
    if (!hasValidationTable) {
      await qr.createTable(
        new Table({
          name: 'conversation_validation',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true },
            { name: 'chat_id', type: 'varchar', length: '100', isNullable: false },
            { name: 'criterion_type', type: 'varchar', length: '50', isNullable: false },
            { name: 'is_validated', type: 'tinyint', width: 1, default: 0 },
            { name: 'validated_at', type: 'timestamp', isNullable: true },
            { name: 'external_id', type: 'varchar', length: '100', isNullable: true },
            { name: 'external_data', type: 'json', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'UQ_conv_validation_chat_criterion', columnNames: ['chat_id', 'criterion_type'], isUnique: true },
            { name: 'IDX_conv_validation_chat_id', columnNames: ['chat_id'] },
          ],
        }),
        true,
      );
    }

    // ── 3. call_event ───────────────────────────────────────────────────────

    const hasCallEventTable = await qr.hasTable('call_event');
    if (!hasCallEventTable) {
      await qr.createTable(
        new Table({
          name: 'call_event',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true },
            { name: 'external_id', type: 'varchar', length: '100', isNullable: false },
            { name: 'commercial_phone', type: 'varchar', length: '50', isNullable: false },
            { name: 'client_phone', type: 'varchar', length: '50', isNullable: false },
            { name: 'call_status', type: 'varchar', length: '30', isNullable: false },
            { name: 'duration_seconds', type: 'int', isNullable: true },
            { name: 'recording_url', type: 'varchar', length: '500', isNullable: true },
            { name: 'order_id', type: 'varchar', length: '100', isNullable: true },
            { name: 'event_at', type: 'timestamp', isNullable: false },
            { name: 'chat_id', type: 'varchar', length: '100', isNullable: true },
            { name: 'commercial_id', type: 'char', length: '36', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'UQ_call_event_external_id', columnNames: ['external_id'], isUnique: true },
            { name: 'IDX_call_event_client_phone', columnNames: ['client_phone'] },
            { name: 'IDX_call_event_commercial_phone', columnNames: ['commercial_phone'] },
          ],
        }),
        true,
      );
    }

    // ── 4. validation_criterion_config ──────────────────────────────────────

    const hasCriterionTable = await qr.hasTable('validation_criterion_config');
    if (!hasCriterionTable) {
      await qr.createTable(
        new Table({
          name: 'validation_criterion_config',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true },
            { name: 'criterion_type', type: 'varchar', length: '50', isNullable: false },
            { name: 'label', type: 'varchar', length: '100', isNullable: false },
            { name: 'is_required', type: 'tinyint', width: 1, default: 1 },
            { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
            { name: 'sort_order', type: 'int', default: 0 },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'UQ_criterion_type', columnNames: ['criterion_type'], isUnique: true },
          ],
        }),
        true,
      );

      // Seed critères initiaux
      await qr.query(`
        INSERT INTO validation_criterion_config (id, criterion_type, label, is_required, is_active, sort_order)
        VALUES
          ('${uuidv4()}', 'result_set', 'Résultat renseigné', 1, 1, 0),
          ('${uuidv4()}', 'call_confirmed', 'Appel confirmé', 0, 1, 1)
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('validation_criterion_config', true);
    await qr.dropTable('call_event', true);
    await qr.dropTable('conversation_validation', true);

    try {
      await qr.dropIndex('whatsapp_chat', 'IDX_chat_window_slot');
    } catch {
      // Index inexistant — ignoré
    }

    if (await qr.hasColumn('whatsapp_chat', 'window_status')) {
      await qr.query('ALTER TABLE `whatsapp_chat` DROP COLUMN `window_status`');
    }
    if (await qr.hasColumn('whatsapp_chat', 'window_slot')) {
      await qr.query('ALTER TABLE `whatsapp_chat` DROP COLUMN `window_slot`');
    }
  }
}
