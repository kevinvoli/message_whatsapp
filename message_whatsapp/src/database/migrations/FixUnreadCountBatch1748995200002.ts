import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUnreadCountBatch1748995200002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Forcer unread_count = 0 pour toutes les conversations fermées
    await queryRunner.query(`
      UPDATE whatsapp_chat
      SET unread_count = 0
      WHERE status = 'fermé'
    `);

    // 2. Recalculer unread_count pour toutes les conversations actives
    //    Aligne la colonne DB sur status IN ('sent', 'delivered') (fix US-B1)
    await queryRunner.query(`
      UPDATE whatsapp_chat c
      SET c.unread_count = (
        SELECT COUNT(*)
        FROM whatsapp_message m
        WHERE m.chat_id = c.chat_id
          AND m.from_me = 0
          AND m.status IN ('sent', 'delivered')
          AND m.deleted_at IS NULL
      )
      WHERE c.status != 'fermé'
        AND c.deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migration de données intentionnellement irréversible
    // Le recalcul inverse n'est pas possible sans connaître les valeurs d'origine
  }
}
