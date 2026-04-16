import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Phase 3 — Migrations pour les nouvelles fonctionnalités :
 *   - canned_response   (P3.1 — réponses prédéfinies)
 *   - label             (P3.3 — labels définitions)
 *   - chat_label_assignment  (P3.3 — assignations)
 *   - gdpr_optout       (P3.5 — opt-out RGPD)
 */
export class Phase3Features20260416 implements MigrationInterface {
  name = 'Phase3Features20260416';

  async up(qr: QueryRunner): Promise<void> {
    // ── canned_response ────────────────────────────────────────────────────────
    const hasCanned = await qr.hasTable('canned_response');
    if (!hasCanned) {
      await qr.query(`
        CREATE TABLE canned_response (
          id          CHAR(36)     NOT NULL PRIMARY KEY,
          tenant_id   CHAR(36)     NOT NULL,
          poste_id    VARCHAR(100) NULL,
          shortcode   VARCHAR(80)  NOT NULL,
          title       VARCHAR(255) NOT NULL,
          body        TEXT         NOT NULL,
          category    VARCHAR(80)  NULL,
          is_active   TINYINT(1)   NOT NULL DEFAULT 1,
          created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at  TIMESTAMP    NULL,
          INDEX IDX_canned_tenant_poste (tenant_id, poste_id),
          INDEX IDX_canned_shortcode    (tenant_id, shortcode)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // ── label ─────────────────────────────────────────────────────────────────
    const hasLabel = await qr.hasTable('label');
    if (!hasLabel) {
      await qr.query(`
        CREATE TABLE label (
          id          CHAR(36)     NOT NULL PRIMARY KEY,
          tenant_id   CHAR(36)     NOT NULL,
          name        VARCHAR(80)  NOT NULL,
          color       VARCHAR(32)  NOT NULL DEFAULT '#6B7280',
          description VARCHAR(255) NULL,
          is_active   TINYINT(1)   NOT NULL DEFAULT 1,
          created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at  TIMESTAMP    NULL,
          INDEX IDX_label_tenant          (tenant_id),
          UNIQUE KEY UQ_label_tenant_name (tenant_id, name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // ── chat_label_assignment ─────────────────────────────────────────────────
    const hasAssign = await qr.hasTable('chat_label_assignment');
    if (!hasAssign) {
      await qr.query(`
        CREATE TABLE chat_label_assignment (
          id         CHAR(36)     NOT NULL PRIMARY KEY,
          chat_id    VARCHAR(100) NOT NULL,
          label_id   CHAR(36)     NOT NULL,
          created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX IDX_cla_chat_id  (chat_id),
          INDEX IDX_cla_label_id (label_id),
          UNIQUE KEY UQ_cla_chat_label (chat_id, label_id),
          CONSTRAINT FK_cla_label FOREIGN KEY (label_id) REFERENCES label(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // ── gdpr_optout ───────────────────────────────────────────────────────────
    const hasOptout = await qr.hasTable('gdpr_optout');
    if (!hasOptout) {
      await qr.query(`
        CREATE TABLE gdpr_optout (
          id             CHAR(36)     NOT NULL PRIMARY KEY,
          tenant_id      CHAR(36)     NOT NULL,
          phone_number   VARCHAR(100) NOT NULL,
          reason         ENUM('user_request','admin_request','legal_obligation','unsubscribe')
                         NOT NULL DEFAULT 'user_request',
          notes          VARCHAR(255) NULL,
          registered_by  VARCHAR(100) NULL,
          opted_out_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at     TIMESTAMP    NULL,
          revoked_by     VARCHAR(100) NULL,
          INDEX IDX_optout_tenant_phone (tenant_id, phone_number),
          UNIQUE KEY UQ_optout_tenant_phone (tenant_id, phone_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS chat_label_assignment');
    await qr.query('DROP TABLE IF EXISTS label');
    await qr.query('DROP TABLE IF EXISTS canned_response');
    await qr.query('DROP TABLE IF EXISTS gdpr_optout');
  }
}
