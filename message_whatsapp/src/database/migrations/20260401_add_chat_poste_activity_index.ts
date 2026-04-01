import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: index hot-path pour la liste des conversations d'un poste
 *
 * `findByPosteId()` trie par `last_activity_at DESC` — sans cet index MySQL
 * fait un full-scan + filesort sur toute la table à chaque connexion d'un agent.
 */
export class AddChatPosteActivityIndex1743465600001 implements MigrationInterface {
  name = 'AddChatPosteActivityIndex1743465600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.indexExists(queryRunner, 'whatsapp_chat', 'IDX_chat_poste_activity'))) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD INDEX \`IDX_chat_poste_activity\` (\`poste_id\`, \`last_activity_at\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner, 'whatsapp_chat', 'IDX_chat_poste_activity')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` DROP INDEX \`IDX_chat_poste_activity\``,
      );
    }
  }

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`,
      [indexName],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
