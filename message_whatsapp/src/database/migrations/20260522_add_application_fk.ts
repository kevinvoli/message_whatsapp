import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationForeignKey1779580800002 implements MigrationInterface {
  name = 'AddApplicationForeignKey1779580800002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      // Normalise les collations avant d'ajouter la FK (errno 150 si mismatch general_ci/unicode_ci)
      await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');
      await queryRunner.query(
        'ALTER TABLE `messaging_applications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      );
      await queryRunner.query(
        'ALTER TABLE `whapi_channels` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      );
      await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
      await queryRunner.query(
        `ALTER TABLE \`whapi_channels\`
         ADD CONSTRAINT \`FK_whapi_channels_application_id\`
         FOREIGN KEY (\`application_id\`) REFERENCES \`messaging_applications\` (\`id\`)
         ON DELETE SET NULL ON UPDATE CASCADE`,
      );
    } catch (e: any) {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
      console.warn('[AddApplicationForeignKey] FK_whapi_channels_application_id ignorée :', e.message);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` DROP FOREIGN KEY \`FK_whapi_channels_application_id\``,
    );
  }
}
