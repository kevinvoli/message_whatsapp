import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaCredentialsToChannel1742601600000 implements MigrationInterface {
  name = 'AddMetaCredentialsToChannel1742601600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ajouter meta_app_id si absent
    const [metaAppIdExists] = (await queryRunner.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'whapi_channels'
         AND COLUMN_NAME = 'meta_app_id'`,
    )) as Array<{ cnt: number }>;

    if (Number(metaAppIdExists.cnt) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`whapi_channels\`
         ADD COLUMN \`meta_app_id\` VARCHAR(64) NULL DEFAULT NULL
         AFTER \`token\``,
      );
    }

    // Ajouter meta_app_secret si absent
    const [metaAppSecretExists] = (await queryRunner.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'whapi_channels'
         AND COLUMN_NAME = 'meta_app_secret'`,
    )) as Array<{ cnt: number }>;

    if (Number(metaAppSecretExists.cnt) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`whapi_channels\`
         ADD COLUMN \`meta_app_secret\` VARCHAR(128) NULL DEFAULT NULL
         AFTER \`meta_app_id\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` DROP COLUMN IF EXISTS \`meta_app_secret\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` DROP COLUMN IF EXISTS \`meta_app_id\``,
    );
  }
}
