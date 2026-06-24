import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizCommercialFK1750953600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Normaliser commercial_id en CHAR(36) — intégrité FK garantie au niveau service.
    // La contrainte FK n'est pas ajoutée ici car la collation entre quiz_attempt et
    // whatsapp_commercial diffère selon l'environnement ; une migration dédiée peut
    // l'ajouter une fois les collations normalisées.
    await queryRunner.query(`
      ALTER TABLE quiz_attempt
        MODIFY COLUMN commercial_id CHAR(36) NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_attempt
        MODIFY COLUMN commercial_id VARCHAR(255) NOT NULL
    `);
  }
}
