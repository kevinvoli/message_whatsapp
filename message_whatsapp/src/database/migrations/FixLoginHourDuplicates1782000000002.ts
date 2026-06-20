import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLoginHourDuplicates1782000000002 implements MigrationInterface {
  name = 'FixLoginHourDuplicates1782000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Supprime les entrées dupliquées LOGIN_HOUR_START / LOGIN_HOUR_END
    // en conservant la ligne avec le plus grand id (la plus récente).
    // Idempotent : sans doublon, la sous-requête retourne 0 lignes.
    await queryRunner.query(`
      DELETE s1 FROM \`system_configs\` s1
      INNER JOIN \`system_configs\` s2
        ON s1.config_key = s2.config_key
       AND s1.id < s2.id
      WHERE s1.config_key IN ('LOGIN_HOUR_START', 'LOGIN_HOUR_END')
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Irréversible : les doublons supprimés étaient redondants.
  }
}
