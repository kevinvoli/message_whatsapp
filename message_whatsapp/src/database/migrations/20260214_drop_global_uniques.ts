import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropGlobalUniques1739560000004 implements MigrationInterface {
  name = 'DropGlobalUniques1739560000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfExists(
      queryRunner,
      'whatsapp_chat',
      'UQ_whatsapp_chat_chat_id',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.addIndexIfMissing(
      queryRunner,
      'whatsapp_chat',
      'UQ_whatsapp_chat_chat_id',
      'UNIQUE',
      '`chat_id`',
    );
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
}
