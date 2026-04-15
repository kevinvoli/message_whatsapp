import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CTX-A5 — Migration : création des tables de contexte
 *
 * Tables créées :
 *   - ctx_context         — unités logiques d'isolation
 *   - ctx_context_binding — règles de résolution (CHANNEL/POSTE/PROVIDER/POOL)
 *   - ctx_chat_context    — compteurs isolés par (chat_id × context_id)
 *
 * Aucune modification des tables existantes (migration non-destructive).
 * La table ctx_chat_context est populate progressivement par le pipeline
 * inbound — pas de backfill nécessaire au déploiement.
 */
export class CreateContextTables1744700000000 implements MigrationInterface {
  name = 'CreateContextTables1744700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── ctx_context ──────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('ctx_context'))) {
      await queryRunner.query(
        'CREATE TABLE `ctx_context` (' +
          '`id` char(36) NOT NULL,' +
          '`tenant_id` char(36) NULL,' +
          '`label` varchar(255) NULL,' +
          '`context_type` enum(\'CHANNEL\',\'POSTE\',\'PROVIDER\',\'POOL\') NOT NULL,' +
          '`is_active` tinyint(1) NOT NULL DEFAULT 1,' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`),' +
          'KEY `IDX_ctx_context_tenant` (`tenant_id`)' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── ctx_context_binding ──────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('ctx_context_binding'))) {
      await queryRunner.query(
        'CREATE TABLE `ctx_context_binding` (' +
          '`id` char(36) NOT NULL,' +
          '`context_id` char(36) NOT NULL,' +
          '`binding_type` enum(\'CHANNEL\',\'POSTE\',\'PROVIDER\',\'POOL\') NOT NULL,' +
          '`ref_value` varchar(191) NOT NULL,' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`),' +
          'UNIQUE KEY `UQ_ctx_binding_type_ref` (`binding_type`, `ref_value`),' +
          'KEY `IDX_ctx_binding_context` (`context_id`),' +
          'CONSTRAINT `fk_ctx_binding_context` FOREIGN KEY (`context_id`) REFERENCES `ctx_context` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }

    // ─── ctx_chat_context ─────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('ctx_chat_context'))) {
      await queryRunner.query(
        'CREATE TABLE `ctx_chat_context` (' +
          '`id` char(36) NOT NULL,' +
          '`chat_id` varchar(100) NOT NULL,' +
          '`context_id` char(36) NOT NULL,' +
          '`poste_id` varchar(100) NULL,' +
          '`unread_count` int NOT NULL DEFAULT 0,' +
          '`read_only` tinyint(1) NOT NULL DEFAULT 0,' +
          '`last_client_message_at` timestamp NULL,' +
          '`last_poste_message_at` timestamp NULL,' +
          '`last_activity_at` timestamp NULL,' +
          '`whatsapp_chat_id` char(36) NULL,' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`),' +
          'UNIQUE KEY `UQ_ctx_chat_context` (`chat_id`, `context_id`),' +
          'KEY `IDX_ctx_chat_context_context` (`context_id`),' +
          'KEY `IDX_ctx_chat_context_poste` (`poste_id`, `last_activity_at`),' +
          'CONSTRAINT `fk_ctx_chat_context_context` FOREIGN KEY (`context_id`) REFERENCES `ctx_context` (`id`) ON DELETE CASCADE' +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['ctx_chat_context', 'ctx_context_binding', 'ctx_context']) {
      if (await queryRunner.hasTable(table)) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }
  }
}
