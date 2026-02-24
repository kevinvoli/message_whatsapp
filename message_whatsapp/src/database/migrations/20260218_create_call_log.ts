import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCallLog1740000000001 implements MigrationInterface {
  name = 'CreateCallLog1740000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('call_log');
    if (exists) return;

    await queryRunner.query(
      'CREATE TABLE `call_log` (' +
        '`id` char(36) NOT NULL,' +
        '`contact_id` varchar(36) NOT NULL,' +
        '`commercial_id` varchar(36) NOT NULL,' +
        '`commercial_name` varchar(200) NOT NULL,' +
        '`called_at` timestamp NOT NULL,' +
        '`call_status` enum(\'à_appeler\',\'appelé\',\'rappeler\',\'non_joignable\') NOT NULL,' +
        '`outcome` enum(\'répondu\',\'messagerie\',\'pas_de_réponse\',\'occupé\') NULL,' +
        '`duration_sec` int NULL,' +
        '`notes` text NULL,' +
        '`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        '`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,' +
        'PRIMARY KEY (`id`),' +
        'KEY `IDX_call_log_contact_id` (`contact_id`),' +
        'KEY `IDX_call_log_commercial_id` (`commercial_id`),' +
        'KEY `IDX_call_log_called_at` (`called_at`)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `call_log`');
  }
}
