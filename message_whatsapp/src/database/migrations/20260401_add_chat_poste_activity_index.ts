import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: index hot-path pour la liste des conversations d'un poste
 *
 * ⚠️  ALTER TABLE sur une grande table dépasse le timeout CI/CD.
 *     Cette migration est un no-op volontaire : elle se marque comme
 *     exécutée sans bloquer le déploiement.
 *
 *     Créer l'index MANUELLEMENT sur le serveur (hors déploiement) :
 *
 *       ALTER TABLE `whatsapp_chat`
 *         ADD INDEX `IDX_chat_poste_activity` (`poste_id`, `last_activity_at`);
 *
 *     (opération online InnoDB — pas de lock sur les lectures/écritures)
 */
export class AddChatPosteActivityIndex1743465600001 implements MigrationInterface {
  name = 'AddChatPosteActivityIndex1743465600001';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op intentionnel — voir commentaire ci-dessus
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op intentionnel
  }
}
