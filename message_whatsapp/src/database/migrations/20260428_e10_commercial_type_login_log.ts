import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E10-T01 — Ajout du type commercial (stagiaire / vendeuse confirmée).
 * E10-T04 — Journal des connexions commerciales.
 */
export class E10CommercialTypeLoginLog1745884800010 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // E10-T01 : type commercial
    const hasType = await queryRunner.hasColumn('whatsapp_commercial', 'commercial_type');
    if (!hasType) {
      await queryRunner.query(`
        ALTER TABLE whatsapp_commercial
          ADD COLUMN commercial_type ENUM('trainee','vendeuse_confirmee','superviseur','admin') NULL DEFAULT NULL
      `);
    }

    // E10-T04 : journal des connexions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS login_log (
        id          CHAR(36)     NOT NULL,
        user_id     VARCHAR(36)  NOT NULL,
        user_name   VARCHAR(200) NULL,
        poste_id    VARCHAR(36)  NULL,
        ip          VARCHAR(45)  NULL,
        device      VARCHAR(255) NULL,
        localisation VARCHAR(200) NULL,
        otp_status  ENUM('none','sent','verified','failed') NOT NULL DEFAULT 'none',
        login_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX IDX_login_log_user    (user_id),
        INDEX IDX_login_log_login_at (login_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS login_log`);

    const hasType = await queryRunner.hasColumn('whatsapp_commercial', 'commercial_type');
    if (hasType) {
      await queryRunner.query(`ALTER TABLE whatsapp_commercial DROP COLUMN commercial_type`);
    }
  }
}
