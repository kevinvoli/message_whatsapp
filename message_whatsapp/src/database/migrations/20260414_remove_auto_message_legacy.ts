import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suppression complète du système legacy d'auto-messages.
 * FlowBot (EPIC-12) remplace entièrement ces fonctionnalités.
 *
 * Colonnes supprimées de whatsapp_chat (18 colonnes) :
 *   legacy    : auto_message_id, current_auto_message_id, auto_message_status
 *   orchestr. : auto_message_step, waiting_client_reply, last_auto_message_sent_at
 *   trigger A : no_response_auto_step, last_no_response_auto_sent_at
 *   trigger C : out_of_hours_auto_sent
 *   trigger D : reopened_auto_sent  (reopened_at est conservé pour FlowBot)
 *   trigger E : queue_wait_auto_step, last_queue_wait_auto_sent_at
 *   trigger F : keyword_auto_sent_at
 *   trigger G : client_type_auto_sent, is_known_client
 *   trigger H : inactivity_auto_step, last_inactivity_auto_sent_at
 *   trigger I : on_assign_auto_sent
 *
 * Tables supprimées :
 *   messages_predefinis, auto_message_keyword,
 *   auto_message_scope_config, business_hours_config
 *
 * Lignes cron_config supprimées :
 *   auto-message, auto-message-master, no-response-auto-message,
 *   out-of-hours-auto-message, reopened-auto-message, queue-wait-auto-message,
 *   keyword-auto-message, client-type-auto-message, inactivity-auto-message,
 *   on-assign-auto-message
 */
export class RemoveAutoMessageLegacy1744000100000 implements MigrationInterface {
  name = 'RemoveAutoMessageLegacy1744000100000';

  // ─── Colonnes à supprimer ─────────────────────────────────────────────────

  private readonly AUTO_MSG_COLUMNS = [
    'auto_message_id',
    'current_auto_message_id',
    'auto_message_status',
    'auto_message_step',
    'waiting_client_reply',
    'last_auto_message_sent_at',
    'no_response_auto_step',
    'last_no_response_auto_sent_at',
    'out_of_hours_auto_sent',
    'reopened_auto_sent',
    'queue_wait_auto_step',
    'last_queue_wait_auto_sent_at',
    'keyword_auto_sent_at',
    'client_type_auto_sent',
    'is_known_client',
    'inactivity_auto_step',
    'last_inactivity_auto_sent_at',
    'on_assign_auto_sent',
  ];

  // ─── Clés cron_config à supprimer ────────────────────────────────────────

  private readonly AUTO_MSG_CRON_KEYS = [
    'auto-message',
    'auto-message-master',
    'no-response-auto-message',
    'out-of-hours-auto-message',
    'reopened-auto-message',
    'queue-wait-auto-message',
    'keyword-auto-message',
    'client-type-auto-message',
    'inactivity-auto-message',
    'on-assign-auto-message',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Supprimer colonnes whatsapp_chat ──────────────────────────────────
    for (const col of this.AUTO_MSG_COLUMNS) {
      const hasColumn = await queryRunner.hasColumn('whatsapp_chat', col);
      if (hasColumn) {
        await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`${col}\``);
      }
    }

    // ── 2. Supprimer clés cron_config ────────────────────────────────────────
    const placeholders = this.AUTO_MSG_CRON_KEYS.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`cron_config\` WHERE \`key\` IN (${placeholders})`,
      this.AUTO_MSG_CRON_KEYS,
    );

    // ── 3. Supprimer tables auto_message (FK d'abord) ────────────────────────
    if (await queryRunner.hasTable('auto_message_keyword')) {
      await queryRunner.query('DROP TABLE `auto_message_keyword`');
    }
    if (await queryRunner.hasTable('auto_message_scope_config')) {
      await queryRunner.query('DROP TABLE `auto_message_scope_config`');
    }
    if (await queryRunner.hasTable('business_hours_config')) {
      await queryRunner.query('DROP TABLE `business_hours_config`');
    }
    if (await queryRunner.hasTable('messages_predefinis')) {
      await queryRunner.query('DROP TABLE `messages_predefinis`');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback : recréer les tables et colonnes supprimées
    // (Migration irréversible en pratique — les données sont perdues)

    // ── Recréer messages_predefinis ─────────────────────────────────────────
    if (!(await queryRunner.hasTable('messages_predefinis'))) {
      await queryRunner.query(
        'CREATE TABLE `messages_predefinis` (' +
          '`id` char(36) NOT NULL,' +
          '`body` text NOT NULL,' +
          '`delai` int NOT NULL DEFAULT 0,' +
          '`canal` varchar(50) NOT NULL DEFAULT \'whatsapp\',' +
          '`position` int NOT NULL DEFAULT 0,' +
          '`actif` tinyint(1) NOT NULL DEFAULT 1,' +
          '`trigger_type` varchar(50) NOT NULL DEFAULT \'sequence\',' +
          '`scope_type` varchar(50) NULL,' +
          '`scope_id` varchar(100) NULL,' +
          '`scope_label` varchar(200) NULL,' +
          '`client_type_target` varchar(50) NOT NULL DEFAULT \'all\',' +
          '`conditions` longtext NULL,' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`)' +
          ') ENGINE=InnoDB',
      );
    }

    // ── Recréer auto_message_keyword ────────────────────────────────────────
    if (!(await queryRunner.hasTable('auto_message_keyword'))) {
      await queryRunner.query(
        'CREATE TABLE `auto_message_keyword` (' +
          '`id` char(36) NOT NULL,' +
          '`keyword` varchar(100) NOT NULL,' +
          '`match_type` varchar(20) NOT NULL DEFAULT \'contains\',' +
          '`case_sensitive` tinyint(1) NOT NULL DEFAULT 0,' +
          '`actif` tinyint(1) NOT NULL DEFAULT 1,' +
          '`message_auto_id` char(36) NOT NULL,' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`),' +
          'CONSTRAINT `FK_auto_msg_kw_msg_auto` FOREIGN KEY (`message_auto_id`) REFERENCES `messages_predefinis` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB',
      );
    }

    // ── Recréer auto_message_scope_config ───────────────────────────────────
    if (!(await queryRunner.hasTable('auto_message_scope_config'))) {
      await queryRunner.query(
        'CREATE TABLE `auto_message_scope_config` (' +
          '`id` char(36) NOT NULL,' +
          '`scope_type` varchar(50) NOT NULL,' +
          '`scope_id` varchar(100) NOT NULL,' +
          '`enabled` tinyint(1) NOT NULL DEFAULT 1,' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`)' +
          ') ENGINE=InnoDB',
      );
    }

    // ── Recréer business_hours_config ───────────────────────────────────────
    if (!(await queryRunner.hasTable('business_hours_config'))) {
      await queryRunner.query(
        'CREATE TABLE `business_hours_config` (' +
          '`id` char(36) NOT NULL,' +
          '`day_of_week` int NOT NULL,' +
          '`open_time` varchar(5) NOT NULL DEFAULT \'08:00\',' +
          '`close_time` varchar(5) NOT NULL DEFAULT \'18:00\',' +
          '`is_open` tinyint(1) NOT NULL DEFAULT 1,' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`)' +
          ') ENGINE=InnoDB',
      );
    }

    // ── Restaurer colonnes whatsapp_chat (structure uniquement, données perdues) ──
    const columnDefs: Record<string, string> = {
      auto_message_id:              'VARCHAR(100) NULL',
      current_auto_message_id:      'VARCHAR(100) NULL',
      auto_message_status:          'VARCHAR(100) NULL',
      auto_message_step:            'INT NOT NULL DEFAULT 0',
      waiting_client_reply:         'TINYINT(1) NOT NULL DEFAULT 0',
      last_auto_message_sent_at:    'TIMESTAMP NULL',
      no_response_auto_step:        'INT NOT NULL DEFAULT 0',
      last_no_response_auto_sent_at:'TIMESTAMP NULL',
      out_of_hours_auto_sent:       'TINYINT(1) NOT NULL DEFAULT 0',
      reopened_auto_sent:           'TINYINT(1) NOT NULL DEFAULT 0',
      queue_wait_auto_step:         'INT NOT NULL DEFAULT 0',
      last_queue_wait_auto_sent_at: 'TIMESTAMP NULL',
      keyword_auto_sent_at:         'TIMESTAMP NULL',
      client_type_auto_sent:        'TINYINT(1) NOT NULL DEFAULT 0',
      is_known_client:              'TINYINT(1) NULL',
      inactivity_auto_step:         'INT NOT NULL DEFAULT 0',
      last_inactivity_auto_sent_at: 'TIMESTAMP NULL',
      on_assign_auto_sent:          'TINYINT(1) NOT NULL DEFAULT 0',
    };
    for (const [col, def] of Object.entries(columnDefs)) {
      const hasColumn = await queryRunner.hasColumn('whatsapp_chat', col);
      if (!hasColumn) {
        await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`${col}\` ${def}`);
      }
    }
  }
}
