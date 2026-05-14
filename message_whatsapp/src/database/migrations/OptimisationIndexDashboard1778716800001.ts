import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexDashboard1778716800001 implements MigrationInterface {
  name = 'OptimisationIndexDashboard1778716800001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`call_log\` ADD INDEX \`IDX_call_log_commercial_createdat\` (\`commercial_id\`, \`createdAt\`)`);
    await queryRunner.query(`ALTER TABLE \`follow_up\` ADD INDEX \`IDX_follow_up_commercial_status_completed\` (\`commercial_id\`, \`status\`, \`completed_at\`)`);
    await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` ADD INDEX \`IDX_chat_conversation_result\` (\`conversation_result\`, \`deleted_at\`)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`call_log\` DROP INDEX \`IDX_call_log_commercial_createdat\``);
    await queryRunner.query(`ALTER TABLE \`follow_up\` DROP INDEX \`IDX_follow_up_commercial_status_completed\``);
    await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` DROP INDEX \`IDX_chat_conversation_result\``);
  }
}
