import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixConvertiUnreadCount1748995200003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remettre à 0 les conversations 'converti' — exclues de la liste commerciale,
    // elles ne doivent pas afficher de badge rouge dans la liste admin non plus.
    await queryRunner.query(`
      UPDATE whatsapp_chat
      SET unread_count = 0
      WHERE status = 'converti'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irréversible — les valeurs originales ne sont pas conservées
  }
}
