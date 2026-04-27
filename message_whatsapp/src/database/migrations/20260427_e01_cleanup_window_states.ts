import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E01-T03 — Nettoyage des états window incohérents en base.
 *
 * Cas traités :
 *  1. window_status=RELEASED avec window_slot non null  → slot=null, is_locked=false
 *  2. window_status=ACTIVE   avec is_locked=true        → is_locked=false
 *  3. window_status=LOCKED   avec is_locked=false       → is_locked=true
 *  4. window_status=NULL     avec window_slot non null  → slot=null (forcer rebuild)
 *
 * Migration idempotente : peut être rejouée sans effet.
 */
export class E01CleanupWindowStates1745769600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. RELEASED avec slot → libérer le slot
    await queryRunner.query(`
      UPDATE whatsapp_chat
         SET window_slot = NULL,
             is_locked   = 0
       WHERE window_status = 'released'
         AND window_slot IS NOT NULL
    `);

    // 2. ACTIVE avec is_locked=1 → incohérent, corriger
    await queryRunner.query(`
      UPDATE whatsapp_chat
         SET is_locked = 0
       WHERE window_status = 'active'
         AND is_locked = 1
    `);

    // 3. LOCKED avec is_locked=0 → incohérent, corriger
    await queryRunner.query(`
      UPDATE whatsapp_chat
         SET is_locked = 1
       WHERE window_status = 'locked'
         AND is_locked = 0
    `);

    // 4. window_status NULL + window_slot non null → reset (provoquera un rebuild)
    await queryRunner.query(`
      UPDATE whatsapp_chat
         SET window_slot = NULL,
             is_locked   = 0
       WHERE window_status IS NULL
         AND window_slot IS NOT NULL
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Pas de rollback possible pour une correction de données
  }
}
