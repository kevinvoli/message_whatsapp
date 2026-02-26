import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAutoMessageScopeConfig1740604800002 implements MigrationInterface {
  name = 'CreateAutoMessageScopeConfig1740604800002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('auto_message_scope_config');
    if (exists) return;

    await queryRunner.query(
      'CREATE TABLE `auto_message_scope_config` (' +
        '`id` char(36) NOT NULL,' +
        '`scope_type` enum(\'poste\',\'canal\',\'provider\') NOT NULL,' +
        '`scope_id` varchar(100) NOT NULL,' +
        '`label` varchar(200) NULL,' +
        '`enabled` tinyint(1) NOT NULL DEFAULT 1,' +
        '`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        '`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,' +
        'PRIMARY KEY (`id`),' +
        'UNIQUE KEY `UQ_auto_message_scope` (`scope_type`, `scope_id`),' +
        'KEY `IDX_auto_message_scope_type` (`scope_type`)' +
        ') ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `auto_message_scope_config`');
  }
}
