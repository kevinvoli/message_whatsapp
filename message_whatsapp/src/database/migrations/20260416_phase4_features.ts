import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — Migrations :
 *   - whatsapp_template  (P4.2 — HSM Templates)
 *   - whatsapp_broadcast          (P4.3 — Broadcasts)
 *   - whatsapp_broadcast_recipient (P4.3 — Destinataires)
 */
export class Phase4Features1744761600002 implements MigrationInterface {
  name = 'Phase4Features1744761600002';

  async up(qr: QueryRunner): Promise<void> {
    // ── whatsapp_template ─────────────────────────────────────────────────────
    const hasTemplate = await qr.hasTable('whatsapp_template');
    if (!hasTemplate) {
      await qr.query(`
        CREATE TABLE whatsapp_template (
          id                 CHAR(36)     NOT NULL PRIMARY KEY,
          tenant_id          CHAR(36)     NOT NULL,
          channel_id         VARCHAR(100) NULL,
          name               VARCHAR(512) NOT NULL,
          category           ENUM('MARKETING','UTILITY','AUTHENTICATION') NOT NULL DEFAULT 'UTILITY',
          language           VARCHAR(20)  NOT NULL DEFAULT 'fr',
          status             ENUM('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','IN_APPEAL','FLAGGED','DELETED') NOT NULL DEFAULT 'PENDING',
          rejected_reason    VARCHAR(512) NULL,
          meta_template_id   VARCHAR(100) NULL,
          header_type        ENUM('TEXT','IMAGE','VIDEO','DOCUMENT') NULL,
          header_content     TEXT         NULL,
          body_text          TEXT         NOT NULL,
          footer_text        VARCHAR(60)  NULL,
          parameters         JSON         NULL,
          buttons            JSON         NULL,
          created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX IDX_tpl_tenant_status (tenant_id, status),
          INDEX IDX_tpl_meta_id       (meta_template_id),
          UNIQUE KEY UQ_tpl_tenant_name_lang (tenant_id, name, language)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // ── whatsapp_broadcast ────────────────────────────────────────────────────
    const hasBroadcast = await qr.hasTable('whatsapp_broadcast');
    if (!hasBroadcast) {
      await qr.query(`
        CREATE TABLE whatsapp_broadcast (
          id              CHAR(36)     NOT NULL PRIMARY KEY,
          tenant_id       CHAR(36)     NOT NULL,
          name            VARCHAR(255) NOT NULL,
          template_id     CHAR(36)     NOT NULL,
          channel_id      VARCHAR(100) NOT NULL,
          status          ENUM('DRAFT','SCHEDULED','RUNNING','PAUSED','COMPLETED','CANCELLED','FAILED') NOT NULL DEFAULT 'DRAFT',
          scheduled_at    TIMESTAMP    NULL,
          started_at      TIMESTAMP    NULL,
          completed_at    TIMESTAMP    NULL,
          total_count     INT          NOT NULL DEFAULT 0,
          sent_count      INT          NOT NULL DEFAULT 0,
          delivered_count INT          NOT NULL DEFAULT 0,
          read_count      INT          NOT NULL DEFAULT 0,
          failed_count    INT          NOT NULL DEFAULT 0,
          created_by      VARCHAR(100) NULL,
          created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX IDX_broadcast_tenant_status (tenant_id, status),
          INDEX IDX_broadcast_scheduled     (scheduled_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // ── whatsapp_broadcast_recipient ──────────────────────────────────────────
    const hasRecipient = await qr.hasTable('whatsapp_broadcast_recipient');
    if (!hasRecipient) {
      await qr.query(`
        CREATE TABLE whatsapp_broadcast_recipient (
          id                  CHAR(36)     NOT NULL PRIMARY KEY,
          broadcast_id        CHAR(36)     NOT NULL,
          phone               VARCHAR(20)  NOT NULL,
          variables           JSON         NULL,
          status              ENUM('PENDING','SENT','DELIVERED','READ','FAILED','OPTED_OUT') NOT NULL DEFAULT 'PENDING',
          error_message       VARCHAR(255) NULL,
          provider_message_id VARCHAR(100) NULL,
          sent_at             TIMESTAMP    NULL,
          created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX IDX_bcr_broadcast_id   (broadcast_id),
          INDEX IDX_bcr_status         (broadcast_id, status),
          UNIQUE KEY UQ_bcr_broadcast_phone (broadcast_id, phone),
          CONSTRAINT FK_bcr_broadcast FOREIGN KEY (broadcast_id)
            REFERENCES whatsapp_broadcast(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS whatsapp_broadcast_recipient');
    await qr.query('DROP TABLE IF EXISTS whatsapp_broadcast');
    await qr.query('DROP TABLE IF EXISTS whatsapp_template');
  }
}
