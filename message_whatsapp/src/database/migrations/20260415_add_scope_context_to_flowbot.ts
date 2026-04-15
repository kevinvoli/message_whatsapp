import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CTX-D1 — Ajout de scope_context_id à flow_bot
 *
 * Permet de restreindre un flux à un contexte spécifique.
 * null = le flux s'applique à tous les contextes (comportement actuel inchangé).
 */
export class AddScopeContextToFlowbot1744700100000 implements MigrationInterface {
  name = 'AddScopeContextToFlowbot1744700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('flow_bot');
    if (table && !table.findColumnByName('scope_context_id')) {
      await queryRunner.query(
        'ALTER TABLE `flow_bot` ADD COLUMN `scope_context_id` char(36) NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('flow_bot');
    if (table?.findColumnByName('scope_context_id')) {
      await queryRunner.query(
        'ALTER TABLE `flow_bot` DROP COLUMN `scope_context_id`',
      );
    }
  }
}
