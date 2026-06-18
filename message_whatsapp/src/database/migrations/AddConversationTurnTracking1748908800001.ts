import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationTurnTracking1748908800001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE whatsapp_message
        ADD COLUMN is_first_reply TINYINT(1) NULL DEFAULT NULL
          COMMENT 'OUT uniquement : 1 si premiere reponse apres un tour client',
        ADD INDEX IDX_msg_first_reply (is_first_reply)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE whatsapp_message DROP INDEX IDX_msg_first_reply`);
    await queryRunner.query(`ALTER TABLE whatsapp_message DROP COLUMN is_first_reply`);
  }
}
