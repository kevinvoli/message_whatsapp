import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration : optimisation du trafic horaire à l'échelle
 *
 * 1. Colonnes générées virtuelles (MySQL 5.7+ / 8.0 compatible)
 *    - hour_of_day   = HOUR(createdAt)    → GROUP BY mode heure
 *    - day_of_week_n = WEEKDAY(createdAt) → GROUP BY mode jour (0=Lun…6=Dim)
 *
 * 2. Index couvrant principal
 *    IDX_msg_trafic_covering (createdAt, direction, deletedAt)
 *    → élimine les row lookups : SUM(direction) satisfait depuis l'index
 *
 * 3. Index dédié mode heure
 *    IDX_msg_trafic_hour (hour_of_day, createdAt, deletedAt)
 *    → GROUP BY hour_of_day sans function-scan
 *
 * 4. Index dédié mode jour de semaine
 *    IDX_msg_trafic_dow (day_of_week_n, createdAt, deletedAt)
 *    → GROUP BY day_of_week_n sans function-scan
 *
 * Toutes les opérations sont online InnoDB et idempotentes.
 */
export class AddTrafficGroupingIndexes1748995200001 implements MigrationInterface {
  name = 'AddTrafficGroupingIndexes1748995200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) return;

    // ── 1. Colonnes générées virtuelles ───────────────────────────────────────
    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_message'
         AND COLUMN_NAME IN ('hour_of_day', 'day_of_week_n')`,
    );
    const existingCols = new Set((cols as any[]).map((r) => r.COLUMN_NAME));

    if (!existingCols.has('hour_of_day')) {
      await queryRunner.query(`
        ALTER TABLE \`whatsapp_message\`
          ADD COLUMN \`hour_of_day\` TINYINT UNSIGNED
            GENERATED ALWAYS AS (HOUR(\`createdAt\`)) VIRTUAL
            COMMENT 'Heure 0-23, générée virtuellement depuis createdAt'
      `);
    }

    if (!existingCols.has('day_of_week_n')) {
      await queryRunner.query(`
        ALTER TABLE \`whatsapp_message\`
          ADD COLUMN \`day_of_week_n\` TINYINT UNSIGNED
            GENERATED ALWAYS AS (WEEKDAY(\`createdAt\`)) VIRTUAL
            COMMENT 'Jour semaine 0=Lun…6=Dim, généré depuis createdAt'
      `);
    }

    // ── 2. Index couvrant (range + direction sans row lookup) ────────────────
    await this.addIndex(
      queryRunner, 'whatsapp_message', 'IDX_msg_trafic_covering',
      '`createdAt`, `direction`, `deletedAt`',
    );

    // ── 3. Index mode heure ───────────────────────────────────────────────────
    await this.addIndex(
      queryRunner, 'whatsapp_message', 'IDX_msg_trafic_hour',
      '`hour_of_day`, `createdAt`, `deletedAt`',
    );

    // ── 4. Index mode jour de semaine ─────────────────────────────────────────
    await this.addIndex(
      queryRunner, 'whatsapp_message', 'IDX_msg_trafic_dow',
      '`day_of_week_n`, `createdAt`, `deletedAt`',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) return;

    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_trafic_dow');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_trafic_hour');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_trafic_covering');

    // Supprimer colonnes dans l'ordre inverse
    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_message'
         AND COLUMN_NAME IN ('hour_of_day', 'day_of_week_n')`,
    );
    const existingCols = new Set((cols as any[]).map((r) => r.COLUMN_NAME));
    if (existingCols.has('day_of_week_n')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP COLUMN \`day_of_week_n\``,
      );
    }
    if (existingCols.has('hour_of_day')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP COLUMN \`hour_of_day\``,
      );
    }
  }

  // ── Helpers idempotents ────────────────────────────────────────────────────

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
