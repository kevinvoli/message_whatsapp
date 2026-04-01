import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supprime l'entrée cron_config 'meta-token-refresh' de la base de données.
 * Le renouvellement automatique des tokens Meta est désactivé.
 */
export class RemoveMetaTokenCron1743465600002 implements MigrationInterface {
  name = 'RemoveMetaTokenCron1743465600002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('cron_config')) {
      await queryRunner.query(
        `DELETE FROM \`cron_config\` WHERE \`key\` = 'meta-token-refresh'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('cron_config')) {
      await queryRunner.query(`
        INSERT IGNORE INTO \`cron_config\`
          (\`key\`, \`label\`, \`description\`, \`enabled\`, \`schedule_type\`, \`cron_expression\`, \`ttl_days\`)
        VALUES
          ('meta-token-refresh', 'Refresh tokens Meta / Messenger / Instagram',
           'Renouvelle automatiquement les tokens Meta qui expirent dans moins de N jours.',
           1, 'cron', '0 3 * * *', 7)
      `);
    }
  }
}
