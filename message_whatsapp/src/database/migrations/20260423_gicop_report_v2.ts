import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class GicopReportV21745856000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const table = 'conversation_report';

    const add = async (col: TableColumn) => {
      if (!(await qr.hasColumn(table, col.name))) {
        await qr.addColumn(table, col);
      }
    };

    await add(new TableColumn({ name: 'client_name',           type: 'varchar', length: '200', isNullable: true, default: null }));
    await add(new TableColumn({ name: 'ville',                 type: 'varchar', length: '100', isNullable: true, default: null }));
    await add(new TableColumn({ name: 'commune',               type: 'varchar', length: '100', isNullable: true, default: null }));
    await add(new TableColumn({ name: 'quartier',              type: 'varchar', length: '100', isNullable: true, default: null }));
    await add(new TableColumn({ name: 'product_category',      type: 'varchar', length: '200', isNullable: true, default: null }));
    await add(new TableColumn({ name: 'other_phones',          type: 'text',    isNullable: true }));
    await add(new TableColumn({ name: 'follow_up_at',          type: 'timestamp', isNullable: true, default: null }));
    await add(new TableColumn({ name: 'client_need',           type: 'text',    isNullable: true }));
    await add(new TableColumn({ name: 'interest_score',        type: 'tinyint', isNullable: true, default: null }));
    await add(new TableColumn({ name: 'is_male_not_interested',type: 'tinyint', width: 1, default: '0' }));
  }

  async down(qr: QueryRunner): Promise<void> {
    const table = 'conversation_report';
    const drop = async (name: string) => {
      if (await qr.hasColumn(table, name)) await qr.dropColumn(table, name);
    };
    await drop('client_name');
    await drop('ville');
    await drop('commune');
    await drop('quartier');
    await drop('product_category');
    await drop('other_phones');
    await drop('follow_up_at');
    await drop('client_need');
    await drop('interest_score');
    await drop('is_male_not_interested');
  }
}
