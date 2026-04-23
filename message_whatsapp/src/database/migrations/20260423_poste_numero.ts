import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class PosteNumero1745856000004 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const table = 'whatsapp_poste';
    if (await qr.hasColumn(table, 'numero_poste')) return;
    await qr.addColumn(
      table,
      new TableColumn({
        name:       'numero_poste',
        type:       'int',
        isNullable: true,
        default:    null,
        comment:    'Identifiant numérique du poste sur la plateforme GICOP',
      }),
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('whatsapp_poste', 'numero_poste')) {
      await qr.dropColumn('whatsapp_poste', 'numero_poste');
    }
  }
}
