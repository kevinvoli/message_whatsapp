import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexPlanning1778716800009 implements MigrationInterface {
  name = 'OptimisationIndexPlanning1778716800009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`work_schedule\` ADD INDEX \`IDX_ws_commercial_active\` (\`commercial_id\`, \`is_active\`), ADD INDEX \`IDX_ws_group_active_day\` (\`group_id\`, \`day_of_week\`, \`is_active\`)`);
    await queryRunner.query(`ALTER TABLE \`commercial_session\` ADD INDEX \`IDX_sess_commercial_connected\` (\`commercial_id\`, \`connected_at\`)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`work_schedule\` DROP INDEX \`IDX_ws_commercial_active\``);
    await queryRunner.query(`ALTER TABLE \`work_schedule\` DROP INDEX \`IDX_ws_group_active_day\``);
    await queryRunner.query(`ALTER TABLE \`commercial_session\` DROP INDEX \`IDX_sess_commercial_connected\``);
  }
}
