import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationRestrictionAccess1748649600001
  implements MigrationInterface
{
  name = 'ConversationRestrictionAccess1748649600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable(
      'commercial_conversation_access',
    );
    if (tableExists) return;

    await queryRunner.query(`
      CREATE TABLE commercial_conversation_access (
        id            VARCHAR(36)  NOT NULL PRIMARY KEY,
        commercial_id VARCHAR(36)  NOT NULL,
        chat_id       VARCHAR(255) NOT NULL,
        access_date   DATE         NOT NULL,
        accessed_at   DATETIME     NOT NULL,
        responded_at  DATETIME     NULL,
        response_length INT        NOT NULL DEFAULT 0,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY UQ_cca_commercial_chat_date (commercial_id, chat_id, access_date),
        KEY IDX_cca_commercial_date (commercial_id, access_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS commercial_conversation_access`,
    );
  }
}
