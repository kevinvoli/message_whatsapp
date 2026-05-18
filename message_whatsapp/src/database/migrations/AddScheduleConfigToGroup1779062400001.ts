import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduleConfigToGroup1779062400001 implements MigrationInterface {
  name = 'AddScheduleConfigToGroup1779062400001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const workDaysExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'commercial_group'
        AND COLUMN_NAME = 'work_days_count'
    `);
    if (workDaysExists[0].cnt === '0' || workDaysExists[0].cnt === 0) {
      await queryRunner.query(`
        ALTER TABLE \`commercial_group\`
        ADD COLUMN \`work_days_count\` INT NOT NULL DEFAULT 2
      `);
    }

    const firstWorkDayExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'commercial_group'
        AND COLUMN_NAME = 'first_work_day'
    `);
    if (firstWorkDayExists[0].cnt === '0' || firstWorkDayExists[0].cnt === 0) {
      await queryRunner.query(`
        ALTER TABLE \`commercial_group\`
        ADD COLUMN \`first_work_day\` DATE NULL DEFAULT NULL
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const firstWorkDayExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'commercial_group'
        AND COLUMN_NAME = 'first_work_day'
    `);
    if (firstWorkDayExists[0].cnt !== '0' && firstWorkDayExists[0].cnt !== 0) {
      await queryRunner.query(`
        ALTER TABLE \`commercial_group\`
        DROP COLUMN \`first_work_day\`
      `);
    }

    const workDaysExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'commercial_group'
        AND COLUMN_NAME = 'work_days_count'
    `);
    if (workDaysExists[0].cnt !== '0' && workDaysExists[0].cnt !== 0) {
      await queryRunner.query(`
        ALTER TABLE \`commercial_group\`
        DROP COLUMN \`work_days_count\`
      `);
    }
  }
}
