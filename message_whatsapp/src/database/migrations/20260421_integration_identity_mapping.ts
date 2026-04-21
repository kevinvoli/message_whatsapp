import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationIdentityMapping1745200000011 implements MigrationInterface {
  name = 'IntegrationIdentityMapping1745200000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`client_identity_mapping\` (
        \`id\`               CHAR(36)      NOT NULL,
        \`contact_id\`       CHAR(36)      NOT NULL,
        \`external_id\`      INT           NOT NULL,
        \`phone_normalized\` VARCHAR(30)   NULL,
        \`created_at\`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_cim_contact_id\`  (\`contact_id\`),
        UNIQUE KEY \`UQ_cim_external_id\` (\`external_id\`),
        INDEX \`IDX_cim_phone\`           (\`phone_normalized\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`commercial_identity_mapping\` (
        \`id\`               CHAR(36)      NOT NULL,
        \`commercial_id\`    CHAR(36)      NOT NULL,
        \`external_id\`      INT           NOT NULL,
        \`commercial_name\`  VARCHAR(100)  NULL,
        \`created_at\`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_coim_commercial_id\` (\`commercial_id\`),
        UNIQUE KEY \`UQ_coim_external_id\`   (\`external_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`commercial_identity_mapping\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`client_identity_mapping\``);
  }
}
