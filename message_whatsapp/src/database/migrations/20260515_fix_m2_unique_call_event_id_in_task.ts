import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX-M2: Ajoute un index UNIQUE sur call_task.call_event_id.
 * Garantit qu'un appel (callEventId) ne peut valider qu'une seule tâche.
 * Protection applicative contre les race conditions multi-instances.
 */
export class FixM2UniqueCallEventIdInTask1747267200003 implements MigrationInterface {
  name = 'FixM2UniqueCallEventIdInTask1747267200003';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Avant d'ajouter l'index, nettoyer les doublons eventuels
    await queryRunner.query(
      'DELETE t1 FROM call_task t1 INNER JOIN call_task t2 ON t1.call_event_id = t2.call_event_id AND t1.id > t2.id WHERE t1.call_event_id IS NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE call_task ADD UNIQUE INDEX UQ_call_task_call_event_id (call_event_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE call_task DROP INDEX UQ_call_task_call_event_id',
    );
  }
}