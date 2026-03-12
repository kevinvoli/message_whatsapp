import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTokenExpiresAtChannel1773284400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whapi_channels',
      new TableColumn({
        name: 'token_expires_at',
        type: 'datetime',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whapi_channels', 'token_expires_at');
  }
}
