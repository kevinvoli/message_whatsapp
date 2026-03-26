import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMessageTemplateStatus1743000000001 implements MigrationInterface {
  name = 'CreateMessageTemplateStatus1743000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('message_template_status');
    if (!exists) {
      await queryRunner.query(`
        CREATE TABLE \`message_template_status\` (
          \`id\`              VARCHAR(36)  NOT NULL,
          \`template_name\`   VARCHAR(100) NOT NULL,
          \`language\`        VARCHAR(20)  NOT NULL,
          \`status\`          VARCHAR(20)  NOT NULL DEFAULT 'APPROVED',
          \`quality_score\`   VARCHAR(20)  NULL,
          \`last_checked_at\` TIMESTAMP    NULL,
          \`created_at\`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_template_name_language\` (\`template_name\`, \`language\`)
        ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // Ajouter templateName + language sur messages_predefinis (nullable = rétrocompatible).
    // innodb_strict_mode est désactivé temporairement pour contourner la vérification statique
    // de taille de ligne : la table est déjà en ROW_FORMAT=DYNAMIC et body/conditions sont TEXT/LONGTEXT
    // (stockés hors-page), donc la ligne tient en pratique mais MySQL 5.7+ refuse l'ALTER TABLE
    // avec strict_mode=ON lorsque la somme déclarée des colonnes dépasse 8126 bytes.
    const table = 'messages_predefinis';
    await queryRunner.query(`SET SESSION innodb_strict_mode = OFF`);
    try {
      if (!(await queryRunner.hasColumn(table, 'template_name'))) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`template_name\` VARCHAR(100) NULL AFTER \`body\``,
        );
      }
      if (!(await queryRunner.hasColumn(table, 'template_language'))) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`template_language\` VARCHAR(20) NULL AFTER \`template_name\``,
        );
      }
    } finally {
      await queryRunner.query(`SET SESSION innodb_strict_mode = ON`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'messages_predefinis';
    for (const col of ['template_name', 'template_language']) {
      if (await queryRunner.hasColumn(table, col)) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
      }
    }
    if (await queryRunner.hasTable('message_template_status')) {
      await queryRunner.query(`DROP TABLE \`message_template_status\``);
    }
  }
}
