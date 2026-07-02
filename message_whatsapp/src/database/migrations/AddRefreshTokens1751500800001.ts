import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokens1751500800001 implements MigrationInterface {
  name = 'AddRefreshTokens1751500800001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id VARCHAR(36) NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        commercial_id VARCHAR(36) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME NULL,
        PRIMARY KEY (id),
        INDEX idx_refresh_token_hash (token_hash),
        INDEX idx_refresh_commercial (commercial_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
  }
}
