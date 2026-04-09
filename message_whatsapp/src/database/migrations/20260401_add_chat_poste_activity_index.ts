import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: index hot-path pour la liste des conversations d'un poste.
 * Keyset pagination — critique pour la performance à l'échelle.
 *
 * Opération online InnoDB (ALGORITHM=INPLACE) — pas de lock sur lecture/écriture.
 * Idempotente : vérifie l'existence avant de créer.
 */
export class AddChatPosteActivityIndex1743465600001 implements MigrationInterface {
  name = 'AddChatPosteActivityIndex1743465600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [rows] = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'whatsapp_chat'
         AND index_name = 'IDX_chat_poste_activity'`,
    );
    if (Number(rows.cnt) > 0) return;

    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\`
       ADD INDEX \`IDX_chat_poste_activity\` (\`poste_id\`, \`last_activity_at\` DESC, \`chat_id\` DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [rows] = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'whatsapp_chat'
         AND index_name = 'IDX_chat_poste_activity'`,
    );
    if (Number(rows.cnt) === 0) return;

    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` DROP INDEX \`IDX_chat_poste_activity\``,
    );
  }
}
