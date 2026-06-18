import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixMetaAdReferralDefaults1780358400001 implements MigrationInterface {
  name = 'FixMetaAdReferralDefaults1780358400001';

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasTable('meta_ad_referral'))) return;

    // Ajouter DEFAULT '' sur source_type et source_id pour eviter
    // ER_NO_DEFAULT_FOR_FIELD quand Meta envoie un referral incomplet.
    await qr.query(`
      ALTER TABLE \`meta_ad_referral\`
        MODIFY COLUMN \`source_type\` VARCHAR(50) NOT NULL DEFAULT '',
        MODIFY COLUMN \`source_id\`   VARCHAR(255) NOT NULL DEFAULT ''
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasTable('meta_ad_referral'))) return;

    await qr.query(`
      ALTER TABLE \`meta_ad_referral\`
        MODIFY COLUMN \`source_type\` VARCHAR(50) NOT NULL,
        MODIFY COLUMN \`source_id\`   VARCHAR(255) NOT NULL
    `);
  }
}
