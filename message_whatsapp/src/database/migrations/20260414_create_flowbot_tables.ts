import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFlowbotTables1744000000000 implements MigrationInterface {
  name = 'CreateFlowbotTables1744000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── flow_bot ─────────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_bot'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_bot` (' +
          '`id` char(36) NOT NULL,' +
          '`name` varchar(255) NOT NULL,' +
          '`description` text NULL,' +
          '`is_active` tinyint(1) NOT NULL DEFAULT 0,' +
          '`priority` int NOT NULL DEFAULT 0,' +
          '`scope_channel_type` varchar(50) NULL,' +
          '`scope_provider_ref` varchar(36) NULL,' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`)' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── flow_trigger ─────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_trigger'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_trigger` (' +
          '`id` char(36) NOT NULL,' +
          '`flow_id` char(36) NOT NULL,' +
          '`trigger_type` enum(' +
          "'INBOUND_MESSAGE','CONVERSATION_OPEN','CONVERSATION_REOPEN','OUT_OF_HOURS'," +
          "'ON_ASSIGN','QUEUE_WAIT','NO_RESPONSE','INACTIVITY','KEYWORD','SCHEDULE'" +
          ') NOT NULL,' +
          '`config` json NOT NULL DEFAULT (JSON_OBJECT()),' +
          '`is_active` tinyint(1) NOT NULL DEFAULT 1,' +
          'PRIMARY KEY (`id`),' +
          'CONSTRAINT `fk_trigger_flow` FOREIGN KEY (`flow_id`) REFERENCES `flow_bot` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── flow_node ────────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_node'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_node` (' +
          '`id` char(36) NOT NULL,' +
          '`flow_id` char(36) NOT NULL,' +
          "`type` enum('MESSAGE','QUESTION','CONDITION','ACTION','WAIT','ESCALATE','END','AB_TEST') NOT NULL," +
          '`label` varchar(255) NULL,' +
          '`position_x` float NULL,' +
          '`position_y` float NULL,' +
          '`config` json NOT NULL DEFAULT (JSON_OBJECT()),' +
          '`timeout_seconds` int NULL,' +
          '`is_entry_point` tinyint(1) NOT NULL DEFAULT 0,' +
          'PRIMARY KEY (`id`),' +
          'CONSTRAINT `fk_node_flow` FOREIGN KEY (`flow_id`) REFERENCES `flow_bot` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── flow_edge ────────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_edge'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_edge` (' +
          '`id` char(36) NOT NULL,' +
          '`flow_id` char(36) NOT NULL,' +
          '`source_node_id` char(36) NOT NULL,' +
          '`target_node_id` char(36) NOT NULL,' +
          "`condition_type` varchar(50) NOT NULL DEFAULT 'always'," +
          '`condition_value` varchar(500) NULL,' +
          '`condition_negate` tinyint(1) NOT NULL DEFAULT 0,' +
          '`sort_order` int NOT NULL DEFAULT 0,' +
          'PRIMARY KEY (`id`),' +
          'CONSTRAINT `fk_edge_flow` FOREIGN KEY (`flow_id`) REFERENCES `flow_bot` (`id`) ON DELETE CASCADE,' +
          'CONSTRAINT `fk_edge_source` FOREIGN KEY (`source_node_id`) REFERENCES `flow_node` (`id`) ON DELETE CASCADE,' +
          'CONSTRAINT `fk_edge_target` FOREIGN KEY (`target_node_id`) REFERENCES `flow_node` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── bot_conversation ─────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('bot_conversation'))) {
      await queryRunner.query(
        'CREATE TABLE `bot_conversation` (' +
          '`id` char(36) NOT NULL,' +
          '`chat_ref` varchar(255) NOT NULL,' +
          "`status` enum('idle','bot_active','waiting','escalated','completed') NOT NULL DEFAULT 'idle'," +
          '`active_session_id` char(36) NULL,' +
          '`is_known_contact` tinyint(1) NOT NULL DEFAULT 0,' +
          '`is_reopened` tinyint(1) NOT NULL DEFAULT 0,' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updated_at` datetime(6) NULL ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`),' +
          'UNIQUE KEY `uk_chat_ref` (`chat_ref`),' +
          'KEY `idx_bot_conv_status` (`status`),' +
          'KEY `idx_bot_conv_session` (`active_session_id`)' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── flow_session ─────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_session'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_session` (' +
          '`id` char(36) NOT NULL,' +
          '`conversation_id` char(36) NOT NULL,' +
          '`flow_id` char(36) NOT NULL,' +
          '`current_node_id` char(36) NULL,' +
          "`status` enum('active','waiting_reply','waiting_delay','completed','escalated','expired','cancelled') NOT NULL DEFAULT 'active'," +
          '`variables` json NOT NULL DEFAULT (JSON_OBJECT()),' +
          '`steps_count` int NOT NULL DEFAULT 0,' +
          '`trigger_type` varchar(50) NULL,' +
          '`started_at` datetime NOT NULL,' +
          '`last_activity_at` datetime NULL,' +
          '`completed_at` datetime NULL,' +
          '`escalated_at` datetime NULL,' +
          'PRIMARY KEY (`id`),' +
          'KEY `idx_session_conv_status` (`conversation_id`, `status`),' +
          'CONSTRAINT `fk_session_conv` FOREIGN KEY (`conversation_id`) REFERENCES `bot_conversation` (`id`),' +
          'CONSTRAINT `fk_session_flow` FOREIGN KEY (`flow_id`) REFERENCES `flow_bot` (`id`),' +
          'CONSTRAINT `fk_session_node` FOREIGN KEY (`current_node_id`) REFERENCES `flow_node` (`id`) ON DELETE SET NULL' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── flow_session_log ─────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_session_log'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_session_log` (' +
          '`id` char(36) NOT NULL,' +
          '`session_id` char(36) NOT NULL,' +
          '`node_id` char(36) NULL,' +
          '`node_type` varchar(50) NULL,' +
          '`edge_taken_id` char(36) NULL,' +
          '`action` varchar(100) NULL,' +
          '`result` varchar(500) NULL,' +
          '`metadata` json NULL,' +
          '`executed_at` datetime NOT NULL,' +
          'PRIMARY KEY (`id`),' +
          'KEY `idx_session_log_session` (`session_id`),' +
          'CONSTRAINT `fk_log_session` FOREIGN KEY (`session_id`) REFERENCES `flow_session` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── bot_message ──────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('bot_message'))) {
      await queryRunner.query(
        'CREATE TABLE `bot_message` (' +
          '`id` char(36) NOT NULL,' +
          '`session_id` char(36) NOT NULL,' +
          '`flow_node_id` char(36) NULL,' +
          "`content_type` enum('text','image','audio','video','document','template') NOT NULL DEFAULT 'text'," +
          '`content` text NULL,' +
          '`media_url` varchar(500) NULL,' +
          '`external_msg_ref` varchar(255) NULL,' +
          '`sent_at` datetime NOT NULL,' +
          'PRIMARY KEY (`id`),' +
          'KEY `idx_bot_msg_session` (`session_id`),' +
          'KEY `idx_bot_msg_node` (`flow_node_id`),' +
          'CONSTRAINT `fk_botmsg_session` FOREIGN KEY (`session_id`) REFERENCES `flow_session` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── flow_analytics ───────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_analytics'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_analytics` (' +
          '`id` char(36) NOT NULL,' +
          '`flow_id` char(36) NOT NULL,' +
          '`period_date` date NOT NULL,' +
          '`sessions_started` int NOT NULL DEFAULT 0,' +
          '`sessions_completed` int NOT NULL DEFAULT 0,' +
          '`sessions_escalated` int NOT NULL DEFAULT 0,' +
          '`sessions_expired` int NOT NULL DEFAULT 0,' +
          '`avg_steps` float NULL,' +
          '`avg_duration_seconds` float NULL,' +
          'PRIMARY KEY (`id`),' +
          'UNIQUE KEY `uk_flow_date` (`flow_id`, `period_date`),' +
          'CONSTRAINT `fk_analytics_flow` FOREIGN KEY (`flow_id`) REFERENCES `flow_bot` (`id`)' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── flow_node_analytics ──────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('flow_node_analytics'))) {
      await queryRunner.query(
        'CREATE TABLE `flow_node_analytics` (' +
          '`id` char(36) NOT NULL,' +
          '`node_id` char(36) NOT NULL,' +
          '`period_date` date NOT NULL,' +
          '`visits` int NOT NULL DEFAULT 0,' +
          '`exits_completed` int NOT NULL DEFAULT 0,' +
          '`exits_escalated` int NOT NULL DEFAULT 0,' +
          '`exits_expired` int NOT NULL DEFAULT 0,' +
          '`avg_wait_seconds` float NULL,' +
          'PRIMARY KEY (`id`),' +
          'UNIQUE KEY `uk_node_date` (`node_id`, `period_date`),' +
          'CONSTRAINT `fk_node_analytics_node` FOREIGN KEY (`node_id`) REFERENCES `flow_node` (`id`)' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'flow_node_analytics',
      'flow_analytics',
      'bot_message',
      'flow_session_log',
      'flow_session',
      'bot_conversation',
      'flow_edge',
      'flow_node',
      'flow_trigger',
      'flow_bot',
    ];
    for (const table of tables) {
      if (await queryRunner.hasTable(table)) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }
  }
}
