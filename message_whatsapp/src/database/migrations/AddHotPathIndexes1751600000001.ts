import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHotPathIndexes1751600000001 implements MigrationInterface {
  name = 'AddHotPathIndexes1751600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // whatsapp_chat — dispatcher + frontend par poste/statut
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'idx_chat_poste_status',
      '`poste_id`, `status`, `deletedAt`',
    );

    // whatsapp_chat — SLA checker : conversations unread éligibles
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'idx_chat_unread',
      '`status`, `unread_count`, `last_client_message_at`',
    );

    // whatsapp_chat — tri par activité récente avec soft-delete
    await this.addIndex(
      queryRunner,
      'whatsapp_chat',
      'idx_chat_last_message',
      '`poste_id`, `last_activity_at`, `deletedAt`',
    );

    // whatsapp_message — historique d'une conversation paginé par date
    await this.addIndex(
      queryRunner,
      'whatsapp_message',
      'idx_msg_chat_created',
      '`chat_id`, `createdAt`, `deletedAt`',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(queryRunner, 'whatsapp_message', 'idx_msg_chat_created');
    await this.dropIndex(queryRunner, 'whatsapp_chat', 'idx_chat_last_message');
    await this.dropIndex(queryRunner, 'whatsapp_chat', 'idx_chat_unread');
    await this.dropIndex(queryRunner, 'whatsapp_chat', 'idx_chat_poste_status');
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

  private async addIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    columns: string,
  ): Promise<void> {
    if (await this.indexExists(queryRunner, table, indexName)) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns}), ALGORITHM=INPLACE, LOCK=NONE`,
    );
  }

  private async dropIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<void> {
    if (!(await this.indexExists(queryRunner, table, indexName))) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``,
    );
  }
}
