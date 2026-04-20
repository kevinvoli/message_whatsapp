import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Phase 7 — Fondations de suivi client
 * P7.2 — Portefeuille commercial sur contact
 *
 * Stratégie expand-contract :
 * - portfolio_owner_id nullable → les contacts existants ont NULL (non attribués)
 * - client_category nullable → sera rempli par les webhooks entrants commandes
 * - client_order_summary nullable JSON
 * - certification_status nullable
 */
export class Phase7ContactPortfolio1745100000002 implements MigrationInterface {
  name = 'Phase7ContactPortfolio1745100000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasOwner = await queryRunner.hasColumn('contact', 'portfolio_owner_id');
    if (!hasOwner) {
      await queryRunner.addColumn(
        'contact',
        new TableColumn({
          name: 'portfolio_owner_id',
          type: 'char',
          length: '36',
          isNullable: true,
          default: null,
        }),
      );
    }

    const hasCategory = await queryRunner.hasColumn('contact', 'client_category');
    if (!hasCategory) {
      await queryRunner.addColumn(
        'contact',
        new TableColumn({
          name: 'client_category',
          type: 'enum',
          enum: ['jamais_commande', 'commande_sans_livraison', 'commande_avec_livraison', 'commande_annulee'],
          isNullable: true,
          default: null,
        }),
      );
    }

    const hasOrderSummary = await queryRunner.hasColumn('contact', 'client_order_summary');
    if (!hasOrderSummary) {
      await queryRunner.addColumn(
        'contact',
        new TableColumn({
          name: 'client_order_summary',
          type: 'json',
          isNullable: true,
        }),
      );
    }

    const hasCertif = await queryRunner.hasColumn('contact', 'certification_status');
    if (!hasCertif) {
      await queryRunner.addColumn(
        'contact',
        new TableColumn({
          name: 'certification_status',
          type: 'enum',
          enum: ['non_verifie', 'en_attente', 'certifie', 'rejete'],
          isNullable: true,
          default: null,
        }),
      );
    }

    const hasOrderClientId = await queryRunner.hasColumn('contact', 'order_client_id');
    if (!hasOrderClientId) {
      await queryRunner.addColumn(
        'contact',
        new TableColumn({
          name: 'order_client_id',
          type: 'int',
          isNullable: true,
          default: null,
          comment: 'ID client dans la plateforme de gestion des commandes (integer)',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['portfolio_owner_id', 'client_category', 'client_order_summary', 'certification_status', 'order_client_id']) {
      if (await queryRunner.hasColumn('contact', col)) {
        await queryRunner.dropColumn('contact', col);
      }
    }
  }
}
