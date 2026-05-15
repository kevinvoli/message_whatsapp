import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaToCampaignLink1778803200002 implements MigrationInterface {
  name = 'AddMediaToCampaignLink1778803200002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE campaign_link
      ADD COLUMN media_asset_id VARCHAR(36) NULL,
      ADD CONSTRAINT fk_campaign_link_media_asset
        FOREIGN KEY (media_asset_id) REFERENCES media_asset(id)
        ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaign_link DROP FOREIGN KEY fk_campaign_link_media_asset`,
    );
    await queryRunner.query(
      `ALTER TABLE campaign_link DROP COLUMN media_asset_id`,
    );
  }
}
