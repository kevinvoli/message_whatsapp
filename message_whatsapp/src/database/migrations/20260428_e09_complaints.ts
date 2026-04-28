import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E09-T01 — Création de la table complaints.
 * Suivi des plaintes clients avec workflow de résolution.
 */
export class E09Complaints1745884800002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id                  CHAR(36)      NOT NULL,
        contact_id          CHAR(36)      NULL,
        chat_id             VARCHAR(100)  NULL,
        commercial_id       CHAR(36)      NULL,
        commercial_name     VARCHAR(100)  NULL,
        order_id_db2        VARCHAR(100)  NULL,
        category            ENUM(
                              'commande_non_livree',
                              'erreur_produit',
                              'code_expedition_non_recu',
                              'plainte_livreur',
                              'plainte_commerciale',
                              'plainte_utilisation_produit'
                            ) NOT NULL,
        priority            ENUM('normale','haute','critique') NOT NULL DEFAULT 'normale',
        status              ENUM('ouverte','assignee','en_traitement','resolue','rejetee')
                                          NOT NULL DEFAULT 'ouverte',
        description         TEXT          NOT NULL,
        assigned_to         CHAR(36)      NULL,
        assigned_to_name    VARCHAR(100)  NULL,
        resolution_note     TEXT          NULL,
        resolved_at         TIMESTAMP     NULL,
        created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX IDX_complaint_status     (status),
        INDEX IDX_complaint_commercial (commercial_id),
        INDEX IDX_complaint_contact    (contact_id),
        INDEX IDX_complaint_category   (category),
        INDEX IDX_complaint_priority   (priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS complaints`);
  }
}
