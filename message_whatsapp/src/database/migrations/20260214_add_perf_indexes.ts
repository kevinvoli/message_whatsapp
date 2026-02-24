import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerfIndexes1739560000011 implements MigrationInterface {
  name = 'AddPerfIndexes1739560000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('whatsapp_chat')) {
      await this.addIndexIfMissing(
        queryRunner,
        'whatsapp_chat',
        'IDX_whatsapp_chat_poste_last_activity',
        'INDEX',
        '`poste_id`, `last_activity_at`',
      );
    }

    if (await queryRunner.hasTable('whatsapp_message')) {
      await this.addIndexIfMissing(
        queryRunner,
        'whatsapp_message',
        'IDX_whatsapp_message_chat_createdAt',
        'INDEX',
        '`chat_id`, `createdAt`',
      );
      await this.addIndexIfMissing(
        queryRunner,
        'whatsapp_message',
        'IDX_whatsapp_message_chat_timestamp',
        'INDEX',
        '`chat_id`, `timestamp`',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('whatsapp_message')) {
      await this.dropIndexIfExists(
        queryRunner,
        'whatsapp_message',
        'IDX_whatsapp_message_chat_timestamp',
      );
      await this.dropIndexIfExists(
        queryRunner,
        'whatsapp_message',
        'IDX_whatsapp_message_chat_createdAt',
      );
    }

    if (await queryRunner.hasTable('whatsapp_chat')) {
      await this.dropIndexIfExists(
        queryRunner,
        'whatsapp_chat',
        'IDX_whatsapp_chat_poste_last_activity',
      );
    }
  }

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`,
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    indexType: 'INDEX' | 'UNIQUE',
    columns: string,
  ): Promise<void> {
    const exists = await this.indexExists(queryRunner, table, indexName);
    if (!exists) {
      const keyword = indexType === 'UNIQUE' ? 'ADD UNIQUE KEY' : 'ADD INDEX';
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ${keyword} \`${indexName}\` (${columns})`,
      );
    }
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<void> {
    const exists = await this.indexExists(queryRunner, table, indexName);
    if (exists) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``,
      );
    }
  }
}
