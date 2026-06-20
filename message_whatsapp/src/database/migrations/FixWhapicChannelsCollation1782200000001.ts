import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWhapicChannelsCollation1782200000001 implements MigrationInterface {
  name = 'FixWhapicChannelsCollation1782200000001';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    // AddApplicationForeignKey1779580800002 a converti whapi_channels en utf8mb4_unicode_ci.
    // Le JOIN TypeORM whapi_channels.poste_id = whatsapp_poste.id échoue car
    // whatsapp_poste est en utf8mb4_general_ci (ER_CANT_AGGREGATE_2COLLATIONS errno 1267).
    // On normalise les deux tables vers utf8mb4_general_ci pour la cohérence globale.
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
    );
    await queryRunner.query(
      'ALTER TABLE `messaging_applications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
    );
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Pas de rollback : revenir en unicode_ci recréerait le bug
  }
}
