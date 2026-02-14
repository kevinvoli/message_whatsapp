import { MigrationInterface, QueryRunner } from 'typeorm';

type GateResult = {
  name: string;
  value: number;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail?: string;
};

export class SqlGatesValidation1739560000010 implements MigrationInterface {
  name = 'SqlGatesValidation1739560000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `migration_sql_gate_results` (' +
        '`id` char(36) NOT NULL,' +
        '`gate_name` varchar(191) NOT NULL,' +
        '`value` int NOT NULL,' +
        '`status` varchar(8) NOT NULL,' +
        '`detail` varchar(255) DEFAULT NULL,' +
        '`executed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        'PRIMARY KEY (`id`),' +
        'KEY `IDX_migration_sql_gate_results_gate` (`gate_name`),' +
        'KEY `IDX_migration_sql_gate_results_status` (`status`)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );

    const results: GateResult[] = [];

    const pushResult = async (result: GateResult) => {
      results.push(result);
      await queryRunner.query(
        'INSERT INTO `migration_sql_gate_results` (`id`, `gate_name`, `value`, `status`, `detail`) ' +
          'VALUES (UUID(), ?, ?, ?, ?)',
        [result.name, result.value, result.status, result.detail ?? null],
      );
    };

    const runCountGate = async (
      name: string,
      sql: string,
      failIfPositive = true,
    ) => {
      try {
        const rows = await queryRunner.query(sql);
        const value = Array.isArray(rows) && rows.length > 0 ? Number(rows[0]?.c ?? rows[0]?.count ?? rows[0]?.value ?? rows[0]?.channels_without_tenant ?? rows[0]?.chats_without_tenant ?? rows[0]?.messages_without_tenant ?? rows[0]?.medias_without_tenant ?? rows[0]?.eventlog_without_tenant ?? rows[0]?.c ?? 0) : 0;
        const status: GateResult['status'] =
          failIfPositive && value > 0 ? 'FAIL' : 'PASS';
        await pushResult({ name, value, status });
      } catch (error) {
        await pushResult({
          name,
          value: 0,
          status: 'SKIP',
          detail: (error as Error).message,
        });
      }
    };

    await runCountGate(
      'pre_channels_duplicate_channel_id',
      'SELECT COUNT(*) c FROM (SELECT channel_id, COUNT(*) c FROM whapi_channels GROUP BY channel_id HAVING c > 1) t',
    );
    await runCountGate(
      'pre_channels_duplicate_provider_external_id',
      'SELECT COUNT(*) c FROM (SELECT provider, external_id, COUNT(*) c FROM whapi_channels GROUP BY provider, external_id HAVING c > 1) t',
    );
    await runCountGate(
      'pre_messages_duplicate_message_id',
      'SELECT COUNT(*) c FROM (SELECT message_id, COUNT(*) c FROM whatsapp_message GROUP BY message_id HAVING c > 1) t',
    );
    await runCountGate(
      'pre_eventlog_duplicate_event_key',
      'SELECT COUNT(*) c FROM (SELECT event_key, COUNT(*) c FROM webhook_event_log GROUP BY event_key HAVING c > 1) t',
    );

    await runCountGate(
      'post_channels_without_tenant',
      "SELECT COUNT(*) AS channels_without_tenant FROM whapi_channels WHERE tenant_id IS NULL OR tenant_id = ''",
    );
    await runCountGate(
      'post_chats_without_tenant',
      "SELECT COUNT(*) AS chats_without_tenant FROM whatsapp_chat WHERE tenant_id IS NULL OR tenant_id = ''",
    );
    await runCountGate(
      'post_messages_without_tenant',
      "SELECT COUNT(*) AS messages_without_tenant FROM whatsapp_message WHERE tenant_id IS NULL OR tenant_id = ''",
    );
    await runCountGate(
      'post_medias_without_tenant',
      "SELECT COUNT(*) AS medias_without_tenant FROM whatsapp_media WHERE tenant_id IS NULL OR tenant_id = ''",
    );
    await runCountGate(
      'post_eventlog_without_tenant',
      "SELECT COUNT(*) AS eventlog_without_tenant FROM webhook_event_log WHERE tenant_id IS NULL OR tenant_id = ''",
      false,
    );

    await runCountGate(
      'post_chat_collision_tenant_chat',
      'SELECT COUNT(*) c FROM (SELECT tenant_id, chat_id, COUNT(*) c FROM whatsapp_chat GROUP BY tenant_id, chat_id HAVING c > 1) t',
    );
    await runCountGate(
      'post_message_collision_tenant_provider_message_direction',
      'SELECT COUNT(*) c FROM (SELECT tenant_id, provider, provider_message_id, direction, COUNT(*) c FROM whatsapp_message GROUP BY tenant_id, provider, provider_message_id, direction HAVING c > 1) t',
    );

    const failed = results.filter((r) => r.status === 'FAIL');
    if (failed.length > 0) {
      const summary = failed.map((r) => `${r.name}=${r.value}`).join(', ');
      throw new Error(`SQL gate failed: ${summary}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `migration_sql_gate_results`');
  }
}
