import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Migration sécurisée : conversion du système legacy auto-message → FlowBot.
 *
 * Stratégie sans perte de données :
 *  1. Lit messages_predefinis + auto_message_keyword
 *  2. Crée les flow_bot / flow_trigger / flow_node / flow_edge correspondants
 *  3. RENOMME les tables legacy en _legacy_* (pas de DROP)
 *  4. Supprime les colonnes runtime de whatsapp_chat (état opérationnel sans valeur)
 *  5. Supprime les clés cron_config legacy + colonnes dispatch_settings legacy
 *
 * Rollback (down) : renomme _legacy_* → noms d'origine.
 */
export class RemoveAutoMessageLegacy1744000100000 implements MigrationInterface {
  name = 'RemoveAutoMessageLegacy1744000100000';

  // ─── Mapping trigger_type legacy → FlowTriggerType ───────────────────────

  private readonly TRIGGER_MAP: Record<string, string> = {
    no_response:  'NO_RESPONSE',
    sequence:     'CONVERSATION_OPEN',
    out_of_hours: 'OUT_OF_HOURS',
    reopened:     'CONVERSATION_REOPEN',
    queue_wait:   'QUEUE_WAIT',
    keyword:      'KEYWORD',
    client_type:  'INBOUND_MESSAGE',
    inactivity:   'INACTIVITY',
    on_assign:    'ON_ASSIGN',
  };

  private readonly TRIGGER_LABELS: Record<string, string> = {
    no_response:  'Sans réponse',
    sequence:     'Accueil',
    out_of_hours: 'Hors horaires',
    reopened:     'Réouverture',
    queue_wait:   "File d'attente",
    keyword:      'Mot-clé',
    client_type:  'Type client',
    inactivity:   'Inactivité',
    on_assign:    'Assignation',
  };

  // ─── Colonnes runtime whatsapp_chat (état, pas de données métier) ─────────

  private readonly CHAT_RUNTIME_COLS = [
    'auto_message_id',
    'current_auto_message_id',
    'auto_message_status',
    'auto_message_step',
    'waiting_client_reply',
    'last_auto_message_sent_at',
    'no_response_auto_step',
    'last_no_response_auto_sent_at',
    'out_of_hours_auto_sent',
    'reopened_auto_sent',
    'queue_wait_auto_step',
    'last_queue_wait_auto_sent_at',
    'keyword_auto_sent_at',
    'client_type_auto_sent',
    'is_known_client',
    'inactivity_auto_step',
    'last_inactivity_auto_sent_at',
    'on_assign_auto_sent',
  ];

  private readonly CRON_KEYS = [
    'auto-message',
    'auto-message-master',
    'no-response-auto-message',
    'out-of-hours-auto-message',
    'reopened-auto-message',
    'queue-wait-auto-message',
    'keyword-auto-message',
    'client-type-auto-message',
    'inactivity-auto-message',
    'on-assign-auto-message',
  ];

  private readonly DS_COLS = [
    'auto_message_enabled',
    'auto_message_delay_min_seconds',
    'auto_message_delay_max_seconds',
    'auto_message_max_steps',
  ];

  // ─── UP ──────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasMsgs = await queryRunner.hasTable('messages_predefinis');

    if (hasMsgs) {
      await this.convertToFlowBot(queryRunner);
      await this.archiveLegacyTables(queryRunner);
    }

    await this.dropRuntimeColumns(queryRunner);
    await this.cleanCronConfig(queryRunner);
    await this.dropDispatchSettingsCols(queryRunner);
  }

  // ─── DOWN ─────────────────────────────────────────────────────────────────

  public async down(queryRunner: QueryRunner): Promise<void> {
    const pairs: [string, string][] = [
      ['_legacy_auto_message_keyword',     'auto_message_keyword'],
      ['_legacy_auto_message_scope_config','auto_message_scope_config'],
      ['_legacy_messages_predefinis',      'messages_predefinis'],
    ];
    for (const [from, to] of pairs) {
      if (await queryRunner.hasTable(from)) {
        await queryRunner.query(`RENAME TABLE \`${from}\` TO \`${to}\``);
      }
    }
  }

  // ─── Conversion des données ───────────────────────────────────────────────

  private async convertToFlowBot(queryRunner: QueryRunner): Promise<void> {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Lire toutes les données source
    const messages: LegacyMessage[] = await queryRunner.query(`
      SELECT id, body, delai, canal, position, actif,
             trigger_type, scope_type, scope_id, scope_label,
             client_type_target, conditions
      FROM \`messages_predefinis\`
      ORDER BY trigger_type, scope_type, scope_id, position ASC
    `);

    if (messages.length === 0) return;

    const keywords: LegacyKeyword[] = await queryRunner.query(`
      SELECT id, keyword, match_type, case_sensitive, actif, message_auto_id
      FROM \`auto_message_keyword\`
    `);

    // Index keywords par message_auto_id
    const kwByMsg = new Map<string, LegacyKeyword[]>();
    for (const kw of keywords) {
      const list = kwByMsg.get(kw.message_auto_id) ?? [];
      list.push(kw);
      kwByMsg.set(kw.message_auto_id, list);
    }

    // Grouper par (trigger_type, scope_type, scope_id)
    const groups = new Map<string, LegacyMessage[]>();
    for (const msg of messages) {
      const key = `${msg.trigger_type}|${msg.scope_type ?? ''}|${msg.scope_id ?? ''}`;
      const list = groups.get(key) ?? [];
      list.push(msg);
      groups.set(key, list);
    }

    for (const groupMessages of groups.values()) {
      await this.createFlow(queryRunner, groupMessages, kwByMsg, now);
    }
  }

  private async createFlow(
    queryRunner: QueryRunner,
    msgs: LegacyMessage[],
    kwByMsg: Map<string, LegacyKeyword[]>,
    now: string,
  ): Promise<void> {
    const sample = msgs[0];
    const flowId = randomUUID();
    const triggerType = this.TRIGGER_MAP[sample.trigger_type] ?? 'CONVERSATION_OPEN';
    const label = this.TRIGGER_LABELS[sample.trigger_type] ?? sample.trigger_type;
    const scopeLabel = sample.scope_label ? ` — ${sample.scope_label}` : '';
    const flowName = `[Migré] ${label}${scopeLabel}`;
    const isActive = msgs.some((m) => m.actif == 1 || m.actif === true);

    // Scope — scope_context_id n'est pas encore créé à ce timestamp de migration
    // (AddScopeContextToFlowbot tourne après). On stocke l'info dans le trigger config.
    let scopeProviderRef: string | null = null;
    if (sample.scope_type === 'provider') scopeProviderRef = sample.scope_id ?? null;

    // ── flow_bot ──────────────────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO \`flow_bot\`
         (id, name, description, is_active, priority,
          scope_channel_type, scope_provider_ref,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
      [
        flowId,
        flowName,
        `Converti depuis messages_predefinis — trigger: ${sample.trigger_type}`,
        isActive ? 1 : 0,
        scopeProviderRef,
        now, now,
      ],
    );

    // ── flow_trigger ──────────────────────────────────────────────────────
    const triggerConfig = this.buildTriggerConfig(sample, msgs, kwByMsg, scopeProviderRef);
    await queryRunner.query(
      `INSERT INTO \`flow_trigger\` (id, flow_id, trigger_type, config, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), flowId, triggerType, JSON.stringify(triggerConfig), isActive ? 1 : 0],
    );

    // ── Construire la chaîne de nœuds ─────────────────────────────────────
    type NodeSpec = { id: string; type: string; label: string; config: object; posY: number };
    const nodes: NodeSpec[] = [];

    for (const msg of msgs) {
      const delai = Number(msg.delai ?? 0);
      if (delai > 0) {
        nodes.push({
          id: randomUUID(),
          type: 'WAIT',
          label: `Attente ${delai}s`,
          config: { seconds: delai, reason: 'delay_before_message' },
          posY: nodes.length * 150 + 150,
        });
      }
      nodes.push({
        id: randomUUID(),
        type: 'MESSAGE',
        label: msg.body.substring(0, 60).replace(/\n/g, ' '),
        config: { body: this.convertVariables(msg.body), canal: msg.canal ?? 'whatsapp' },
        posY: nodes.length * 150 + 150,
      });
    }

    nodes.push({
      id: randomUUID(),
      type: 'END',
      label: 'Fin',
      config: {},
      posY: nodes.length * 150 + 150,
    });

    // ── flow_node ─────────────────────────────────────────────────────────
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      await queryRunner.query(
        `INSERT INTO \`flow_node\`
           (id, flow_id, type, label, position_x, position_y,
            config, timeout_seconds, is_entry_point)
         VALUES (?, ?, ?, ?, 100, ?, ?, NULL, ?)`,
        [n.id, flowId, n.type, n.label, n.posY, JSON.stringify(n.config), i === 0 ? 1 : 0],
      );
    }

    // ── flow_edge (chaîne linéaire) ────────────────────────────────────────
    for (let i = 0; i < nodes.length - 1; i++) {
      await queryRunner.query(
        `INSERT INTO \`flow_edge\`
           (id, flow_id, source_node_id, target_node_id,
            condition_type, condition_value, condition_negate, sort_order)
         VALUES (?, ?, ?, ?, 'always', NULL, 0, ?)`,
        [randomUUID(), flowId, nodes[i].id, nodes[i + 1].id, i],
      );
    }
  }

  private buildTriggerConfig(
    sample: LegacyMessage,
    allMsgs: LegacyMessage[],
    kwByMsg: Map<string, LegacyKeyword[]>,
    scopeProviderRef: string | null,
  ): Record<string, unknown> {
    const cfg: Record<string, unknown> = {};

    // Scope canal/poste : scope_context_id sera dispo après AddScopeContextToFlowbot.
    // On stocke l'info ici pour qu'elle ne soit pas perdue.
    if ((sample.scope_type === 'canal' || sample.scope_type === 'poste') && sample.scope_id) {
      cfg.legacyScopeType = sample.scope_type;
      cfg.legacyScopeContextId = sample.scope_id;
      if (sample.scope_label) cfg.legacyScopeLabel = sample.scope_label;
    }

    // Filtre client_type_target
    if (sample.client_type_target && sample.client_type_target !== 'all') {
      cfg.clientTypeTarget = sample.client_type_target;
    }

    // Pour les flux keyword : collecter tous les mots-clés du groupe
    if (sample.trigger_type === 'keyword') {
      const allKeywords: Array<{ keyword: string; matchType: string; caseSensitive: boolean }> = [];
      for (const msg of allMsgs) {
        for (const kw of kwByMsg.get(msg.id) ?? []) {
          allKeywords.push({
            keyword: kw.keyword,
            matchType: kw.match_type,
            caseSensitive: kw.case_sensitive == 1 || kw.case_sensitive === true,
          });
        }
      }
      if (allKeywords.length > 0) cfg.keywords = allKeywords;
    }

    // Conserver les conditions JSON éventuelles
    if (sample.conditions) {
      try {
        const parsed = typeof sample.conditions === 'string'
          ? JSON.parse(sample.conditions)
          : sample.conditions;
        if (parsed && typeof parsed === 'object') cfg.legacyConditions = parsed;
      } catch {
        // conditions non-JSON, ignorer
      }
    }

    return cfg;
  }

  // ─── Archivage (RENAME, pas DROP) ─────────────────────────────────────────

  private async archiveLegacyTables(queryRunner: QueryRunner): Promise<void> {
    // FK d'abord
    if (await queryRunner.hasTable('auto_message_keyword')) {
      await queryRunner.query(
        'RENAME TABLE `auto_message_keyword` TO `_legacy_auto_message_keyword`',
      );
    }
    if (await queryRunner.hasTable('auto_message_scope_config')) {
      await queryRunner.query(
        'RENAME TABLE `auto_message_scope_config` TO `_legacy_auto_message_scope_config`',
      );
    }
    // business_hours_config est conservée telle quelle — FlowBot l'utilise pour isOutOfHours
    if (await queryRunner.hasTable('messages_predefinis')) {
      await queryRunner.query(
        'RENAME TABLE `messages_predefinis` TO `_legacy_messages_predefinis`',
      );
    }
  }

  // ─── Nettoyage colonnes / clés ────────────────────────────────────────────

  private async dropRuntimeColumns(queryRunner: QueryRunner): Promise<void> {
    for (const col of this.CHAT_RUNTIME_COLS) {
      if (await queryRunner.hasColumn('whatsapp_chat', col)) {
        await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`${col}\``);
      }
    }
  }

  private async cleanCronConfig(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('cron_config'))) return;
    const placeholders = this.CRON_KEYS.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`cron_config\` WHERE \`key\` IN (${placeholders})`,
      this.CRON_KEYS,
    );
  }

  private async dropDispatchSettingsCols(queryRunner: QueryRunner): Promise<void> {
    for (const col of this.DS_COLS) {
      if (await queryRunner.hasColumn('dispatch_settings', col)) {
        await queryRunner.query(`ALTER TABLE \`dispatch_settings\` DROP COLUMN \`${col}\``);
      }
    }
  }

  /** Convertit la syntaxe legacy #name# → {contact_name}, #numero# → {contact_phone} */
  private convertVariables(text: string): string {
    return text
      .replace(/#name#/gi, '{contact_name}')
      .replace(/#numero#/gi, '{contact_phone}')
      .replace(/#phone#/gi, '{contact_phone}');
  }
}

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface LegacyMessage {
  id: string;
  body: string;
  delai: number | null;
  canal: string | null;
  position: number;
  actif: number | boolean;
  trigger_type: string;
  scope_type: string | null;
  scope_id: string | null;
  scope_label: string | null;
  client_type_target: string | null;
  conditions: string | null;
}

interface LegacyKeyword {
  id: string;
  keyword: string;
  match_type: string;
  case_sensitive: number | boolean;
  actif: number | boolean;
  message_auto_id: string;
}
