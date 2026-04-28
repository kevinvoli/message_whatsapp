import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REL-021 — Champs d'audit annulation + reminded_at sur follow_up
 * Ajoute: reminded_at, cancelled_at, cancelled_by, cancel_reason
 */
export class FollowUpCancelAudit1745942400022 implements MigrationInterface {
  name = 'FollowUpCancelAudit1745942400022';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasRemindedAt = await queryRunner.hasColumn('follow_up', 'reminded_at');
    if (!hasRemindedAt) {
      await queryRunner.query(`
        ALTER TABLE follow_up
          ADD COLUMN reminded_at DATETIME NULL DEFAULT NULL
            AFTER completed_at
      `);
    }

    const hasCancelledAt = await queryRunner.hasColumn('follow_up', 'cancelled_at');
    if (!hasCancelledAt) {
      await queryRunner.query(`
        ALTER TABLE follow_up
          ADD COLUMN cancelled_at  DATETIME     NULL DEFAULT NULL AFTER reminded_at,
          ADD COLUMN cancelled_by  VARCHAR(200) NULL DEFAULT NULL AFTER cancelled_at,
          ADD COLUMN cancel_reason VARCHAR(255) NULL DEFAULT NULL AFTER cancelled_by
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE follow_up
        DROP COLUMN IF EXISTS cancel_reason,
        DROP COLUMN IF EXISTS cancelled_by,
        DROP COLUMN IF EXISTS cancelled_at,
        DROP COLUMN IF EXISTS reminded_at
    `);
  }
}
