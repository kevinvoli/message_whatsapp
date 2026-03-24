import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supprime les clés de configuration globales qui sont désormais gérées
 * au niveau de chaque canal (verify_token, app_secret, etc.).
 * Ces valeurs vivent maintenant dans la table `whapi_channels`.
 */
export class RemoveGlobalProviderSecrets1774224000000 implements MigrationInterface {
  name = 'RemoveGlobalProviderSecrets1774224000000';

  private readonly obsoleteKeys = [
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_APP_SECRET_PREVIOUS',
    'META_APP_ID',
    'META_APP_SECRET',
    'MESSENGER_VERIFY_TOKEN',
    'INSTAGRAM_VERIFY_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of this.obsoleteKeys) {
      await queryRunner.query(
        `DELETE FROM \`system_configs\` WHERE \`config_key\` = ?`,
        [key],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Ces entrées étaient optionnelles — pas de restauration nécessaire.
  }
}
