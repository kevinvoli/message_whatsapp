import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCronConfig1772582400000 implements MigrationInterface {
  name = 'CreateCronConfig1772582400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`cron_config\` (
        \`id\`               CHAR(36)      NOT NULL,
        \`key\`              VARCHAR(100)  NOT NULL,
        \`label\`            VARCHAR(200)  NOT NULL,
        \`description\`      TEXT          NULL,
        \`enabled\`          TINYINT(1)    NOT NULL DEFAULT 1,
        \`schedule_type\`    ENUM('interval','cron','event') NOT NULL,
        \`interval_minutes\` INT           NULL,
        \`cron_expression\`  VARCHAR(100)  NULL,
        \`ttl_days\`         INT           NULL,
        \`delay_min_seconds\` INT          NULL,
        \`delay_max_seconds\` INT          NULL,
        \`max_steps\`        INT           NULL,
        \`last_run_at\`      DATETIME      NULL,
        \`created_at\`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_cron_config_key\` (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Lire les valeurs actuelles de dispatch_settings si la table existe
    let existingSettings: Record<string, string | number | null> = {};
    try {
      const rows: Record<string, string | number | null>[] = await queryRunner.query(
        `SELECT * FROM \`dispatch_settings\` ORDER BY created_at ASC LIMIT 1`,
      );
      if (rows.length > 0) {
        existingSettings = rows[0];
      }
    } catch {
      // dispatch_settings n'existe pas ou est vide — on utilise les valeurs par défaut
    }

    const slaInterval = existingSettings['no_reply_reinject_interval_minutes'] ?? 5;
    const readOnlyInterval = existingSettings['read_only_check_interval_minutes'] ?? 10;
    const offlineCron = existingSettings['offline_reinject_cron'] ?? '0 9 * * *';
    const autoEnabled = existingSettings['auto_message_enabled'] ?? 0;
    const delayMin = existingSettings['auto_message_delay_min_seconds'] ?? 20;
    const delayMax = existingSettings['auto_message_delay_max_seconds'] ?? 45;
    const maxSteps = existingSettings['auto_message_max_steps'] ?? 3;

    const rows = [
      {
        id: this.uuid(),
        key: 'sla-checker',
        label: 'Vérificateur SLA — réinjection premier message',
        description: 'Vérifie toutes les N minutes si des chats ont dépassé leur deadline de première réponse et les réinjecte dans la queue.',
        enabled: 1,
        schedule_type: 'interval',
        interval_minutes: slaInterval,
        cron_expression: null,
        ttl_days: null,
        delay_min_seconds: null,
        delay_max_seconds: null,
        max_steps: null,
      },
      {
        id: this.uuid(),
        key: 'read-only-enforcement',
        label: 'Passage en lecture seule — inactivité 24h',
        description: 'Passe en lecture seule les chats ACTIFS dont le client n\'a pas écrit depuis plus de 24h.',
        enabled: 1,
        schedule_type: 'interval',
        interval_minutes: readOnlyInterval,
        cron_expression: null,
        ttl_days: null,
        delay_min_seconds: null,
        delay_max_seconds: null,
        max_steps: null,
      },
      {
        id: this.uuid(),
        key: 'offline-reinject',
        label: 'Réinjection des chats des agents hors ligne',
        description: 'Réinjecte dans la queue les chats actifs assignés à des postes hors ligne qui n\'ont reçu aucune réponse de l\'agent.',
        enabled: 1,
        schedule_type: 'cron',
        interval_minutes: null,
        cron_expression: offlineCron,
        ttl_days: null,
        delay_min_seconds: null,
        delay_max_seconds: null,
        max_steps: null,
      },
      {
        id: this.uuid(),
        key: 'webhook-purge',
        label: 'Purge des événements webhook anciens',
        description: 'Supprime les entrées d\'idempotency webhook plus vieilles que le TTL configuré pour libérer de l\'espace en base de données.',
        enabled: 1,
        schedule_type: 'cron',
        interval_minutes: null,
        cron_expression: '0 3 * * *',
        ttl_days: 14,
        delay_min_seconds: null,
        delay_max_seconds: null,
        max_steps: null,
      },
      {
        id: this.uuid(),
        key: 'auto-message',
        label: 'Messages automatiques',
        description: 'Orchestrateur des messages automatiques envoyés après un délai configurable suite à un message entrant client.',
        enabled: autoEnabled ? 1 : 0,
        schedule_type: 'event',
        interval_minutes: null,
        cron_expression: null,
        ttl_days: null,
        delay_min_seconds: delayMin,
        delay_max_seconds: delayMax,
        max_steps: maxSteps,
      },
    ];

    for (const row of rows) {
      await queryRunner.query(
        `INSERT INTO \`cron_config\`
          (\`id\`, \`key\`, \`label\`, \`description\`, \`enabled\`, \`schedule_type\`,
           \`interval_minutes\`, \`cron_expression\`, \`ttl_days\`,
           \`delay_min_seconds\`, \`delay_max_seconds\`, \`max_steps\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE \`key\` = \`key\``,
        [
          row.id, row.key, row.label, row.description, row.enabled, row.schedule_type,
          row.interval_minutes, row.cron_expression, row.ttl_days,
          row.delay_min_seconds, row.delay_max_seconds, row.max_steps,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`cron_config\``);
  }

  private uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
