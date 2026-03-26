import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneNormalizedToContact1743000000002 implements MigrationInterface {
  name = 'AddPhoneNormalizedToContact1743000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'contact';

    // 1. Ajouter la colonne nullable
    if (!(await queryRunner.hasColumn(table, 'phone_normalized'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`phone_normalized\` VARCHAR(30) NULL AFTER \`contact\``,
      );
    }

    // 2. Backfill : normalisation simple (retirer espaces/tirets, ajouter + si absent)
    //    Les cas 0XXXXXXXXX algériens ne sont pas gérés en SQL pur — laisser NULL pour eux.
    await queryRunner.query(`
      UPDATE \`${table}\`
      SET \`phone_normalized\` = CASE
        WHEN \`contact\` LIKE '+%'
          THEN REGEXP_REPLACE(\`contact\`, '[^0-9+]', '')
        ELSE CONCAT('+', REGEXP_REPLACE(\`contact\`, '[^0-9]', ''))
      END
      WHERE \`phone_normalized\` IS NULL
        AND \`contact\` IS NOT NULL
        AND \`contact\` != ''
    `);

    // 3. Ajouter l'index unique si absent
    //    ALTER IGNORE a été supprimé en MySQL 5.7 — on vérifie les doublons avant de créer l'index
    const indexes = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = 'UQ_contact_phone_normalized'`,
    );
    if (!indexes || indexes.length === 0) {
      // Vérifier les doublons sur les valeurs non-nulles
      const [dupCheck] = await queryRunner.query(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT \`phone_normalized\`
          FROM \`${table}\`
          WHERE \`phone_normalized\` IS NOT NULL
          GROUP BY \`phone_normalized\`
          HAVING COUNT(*) > 1
        ) AS dups
      `);
      if (!dupCheck || Number(dupCheck['cnt']) === 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`UQ_contact_phone_normalized\` (\`phone_normalized\`)`,
        );
      } else {
        // Des doublons existent : créer un index non-unique pour ne pas bloquer
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD INDEX \`IDX_contact_phone_normalized\` (\`phone_normalized\`)`,
        );
        console.warn(
          `[Migration] UQ_contact_phone_normalized non créé : ${dupCheck['cnt']} doublon(s) détecté(s) sur phone_normalized. Corrigez manuellement puis relancez la migration.`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'contact';
    for (const indexName of ['UQ_contact_phone_normalized', 'IDX_contact_phone_normalized']) {
      const rows = await queryRunner.query(
        `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`,
      );
      if (rows && rows.length > 0) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
      }
    }
    if (await queryRunner.hasColumn(table, 'phone_normalized')) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`phone_normalized\``);
    }
  }
}
