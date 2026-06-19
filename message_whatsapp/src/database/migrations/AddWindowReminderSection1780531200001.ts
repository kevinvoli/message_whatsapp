import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWindowReminderSection1780531200001 implements MigrationInterface {
  name = 'AddWindowReminderSection1780531200001';

  private async columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const [row] = await qr.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    ) as Array<{ cnt: number }>;
    return Number(row.cnt) > 0;
  }

  private async indexExists(qr: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await qr.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    // RemoveAutoMessageLegacy1744000100000 (ts 1744000100000) renomme messages_predefinis
    // en _legacy_messages_predefinis et le remplace par auto_message (V2).
    // Si la table a déjà été renommée, on cible _legacy_messages_predefinis ; sinon messages_predefinis.
    const hasMsgsV1 = await qr.hasTable('messages_predefinis');
    const hasMsgsLegacy = await qr.hasTable('_legacy_messages_predefinis');
    const msgTable = hasMsgsV1 ? 'messages_predefinis' : hasMsgsLegacy ? '_legacy_messages_predefinis' : null;

    if (msgTable) {
      // 1. Étendre l'enum trigger_type pour ajouter 'window_reminder'
      await qr.query(`
        ALTER TABLE \`${msgTable}\`
          MODIFY COLUMN \`trigger_type\` ENUM(
            'sequence','no_response','out_of_hours','reopened','queue_wait',
            'keyword','client_type','inactivity','on_assign','window_reminder'
          ) NOT NULL DEFAULT 'sequence'
      `);

      // 2. Colonne window_reminder_target
      if (!(await this.columnExists(qr, msgTable, 'window_reminder_target'))) {
        await qr.query(`
          ALTER TABLE \`${msgTable}\`
            ADD COLUMN \`window_reminder_target\` ENUM('with_replies','no_replies')
            NULL DEFAULT NULL
            AFTER \`client_type_target\`
        `);
      }
    }

    // 3. Colonne last_window_reminder_sent_at sur whatsapp_chat
    if (!(await this.columnExists(qr, 'whatsapp_chat', 'last_window_reminder_sent_at'))) {
      await qr.query(`
        ALTER TABLE \`whatsapp_chat\`
          ADD COLUMN \`last_window_reminder_sent_at\` DATETIME NULL DEFAULT NULL
      `);
    }

    // 4. Index sur whatsapp_chat pour le job J
    if (!(await this.indexExists(qr, 'whatsapp_chat', 'IDX_chat_window_reminder'))) {
      await qr.query(`
        CREATE INDEX \`IDX_chat_window_reminder\`
          ON \`whatsapp_chat\` (\`is_ctwa\`, \`last_client_message_at\`, \`last_window_reminder_sent_at\`)
      `);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.indexExists(qr, 'whatsapp_chat', 'IDX_chat_window_reminder')) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` DROP INDEX \`IDX_chat_window_reminder\``);
    }
    if (await this.columnExists(qr, 'whatsapp_chat', 'last_window_reminder_sent_at')) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`last_window_reminder_sent_at\``);
    }
    if (await this.columnExists(qr, 'messages_predefinis', 'window_reminder_target')) {
      await qr.query(`ALTER TABLE \`messages_predefinis\` DROP COLUMN \`window_reminder_target\``);
    }
    // Retirer window_reminder de l'enum
    await qr.query(`
      ALTER TABLE \`messages_predefinis\`
        MODIFY COLUMN \`trigger_type\` ENUM(
          'sequence','no_response','out_of_hours','reopened','queue_wait',
          'keyword','client_type','inactivity','on_assign'
        ) NOT NULL DEFAULT 'sequence'
    `);
  }
}
