import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupStaleConnectionLogs1749081600001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supprime tous les logs de connexion des commerciaux antérieurs à aujourd'hui.
    // Ces données étaient incorrectes (sessions fantômes non fermées) et fausseraient
    // les calculs de temps de connexion. On repart d'une base saine à partir de
    // la date de déploiement de la correction (2026-05-27).
    await queryRunner.query(`
      DELETE FROM messaging_connection_log
      WHERE user_type = 'commercial'
        AND login_at < CURDATE()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irréversible : les données supprimées ne peuvent pas être restaurées.
  }
}
