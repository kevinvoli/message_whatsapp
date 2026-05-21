import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationForeignKey1779580800002 implements MigrationInterface {
  name = 'AddApplicationForeignKey1779580800002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\`
       ADD CONSTRAINT \`FK_whapi_channels_application_id\`
       FOREIGN KEY (\`application_id\`) REFERENCES \`messaging_applications\` (\`id\`)
       ON DELETE SET NULL ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` DROP FOREIGN KEY \`FK_whapi_channels_application_id\``,
    );
  }
}
