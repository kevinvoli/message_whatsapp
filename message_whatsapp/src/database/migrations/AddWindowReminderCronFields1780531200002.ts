import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWindowReminderCronFields1780531200002 implements MigrationInterface {
  name = 'AddWindowReminderCronFields1780531200002';

  private async columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const [row] = await qr.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    ) as Array<{ cnt: number }>;
    return Number(row.cnt) > 0;
  }

  private async addCol(qr: QueryRunner, table: string, col: string, def: string): Promise<void> {
    if (!(await this.columnExists(qr, table, col))) {
      await qr.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
    }
  }

  public async up(qr: QueryRunner): Promise<void> {
    // 1. Ajouter les 6 colonnes sur cron_config
    await this.addCol(qr, 'cron_config', 'window_reminder_normal_start_min', 'INT NULL');
    await this.addCol(qr, 'cron_config', 'window_reminder_normal_end_min',   'INT NULL');
    await this.addCol(qr, 'cron_config', 'window_reminder_ctwa_start_min',   'INT NULL');
    await this.addCol(qr, 'cron_config', 'window_reminder_ctwa_end_min',     'INT NULL');
    await this.addCol(qr, 'cron_config', 'window_reminder_min_replies',      'INT NULL');
    await this.addCol(qr, 'cron_config', 'ttl_days_ctwa',                    'INT NULL');

    // 2. Seed : entrée de config pour le trigger J
    const [existing] = await qr.query(
      `SELECT id FROM \`cron_config\` WHERE \`key\` = 'window-reminder-auto-message' LIMIT 1`,
    ) as Array<{ id: string }>;

    if (!existing) {
      await qr.query(`
        INSERT INTO \`cron_config\`
          (id, \`key\`, label, description, enabled, schedule_type,
           window_reminder_normal_start_min, window_reminder_normal_end_min,
           window_reminder_ctwa_start_min,   window_reminder_ctwa_end_min,
           window_reminder_min_replies)
        VALUES (
          UUID(),
          'window-reminder-auto-message',
          'J — Réactivation avant expiration',
          'Envoie un message de réactivation avant fermeture automatique (normal: 10min–2h, CTWA: 10min–4h avant autoCloseAt)',
          true,
          'config',
          10, 120, 10, 240, 1
        )
      `);
    }

    // 3. Seed ttl_days_ctwa sur read-only-enforcement
    await qr.query(`
      UPDATE \`cron_config\`
        SET ttl_days_ctwa = 72
      WHERE \`key\` = 'read-only-enforcement'
        AND (ttl_days_ctwa IS NULL OR ttl_days_ctwa = 0)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM \`cron_config\` WHERE \`key\` = 'window-reminder-auto-message'`);
    await qr.query(`UPDATE \`cron_config\` SET ttl_days_ctwa = NULL WHERE \`key\` = 'read-only-enforcement'`);

    for (const col of [
      'window_reminder_normal_start_min',
      'window_reminder_normal_end_min',
      'window_reminder_ctwa_start_min',
      'window_reminder_ctwa_end_min',
      'window_reminder_min_replies',
      'ttl_days_ctwa',
    ]) {
      if (await this.columnExists(qr, 'cron_config', col)) {
        await qr.query(`ALTER TABLE \`cron_config\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
