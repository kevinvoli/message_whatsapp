import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWhapicChannelsCollation1782200000001 implements MigrationInterface {
  name = 'FixWhapicChannelsCollation1782200000001';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    // AddApplicationForeignKey1779580800002 a converti whapi_channels en utf8mb4_unicode_ci.
    // Le JOIN TypeORM whapi_channels.poste_id = whatsapp_poste.id échoue car
    // whatsapp_poste est en utf8mb4_general_ci (ER_CANT_AGGREGATE_2COLLATIONS errno 1267).
    // MariaDB bloque CONVERT TO CHARACTER SET sur une colonne avec FK même avec
    // FOREIGN_KEY_CHECKS=0 — il faut supprimer la FK, convertir, puis la recréer.
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');

    // Supprimer la FK bloquante
    const fkExists = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'whapi_channels'
        AND CONSTRAINT_NAME = 'FK_whapi_channels_application_id'
    `);
    if (parseInt(fkExists[0].cnt, 10) > 0) {
      await queryRunner.query(
        'ALTER TABLE `whapi_channels` DROP FOREIGN KEY `FK_whapi_channels_application_id`',
      );
    }

    // Convertir les deux tables vers utf8mb4_general_ci
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
    );
    await queryRunner.query(
      'ALTER TABLE `messaging_applications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
    );

    // Recréer la FK
    await queryRunner.query(`
      ALTER TABLE \`whapi_channels\`
        ADD CONSTRAINT \`FK_whapi_channels_application_id\`
        FOREIGN KEY (\`application_id\`) REFERENCES \`messaging_applications\` (\`id\`)
        ON DELETE SET NULL ON UPDATE CASCADE
    `);

    await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Pas de rollback : revenir en unicode_ci recréerait le bug
  }
}
