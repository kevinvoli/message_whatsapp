import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase post-migration : rempli scope_context_id sur les flow_bot migrés depuis
 * messages_predefinis dont le scope legacy était de type canal ou poste.
 *
 * La colonne scope_context_id a été créée par AddScopeContextToFlowbot (1744700100000).
 * La migration RemoveAutoMessageLegacy (1744000100000) ne pouvait pas la remplir
 * directement car elle tournait avant. Les infos ont été conservées dans
 * flow_trigger.config sous les clés legacyScopeContextId / legacyScopeType.
 */
export class BackfillFlowbotScopeContext1744800000000 implements MigrationInterface {
  name = 'BackfillFlowbotScopeContext1744800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.hasColumn('flow_bot', 'scope_context_id');
    if (!hasCol) return;

    // Récupérer les triggers migrés qui ont un legacyScopeContextId dans le config
    const triggers: Array<{ flow_id: string; config: string }> = await queryRunner.query(`
      SELECT ft.flow_id, ft.config
      FROM flow_trigger ft
      WHERE ft.config LIKE '%legacyScopeContextId%'
    `);

    for (const row of triggers) {
      let cfg: Record<string, unknown>;
      try {
        cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      } catch {
        continue;
      }

      const contextId = cfg.legacyScopeContextId as string | undefined;
      if (!contextId) continue;

      // Mettre à jour scope_context_id sur le flow_bot correspondant
      await queryRunner.query(
        `UPDATE \`flow_bot\` SET \`scope_context_id\` = ? WHERE \`id\` = ? AND \`scope_context_id\` IS NULL`,
        [contextId, row.flow_id],
      );

      // Nettoyer les clés legacy du config du trigger
      const { legacyScopeType: _t, legacyScopeContextId: _c, legacyScopeLabel: _l, ...cleanCfg } = cfg as Record<string, unknown> & {
        legacyScopeType?: unknown;
        legacyScopeContextId?: unknown;
        legacyScopeLabel?: unknown;
      };
      await queryRunner.query(
        `UPDATE \`flow_trigger\` SET \`config\` = ? WHERE \`flow_id\` = ?`,
        [JSON.stringify(cleanCfg), row.flow_id],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Pas de rollback nécessaire : on ne peut pas reconstruire les clés legacy
    // sans savoir ce qui était là avant.
  }
}
