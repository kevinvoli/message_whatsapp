import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupStaleConnectionLogs1749081600001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pour chaque (user_id, user_type), fermer toutes les sessions ouvertes
    // (logout_at IS NULL) sauf la plus récente.
    // Les sessions fermées reçoivent logout_at = login_at (durée 0) car on ne
    // connaît pas leur vrai moment de déconnexion.
    // Cette migration corrige les données historiques polluées avant US-0d.
    await queryRunner.query(`
      UPDATE messaging_connection_log t1
      INNER JOIN (
        SELECT user_id, user_type, MAX(login_at) AS max_login_at
        FROM messaging_connection_log
        WHERE logout_at IS NULL
        GROUP BY user_id, user_type
      ) t2
        ON  t1.user_id   = t2.user_id
        AND t1.user_type = t2.user_type
        AND t1.login_at  < t2.max_login_at
      SET t1.logout_at = t1.login_at
      WHERE t1.logout_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irréversible : les valeurs d'origine de logout_at ne sont pas connues.
  }
}
