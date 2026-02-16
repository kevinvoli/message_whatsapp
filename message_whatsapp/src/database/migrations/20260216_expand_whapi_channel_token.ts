import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandWhapiChannelToken1739712000000 implements MigrationInterface {
  name = 'ExpandWhapiChannelToken1739712000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tokenIndexes = (await queryRunner.query(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'whapi_channels'
         AND COLUMN_NAME = 'token'
         AND NON_UNIQUE = 0`,
    )) as Array<{ INDEX_NAME: string }>;

    for (const row of tokenIndexes) {
      const indexName = row.INDEX_NAME;
      if (!indexName || indexName === 'PRIMARY') {
        continue;
      }
      await queryRunner.query(
        `ALTER TABLE \`whapi_channels\` DROP INDEX \`${indexName}\``,
      );
    }

    await queryRunner.query(
      'ALTER TABLE `whapi_channels` MODIFY COLUMN `token` TEXT NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` MODIFY COLUMN `token` varchar(255) NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` ADD UNIQUE KEY `IDX_c8643717222c926fcd00bc70d3` (`token`)',
    );
  }
}
