import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGroupScheduleDay1779062400002 implements MigrationInterface {
  name = 'CreateGroupScheduleDay1779062400002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'group_schedule_day'
    `);
    if (tableExists[0].cnt === '0' || tableExists[0].cnt === 0) {
      await queryRunner.query(`
        CREATE TABLE \`group_schedule_day\` (
          \`id\` CHAR(36) NOT NULL,
          \`group_id\` CHAR(36) NOT NULL,
          \`date\` DATE NOT NULL,
          \`is_work_day\` TINYINT(1) NOT NULL DEFAULT 0,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_group_schedule_day\` (\`group_id\`, \`date\`),
          INDEX \`IDX_group_schedule_date\` (\`date\`),
          INDEX \`IDX_group_schedule_group\` (\`group_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`group_schedule_day\``);
  }
}
