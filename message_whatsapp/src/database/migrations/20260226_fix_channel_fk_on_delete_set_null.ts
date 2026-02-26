import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixes channel foreign keys so that deleting a WhapiChannel sets
 * channel_id to NULL on related rows instead of blocking the delete.
 *
 * Tables affected:
 *  - whatsapp_media.channel_id  → whapi_channels.id    (SET NULL)
 *  - whatsapp_chat.channel_id   → whapi_channels.*     (SET NULL, if FK exists)
 *  - whatsapp_message.channel_id → whapi_channels.*    (SET NULL, if FK exists)
 */
export class FixChannelFkOnDeleteSetNull1740604800003
  implements MigrationInterface
{
  name = 'FixChannelFkOnDeleteSetNull1740604800003';

  // ────────────────────────────────────────────────────────────────────────────
  // Helper: drop + re-add a FK with ON DELETE SET NULL
  // ────────────────────────────────────────────────────────────────────────────
  private async fixFk(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    referencedTable: string,
    referencedColumn: string,
  ): Promise<void> {
    // Find the FK name in information_schema (works on any MySQL/MariaDB env)
    const rows: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA   = DATABASE()
         AND TABLE_NAME     = ?
         AND COLUMN_NAME    = ?
         AND REFERENCED_TABLE_NAME = ?
       LIMIT 1`,
      [table, column, referencedTable],
    );

    if (!rows.length) {
      // FK does not exist in this environment — nothing to fix
      return;
    }

    const fkName = rows[0].CONSTRAINT_NAME;

    await queryRunner.query(
      `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fkName}\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`${table}\`
       ADD CONSTRAINT \`${fkName}\`
       FOREIGN KEY (\`${column}\`)
       REFERENCES \`${referencedTable}\`(\`${referencedColumn}\`)
       ON DELETE SET NULL
       ON UPDATE NO ACTION`,
    );
  }

  private async restoreFk(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    referencedTable: string,
    referencedColumn: string,
  ): Promise<void> {
    const rows: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA   = DATABASE()
         AND TABLE_NAME     = ?
         AND COLUMN_NAME    = ?
         AND REFERENCED_TABLE_NAME = ?
       LIMIT 1`,
      [table, column, referencedTable],
    );

    if (!rows.length) return;

    const fkName = rows[0].CONSTRAINT_NAME;

    await queryRunner.query(
      `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fkName}\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`${table}\`
       ADD CONSTRAINT \`${fkName}\`
       FOREIGN KEY (\`${column}\`)
       REFERENCES \`${referencedTable}\`(\`${referencedColumn}\`)
       ON DELETE NO ACTION
       ON UPDATE NO ACTION`,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {
    // whatsapp_media.channel_id → whapi_channels.id  (the FK that caused the error)
    await this.fixFk(
      queryRunner,
      'whatsapp_media',
      'channel_id',
      'whapi_channels',
      'id',
    );

    // whatsapp_chat.channel_id → whapi_channels.channel_id  (preventive)
    await this.fixFk(
      queryRunner,
      'whatsapp_chat',
      'channel_id',
      'whapi_channels',
      'channel_id',
    );

    // whatsapp_message.channel_id est NOT NULL → ON DELETE SET NULL impossible en MySQL.
    // Cette FK reste ON DELETE RESTRICT (comportement actuel).
    // Si la suppression de canal avec messages est requise,
    // il faudra d'abord réassigner les messages ou rendre la colonne nullable.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.restoreFk(
      queryRunner,
      'whatsapp_media',
      'channel_id',
      'whapi_channels',
      'id',
    );
    await this.restoreFk(
      queryRunner,
      'whatsapp_chat',
      'channel_id',
      'whapi_channels',
      'channel_id',
    );
  }
}
