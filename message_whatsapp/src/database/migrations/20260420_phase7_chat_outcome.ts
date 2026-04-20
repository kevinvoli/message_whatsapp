import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Phase 7 — Fondations de suivi client
 * P7.1 — Statut métier de fin de conversation sur whatsapp_chat
 *
 * Stratégie expand-contract :
 * - Toutes les colonnes sont nullable + default NULL → aucun impact sur les lignes existantes
 * - L'ancien code continue de fonctionner sans ces colonnes
 */
export class Phase7ChatOutcome1745100000001 implements MigrationInterface {
  name = 'Phase7ChatOutcome1745100000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasResult = await queryRunner.hasColumn('whatsapp_chat', 'conversation_result');
    if (!hasResult) {
      await queryRunner.addColumn(
        'whatsapp_chat',
        new TableColumn({
          name: 'conversation_result',
          type: 'enum',
          enum: [
            'commande_confirmee',
            'commande_a_saisir',
            'a_relancer',
            'rappel_programme',
            'pas_interesse',
            'sans_reponse',
            'infos_incompletes',
            'deja_client',
            'annule',
          ],
          isNullable: true,
          default: null,
        }),
      );
    }

    const hasResultAt = await queryRunner.hasColumn('whatsapp_chat', 'conversation_result_at');
    if (!hasResultAt) {
      await queryRunner.addColumn(
        'whatsapp_chat',
        new TableColumn({
          name: 'conversation_result_at',
          type: 'timestamp',
          isNullable: true,
          default: null,
        }),
      );
    }

    const hasResultBy = await queryRunner.hasColumn('whatsapp_chat', 'conversation_result_by');
    if (!hasResultBy) {
      await queryRunner.addColumn(
        'whatsapp_chat',
        new TableColumn({
          name: 'conversation_result_by',
          type: 'char',
          length: '36',
          isNullable: true,
          default: null,
        }),
      );
    }

    const hasLocked = await queryRunner.hasColumn('whatsapp_chat', 'is_locked');
    if (!hasLocked) {
      await queryRunner.addColumn(
        'whatsapp_chat',
        new TableColumn({
          name: 'is_locked',
          type: 'boolean',
          default: false,
          isNullable: false,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['conversation_result', 'conversation_result_at', 'conversation_result_by', 'is_locked']) {
      if (await queryRunner.hasColumn('whatsapp_chat', col)) {
        await queryRunner.dropColumn('whatsapp_chat', col);
      }
    }
  }
}
