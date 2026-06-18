import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase7ContactPortfolio1745100000002 implements MigrationInterface {
  name = 'Phase7ContactPortfolio1745100000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    // contact pre-dates migrations — use raw SQL to avoid TypeORM cache issues
    if (!(await queryRunner.hasColumn('contact', 'portfolio_owner_id'))) {
      await queryRunner.query('ALTER TABLE `contact` ADD COLUMN `portfolio_owner_id` CHAR(36) NULL DEFAULT NULL');
    }
    if (!(await queryRunner.hasColumn('contact', 'client_category'))) {
      await queryRunner.query(
        `ALTER TABLE \`contact\` ADD COLUMN \`client_category\` ENUM('jamais_commande','commande_sans_livraison','commande_avec_livraison','commande_annulee') NULL DEFAULT NULL`,
      );
    }
    if (!(await queryRunner.hasColumn('contact', 'client_order_summary'))) {
      await queryRunner.query('ALTER TABLE `contact` ADD COLUMN `client_order_summary` JSON NULL');
    }
    if (!(await queryRunner.hasColumn('contact', 'order_client_id'))) {
      await queryRunner.query('ALTER TABLE `contact` ADD COLUMN `order_client_id` INT NULL DEFAULT NULL');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['portfolio_owner_id', 'client_category', 'client_order_summary', 'order_client_id']) {
      if (await queryRunner.hasColumn('contact', col)) {
        await queryRunner.query(`ALTER TABLE \`contact\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
