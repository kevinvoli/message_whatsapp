import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexErp1778716800012 implements MigrationInterface {
  name = 'OptimisationIndexErp1778716800012';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`contact\` ADD INDEX \`IDX_contact_order_client_id\` (\`order_client_id\`)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`contact\` DROP INDEX \`IDX_contact_order_client_id\``);
  }
}
