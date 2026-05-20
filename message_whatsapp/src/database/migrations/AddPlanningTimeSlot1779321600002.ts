import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanningTimeSlot1779321600002 implements MigrationInterface {
  name = 'AddPlanningTimeSlot1779321600002';

  async up(qr: QueryRunner): Promise<void> {
    const table = await qr.getTable('commercial_planning');
    if (table && !table.columns.find((c) => c.name === 'time_slot')) {
      await qr.query(`
        ALTER TABLE \`commercial_planning\`
          ADD COLUMN \`time_slot\` ENUM('full','morning','afternoon') NOT NULL DEFAULT 'full'
          AFTER \`type\`
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE \`commercial_planning\` DROP COLUMN \`time_slot\``);
  }
}
