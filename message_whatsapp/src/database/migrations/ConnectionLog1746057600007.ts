import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConnectionLog1746057600007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      CREATE TABLE IF NOT EXISTS \`messaging_connection_log\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`user_type\` enum('commercial','admin') NOT NULL,
        \`login_at\` datetime NOT NULL,
        \`logout_at\` datetime NULL DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_conn_log_user\` (\`user_id\`, \`user_type\`, \`login_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`messaging_connection_log\``,
    );
  }
}
