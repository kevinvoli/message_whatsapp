import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatSessionEntity1780531200000 implements MigrationInterface {
  name = 'AddChatSessionEntity1780531200000';

  private async columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const [row] = await qr.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    ) as Array<{ cnt: number }>;
    return Number(row.cnt) > 0;
  }

  private async indexExists(qr: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await qr.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    // 1. Créer la table chat_session
    if (!(await qr.hasTable('chat_session'))) {
      // Lire la définition exacte de whatsapp_chat.id pour que whatsapp_chat_id
      // soit strictement compatible (type + charset + collation) avec la colonne référencée.
      // Même pattern que AddMetaAdReferral1780272000001.
      const [idCol] = await qr.query(
        `SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'whatsapp_chat'
           AND COLUMN_NAME  = 'id'`,
      ) as Array<{ COLUMN_TYPE: string; CHARACTER_SET_NAME: string; COLLATION_NAME: string }>;

      const chatIdColDef = idCol
        ? `${idCol.COLUMN_TYPE} CHARACTER SET ${idCol.CHARACTER_SET_NAME} COLLATE ${idCol.COLLATION_NAME} NOT NULL`
        : `CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL`;

      await qr.query(`
        CREATE TABLE \`chat_session\` (
          \`id\`                           CHAR(36)      NOT NULL DEFAULT (UUID()) PRIMARY KEY,
          \`whatsapp_chat_id\`             ${chatIdColDef},
          \`started_at\`                   DATETIME      NOT NULL,
          \`ended_at\`                     DATETIME      NULL DEFAULT NULL,
          \`is_ctwa\`                      TINYINT(1)    NOT NULL DEFAULT 0,
          \`ctwa_referral_id\`             VARCHAR(255)  NULL DEFAULT NULL,
          \`campaign_name\`                VARCHAR(255)  NULL DEFAULT NULL,
          \`campaign_image_url\`           VARCHAR(1024) NULL DEFAULT NULL,
          \`last_client_message_at\`       DATETIME      NULL DEFAULT NULL,
          \`last_poste_message_at\`        DATETIME      NULL DEFAULT NULL,
          \`service_window_expires_at\`    DATETIME      NULL DEFAULT NULL,
          \`free_entry_expires_at\`        DATETIME      NULL DEFAULT NULL,
          \`auto_close_at\`               DATETIME      NULL DEFAULT NULL,
          \`last_window_reminder_sent_at\` DATETIME      NULL DEFAULT NULL,
          CONSTRAINT \`FK_chat_session_whatsapp_chat\`
            FOREIGN KEY (\`whatsapp_chat_id\`)
            REFERENCES \`whatsapp_chat\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // 2. Index pour les jobs
    if (!(await this.indexExists(qr, 'chat_session', 'IDX_chat_session_active'))) {
      await qr.query(`CREATE INDEX \`IDX_chat_session_active\` ON \`chat_session\` (\`whatsapp_chat_id\`, \`ended_at\`)`);
    }
    if (!(await this.indexExists(qr, 'chat_session', 'IDX_chat_session_window'))) {
      await qr.query(`CREATE INDEX \`IDX_chat_session_window\` ON \`chat_session\` (\`auto_close_at\`, \`last_window_reminder_sent_at\`)`);
    }
    if (!(await this.indexExists(qr, 'chat_session', 'IDX_chat_session_enforcement'))) {
      await qr.query(`CREATE INDEX \`IDX_chat_session_enforcement\` ON \`chat_session\` (\`ended_at\`, \`auto_close_at\`)`);
    }

    // 3. Colonne active_session_id sur whatsapp_chat
    if (!(await this.columnExists(qr, 'whatsapp_chat', 'active_session_id'))) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`active_session_id\` CHAR(36) NULL DEFAULT NULL`);
    }

    // 4. Backfill : créer une session initiale pour tous les chats non fermés
    // Note : createdAt = nom réel de la colonne SQL dans whatsapp_chat
    await qr.query(`
      INSERT INTO \`chat_session\` (
        id, whatsapp_chat_id, started_at, is_ctwa, last_client_message_at,
        service_window_expires_at, free_entry_expires_at, auto_close_at
      )
      SELECT
        UUID(),
        wc.id,
        COALESCE(wc.last_client_message_at, wc.createdAt),
        wc.is_ctwa,
        wc.last_client_message_at,
        DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 24 HOUR),
        CASE WHEN wc.is_ctwa = 1
          THEN DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 72 HOUR)
          ELSE NULL
        END,
        CASE WHEN wc.is_ctwa = 1
          THEN GREATEST(
            DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 24 HOUR),
            DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 72 HOUR)
          )
          ELSE DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 24 HOUR)
        END
      FROM \`whatsapp_chat\` wc
      WHERE wc.status != 'fermé'
        AND NOT EXISTS (
          SELECT 1 FROM \`chat_session\` cs WHERE cs.whatsapp_chat_id = wc.id AND cs.ended_at IS NULL
        )
    `);

    // 5. Lier chaque chat à sa session backfillée
    await qr.query(`
      UPDATE \`whatsapp_chat\` wc
        INNER JOIN \`chat_session\` cs ON cs.whatsapp_chat_id = wc.id AND cs.ended_at IS NULL
        SET wc.active_session_id = cs.id
      WHERE wc.status != 'fermé'
        AND wc.active_session_id IS NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`UPDATE \`whatsapp_chat\` SET active_session_id = NULL`);
    if (await this.columnExists(qr, 'whatsapp_chat', 'active_session_id')) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`active_session_id\``);
    }
    if (await qr.hasTable('chat_session')) {
      await qr.query(`DROP TABLE \`chat_session\``);
    }
  }
}
