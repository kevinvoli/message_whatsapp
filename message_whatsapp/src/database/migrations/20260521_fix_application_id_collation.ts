import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligne la collation de whapi_channels.application_id sur utf8mb4_unicode_ci
 * pour correspondre à messaging_applications.id.
 *
 * Sans ce correctif, les JOINs TypeORM entre les deux tables échouent avec :
 * ER_CANT_AGGREGATE_2COLLATIONS (utf8mb4_general_ci vs utf8mb4_unicode_ci)
 */
export class FixApplicationIdCollation1779408000002 implements MigrationInterface {
  name = 'FixApplicationIdCollation1779408000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` MODIFY COLUMN `application_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` MODIFY COLUMN `application_id` char(36) NULL DEFAULT NULL',
    );
  }
}
