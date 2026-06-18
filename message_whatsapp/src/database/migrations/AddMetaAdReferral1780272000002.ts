import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaAdKpiIndex1780272000002 implements MigrationInterface {
  name = 'AddMetaAdKpiIndex1780272000002';

  private async indexExists(qr: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await qr.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasTable('whatsapp_message'))) return;

    // Index covering pour les requêtes KPI CTWA :
    // filtre sur chat_id (INNER JOIN ctwa_ids), deletedAt IS NULL,
    // direction IN/OUT, puis MIN(timestamp) et commercial_id.
    if (!(await this.indexExists(qr, 'whatsapp_message', 'IDX_msg_ctwa_kpi'))) {
      await qr.query(`
        ALTER TABLE \`whatsapp_message\`
          ADD INDEX \`IDX_msg_ctwa_kpi\`
            (\`chat_id\`, \`deletedAt\`, \`direction\`, \`timestamp\`, \`commercial_id\`)
      `);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasTable('whatsapp_message'))) return;
    if (await this.indexExists(qr, 'whatsapp_message', 'IDX_msg_ctwa_kpi')) {
      await qr.query(`ALTER TABLE \`whatsapp_message\` DROP INDEX \`IDX_msg_ctwa_kpi\``);
    }
  }
}
