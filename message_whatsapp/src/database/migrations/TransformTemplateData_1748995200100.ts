import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransformTemplateData_1748995200100 implements MigrationInterface {
  name = 'TransformTemplateData_1748995200100';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasBodyText = await queryRunner.hasColumn('whatsapp_template', 'body_text');
    if (!hasBodyText) {
      throw new Error(
        'FixWhatsappTemplateSchema1746620000001 doit s\'exécuter avant TransformTemplateData. ' +
        'Vérifier l\'ordre des migrations.',
      );
    }

    // Si la table est vide, toutes les transformations de données sont des no-ops.
    // On saute le check DEFAULT_TENANT_ID (inutile sans données) et les UPDATEs.
    const countResult: Array<{ cnt: string }> = await queryRunner.query(
      'SELECT COUNT(*) AS cnt FROM `whatsapp_template`',
    );
    const rowCount = parseInt(countResult[0].cnt, 10);

    if (rowCount > 0) {
      const defaultTenantId = process.env.DEFAULT_TENANT_ID ?? 'default';
      if (!defaultTenantId || defaultTenantId === 'default') {
        throw new Error(
          'DEFAULT_TENANT_ID doit être défini dans .env avec l\'ID réel du tenant principal. ' +
          'Ne pas utiliser la valeur "default".',
        );
      }

      // 1. Remplir tenant_id depuis le canal associé
      await queryRunner.query(`
        UPDATE \`whatsapp_template\` t
        LEFT JOIN \`whapi_channels\` c ON c.id = t.channel_id
        SET t.tenant_id = COALESCE(c.tenant_id, ?)
        WHERE (t.tenant_id IS NULL OR t.tenant_id = 'default')
      `, [defaultTenantId]);

      // 2. Extraire body_text depuis components JSON production
      await queryRunner.query(`
        UPDATE \`whatsapp_template\`
        SET \`body_text\` = COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(\`components\`, '$.body.text')),
          JSON_UNQUOTE(JSON_EXTRACT(\`components\`, '$.body')),
          JSON_UNQUOTE(JSON_EXTRACT(\`components\`, '$.text')),
          ''
        )
        WHERE (\`body_text\` IS NULL OR \`body_text\` = '')
          AND \`components\` IS NOT NULL
      `);

      // 3. Extraire parameters et buttons depuis components
      await queryRunner.query(`
        UPDATE \`whatsapp_template\`
        SET
          \`parameters\` = JSON_EXTRACT(\`components\`, '$.parameters'),
          \`buttons\`    = JSON_EXTRACT(\`components\`, '$.buttons')
        WHERE \`parameters\` IS NULL
          AND \`components\` IS NOT NULL
      `);

      // 4. Renommer rejection_reason → rejected_reason si les deux coexistent
      const hasOldReason = await queryRunner.hasColumn('whatsapp_template', 'rejection_reason');
      const hasNewReason = await queryRunner.hasColumn('whatsapp_template', 'rejected_reason');
      if (hasOldReason && hasNewReason) {
        await queryRunner.query(`
          UPDATE \`whatsapp_template\`
          SET \`rejected_reason\` = \`rejection_reason\`
          WHERE \`rejected_reason\` IS NULL AND \`rejection_reason\` IS NOT NULL
        `);
      }

      // 5. Renommer external_id → meta_template_id si les deux coexistent
      const hasOldExtId = await queryRunner.hasColumn('whatsapp_template', 'external_id');
      const hasNewExtId = await queryRunner.hasColumn('whatsapp_template', 'meta_template_id');
      if (hasOldExtId && hasNewExtId) {
        await queryRunner.query(`
          UPDATE \`whatsapp_template\`
          SET \`meta_template_id\` = \`external_id\`
          WHERE \`meta_template_id\` IS NULL AND \`external_id\` IS NOT NULL
        `);
      }

      // 6. Normaliser category (varchar prod → ENUM V2)
      await queryRunner.query(`
        UPDATE \`whatsapp_template\`
        SET \`category\` = CASE UPPER(TRIM(\`category\`))
          WHEN 'MARKETING'      THEN 'MARKETING'
          WHEN 'AUTHENTICATION' THEN 'AUTHENTICATION'
          ELSE 'UTILITY'
        END
        WHERE \`category\` NOT IN ('MARKETING','UTILITY','AUTHENTICATION')
           OR \`category\` IS NULL
      `);
    }

    // Vérification finale du schéma post-migration
    const columns: Array<{ COLUMN_NAME: string; DATA_TYPE: string; COLUMN_TYPE: string }> =
      await queryRunner.query(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_template'
        ORDER BY ORDINAL_POSITION
      `);

    const colMap = new Map(columns.map(c => [c.COLUMN_NAME, c.COLUMN_TYPE]));
    const warnings: string[] = [];

    const catType = colMap.get('category') ?? '';
    if (!catType.startsWith('enum') || !catType.includes('MARKETING')) {
      warnings.push(`category : type actuel="${catType}", attendu=ENUM('MARKETING','UTILITY','AUTHENTICATION')`);
    }

    const statusType = colMap.get('status') ?? '';
    if (!statusType.includes('PAUSED') || !statusType.includes('IN_APPEAL')) {
      warnings.push(`status : type actuel="${statusType}", colonnes V2 PAUSED/IN_APPEAL/FLAGGED/DELETED manquantes`);
    }

    if (warnings.length > 0) {
      if (rowCount === 0) {
        // Table vide → ALTER TABLE sans risque de corruption de données
        if (!colMap.get('category')?.startsWith('enum')) {
          await queryRunner.query(
            "ALTER TABLE `whatsapp_template` MODIFY COLUMN `category` ENUM('MARKETING','UTILITY','AUTHENTICATION') NOT NULL DEFAULT 'UTILITY'",
          );
        }
        const statusType = colMap.get('status') ?? '';
        if (!statusType.includes('PAUSED') || !statusType.includes('IN_APPEAL')) {
          await queryRunner.query(
            "ALTER TABLE `whatsapp_template` MODIFY COLUMN `status` ENUM('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','IN_APPEAL','FLAGGED','DELETED') NOT NULL DEFAULT 'PENDING'",
          );
        }
      } else {
        throw new Error(
          '\n[TransformTemplateData] Schéma whatsapp_template incompatible avec V2 :\n  ' +
          warnings.join('\n  ') +
          '\n\nCes colonnes existent déjà en production avec un type SQL différent.' +
          '\nFixWhatsappTemplateSchema ne modifie pas les colonnes déjà présentes.' +
          '\n\nAction requise — exécuter les ALTER TABLE ci-dessous puis relancer npm run migration:run :' +
          '\n\n  ALTER TABLE `whatsapp_template`' +
          "\n    MODIFY COLUMN `category` ENUM('MARKETING','UTILITY','AUTHENTICATION') NOT NULL DEFAULT 'UTILITY';" +
          '\n\n  ALTER TABLE `whatsapp_template`' +
          "\n    MODIFY COLUMN `status` ENUM('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','IN_APPEAL','FLAGGED','DELETED') NOT NULL DEFAULT 'PENDING';" +
          '\n\n⚠️  Vérifier d\'abord qu\'aucune valeur existante en DB ne sort de ces ENUMs.\n',
        );
      }
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Transformation de données irréversible — restaurer le backup phpMyAdmin.
  }
}
