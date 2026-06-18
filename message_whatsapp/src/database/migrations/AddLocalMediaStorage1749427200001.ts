import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration : stockage local des médias WhatsApp/Meta/Messenger
 *
 * Ajoute 4 colonnes sur `whatsapp_media` pour permettre la mise en cache
 * des fichiers médias sur le serveur et le suivi de l'expiration des URLs
 * fournisseur (Facebook CDN, Whapi...).
 *
 * - local_url            : URL relative servie par Nginx (/media/...)
 * - local_path           : Chemin absolu sur disque (uploads/media/...)
 * - provider_url_expired : Flag indiquant que l'URL CDN du provider est expirée
 * - downloaded_at        : Date du dernier téléchargement local réussi
 */
export class AddLocalMediaStorage1749427200001 implements MigrationInterface {
  name = 'AddLocalMediaStorage1749427200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_media'))) return;

    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_media'
         AND COLUMN_NAME IN ('local_url', 'local_path', 'provider_url_expired', 'downloaded_at')`,
    );
    const existingCols = new Set((cols as Array<{ COLUMN_NAME: string }>).map((r) => r.COLUMN_NAME));

    if (!existingCols.has('local_url')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` ADD COLUMN \`local_url\` VARCHAR(512) NULL AFTER \`url\``,
      );
    }

    if (!existingCols.has('local_path')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` ADD COLUMN \`local_path\` VARCHAR(512) NULL AFTER \`local_url\``,
      );
    }

    if (!existingCols.has('provider_url_expired')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` ADD COLUMN \`provider_url_expired\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`local_path\``,
      );
    }

    if (!existingCols.has('downloaded_at')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` ADD COLUMN \`downloaded_at\` DATETIME NULL AFTER \`provider_url_expired\``,
      );
    }

    // Index sur local_path pour les lookups de fichiers existants
    const indexRows = await queryRunner.query(
      `SHOW INDEX FROM \`whatsapp_media\` WHERE Key_name = 'IDX_whatsapp_media_local_path'`,
    );
    if (!Array.isArray(indexRows) || indexRows.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` ADD INDEX \`IDX_whatsapp_media_local_path\` (\`local_path\`(191))`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_media'))) return;

    // Supprimer l'index d'abord
    const indexRows = await queryRunner.query(
      `SHOW INDEX FROM \`whatsapp_media\` WHERE Key_name = 'IDX_whatsapp_media_local_path'`,
    );
    if (Array.isArray(indexRows) && indexRows.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` DROP INDEX \`IDX_whatsapp_media_local_path\``,
      );
    }

    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_media'
         AND COLUMN_NAME IN ('local_url', 'local_path', 'provider_url_expired', 'downloaded_at')`,
    );
    const existingCols = new Set((cols as Array<{ COLUMN_NAME: string }>).map((r) => r.COLUMN_NAME));

    if (existingCols.has('downloaded_at')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` DROP COLUMN \`downloaded_at\``,
      );
    }
    if (existingCols.has('provider_url_expired')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` DROP COLUMN \`provider_url_expired\``,
      );
    }
    if (existingCols.has('local_path')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` DROP COLUMN \`local_path\``,
      );
    }
    if (existingCols.has('local_url')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_media\` DROP COLUMN \`local_url\``,
      );
    }
  }
}
