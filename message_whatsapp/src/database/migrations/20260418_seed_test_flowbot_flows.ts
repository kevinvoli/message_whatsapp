import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Seed de flows FlowBot de test — un flow par type de trigger possible.
 *
 * Objectif : vérifier que le moteur FlowBot envoie bien les messages
 * automatiques pour chaque déclencheur. Tous les flows sont actifs
 * et ont des messages explicites indiquant quel trigger les a déclenchés.
 *
 * Pour désactiver après validation : mettre is_active = 0 sur les flows
 * ou exécuter la migration down().
 *
 * Priorités (plus élevé = évalué en premier) :
 *   100 — OUT_OF_HOURS
 *    90 — KEYWORD
 *    80 — CONVERSATION_OPEN
 *    75 — CONVERSATION_REOPEN
 *    70 — ON_ASSIGN
 *    60 — INBOUND_MESSAGE (nouveau client)
 *    55 — INBOUND_MESSAGE (client fidèle)
 *    10 — INBOUND_MESSAGE (tous clients — fallback)
 *    40 — NO_RESPONSE        (déclenché par polling job)
 *    35 — QUEUE_WAIT         (déclenché par polling job)
 *    30 — INACTIVITY         (déclenché par polling job)
 */
export class SeedTestFlowbotFlows1744900000000 implements MigrationInterface {
  name = 'SeedTestFlowbotFlows1744900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Garde-fou : ne pas insérer deux fois
    const existing = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM \`flow_bot\` WHERE \`name\` LIKE '[Test]%'`,
    );
    if (Number(existing[0]?.cnt ?? 0) > 0) return;

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // ── 1. Hors horaires ──────────────────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Hors horaires — Message automatique',
      description:
        "Déclenché quand un message arrive EN DEHORS des horaires d'ouverture. " +
        "Configuré dans business_hours_config. Trigger : OUT_OF_HOURS.",
      triggerType: 'OUT_OF_HOURS',
      triggerConfig: {},
      priority: 100,
      messageLabel: 'Message hors horaires',
      messageBody:
        "Bonjour {contact_name} ! Vous nous contactez en dehors de nos horaires d'ouverture. " +
        "Nous avons bien reçu votre message et un agent vous répondra dès notre prochaine ouverture. " +
        "Merci pour votre patience. [TRIGGER: OUT_OF_HOURS]",
    });

    // ── 2. Mot-clé ────────────────────────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Mot-clé — Prix / Tarif / Devis',
      description:
        'Déclenché quand le message du client contient un des mots-clés : ' +
        '"prix", "tarif", "devis", "cout", "coût". Trigger : KEYWORD.',
      triggerType: 'KEYWORD',
      triggerConfig: {
        keywords: [
          { keyword: 'prix',  matchType: 'contains', caseSensitive: false },
          { keyword: 'tarif', matchType: 'contains', caseSensitive: false },
          { keyword: 'tarifs', matchType: 'contains', caseSensitive: false },
          { keyword: 'devis', matchType: 'contains', caseSensitive: false },
          { keyword: 'cout',  matchType: 'contains', caseSensitive: false },
          { keyword: 'coût',  matchType: 'contains', caseSensitive: false },
        ],
      },
      priority: 90,
      messageLabel: 'Réponse mot-clé tarif',
      messageBody:
        "Bonjour {contact_name}, merci pour votre question concernant nos tarifs. " +
        "Un agent va vous transmettre toutes les informations nécessaires dans les plus brefs délais. " +
        "[TRIGGER: KEYWORD — prix/tarif/devis]",
    });

    // ── 3. Nouvelle conversation ──────────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Accueil — Nouvelle conversation',
      description:
        "Déclenché lors de l'ouverture d'une toute nouvelle conversation (jamais vue). " +
        "Condition : conversation.createdAt < 10 secondes. Trigger : CONVERSATION_OPEN.",
      triggerType: 'CONVERSATION_OPEN',
      triggerConfig: {},
      priority: 80,
      messageLabel: 'Message de bienvenue',
      messageBody:
        "Bonjour {contact_name} ! Bienvenue. Votre demande a bien été reçue et un agent " +
        "va prendre en charge votre conversation très prochainement. Merci de votre confiance. " +
        "[TRIGGER: CONVERSATION_OPEN]",
    });

    // ── 4. Réouverture ────────────────────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Réouverture — Conversation réouverte',
      description:
        "Déclenché quand une conversation fermée est réouverte par le client. " +
        "Condition : conversation.reopened_at IS NOT NULL. Trigger : CONVERSATION_REOPEN.",
      triggerType: 'CONVERSATION_REOPEN',
      triggerConfig: {},
      priority: 75,
      messageLabel: 'Message de réouverture',
      messageBody:
        "Bonjour {contact_name}, votre conversation vient d'être réouverte. " +
        "Un agent va vous répondre très bientôt. N'hésitez pas à décrire votre demande. " +
        "[TRIGGER: CONVERSATION_REOPEN]",
    });

    // ── 5. Assignation à un agent ─────────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Assignation — Agent assigné à la conversation',
      description:
        "Déclenché quand un agent est manuellement assigné à la conversation. " +
        "Condition : event.agentAssignedRef est défini. Trigger : ON_ASSIGN.",
      triggerType: 'ON_ASSIGN',
      triggerConfig: {},
      priority: 70,
      messageLabel: 'Message d\'assignation',
      messageBody:
        "Bonjour {contact_name}, votre conversation vient d'être prise en charge par un de nos agents. " +
        "Vous allez recevoir une réponse personnalisée très prochainement. Merci pour votre patience. " +
        "[TRIGGER: ON_ASSIGN]",
    });

    // ── 6. Message entrant — Nouveau client ───────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Message entrant — Nouveau client (première fois)',
      description:
        "Déclenché pour tout message entrant d'un contact jamais vu (conv.isKnownContact = false). " +
        "Trigger : INBOUND_MESSAGE avec clientTypeTarget = 'new'.",
      triggerType: 'INBOUND_MESSAGE',
      triggerConfig: { clientTypeTarget: 'new' },
      priority: 60,
      messageLabel: 'Accueil nouveau client',
      messageBody:
        "Bienvenue {contact_name} ! C'est votre première prise de contact avec nous. " +
        "Nous sommes ravis de vous accueillir. Un agent va s'occuper de votre demande dès que possible. " +
        "[TRIGGER: INBOUND_MESSAGE — nouveau client]",
    });

    // ── 7. Message entrant — Client fidèle ────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Message entrant — Client fidèle (connu)',
      description:
        "Déclenché pour tout message entrant d'un contact déjà connu (conv.isKnownContact = true). " +
        "Trigger : INBOUND_MESSAGE avec clientTypeTarget = 'returning'.",
      triggerType: 'INBOUND_MESSAGE',
      triggerConfig: { clientTypeTarget: 'returning' },
      priority: 55,
      messageLabel: 'Accueil client fidèle',
      messageBody:
        "Bonjour {contact_name}, nous sommes ravis de vous revoir ! " +
        "Un agent va prendre en charge votre demande dans les meilleurs délais. " +
        "[TRIGGER: INBOUND_MESSAGE — client fidèle]",
    });

    // ── 8. Message entrant — Tous clients (fallback) ──────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Message entrant — Tous clients (fallback)',
      description:
        "Déclenché pour n'importe quel message entrant si aucun flow de priorité supérieure ne correspond. " +
        "Trigger : INBOUND_MESSAGE avec clientTypeTarget = 'all'. Sert de message de confirmation universel.",
      triggerType: 'INBOUND_MESSAGE',
      triggerConfig: { clientTypeTarget: 'all' },
      priority: 10,
      messageLabel: 'Confirmation réception',
      messageBody:
        "Bonjour {contact_name}, nous avons bien reçu votre message. " +
        "Un agent va prendre en charge votre demande très prochainement. " +
        "[TRIGGER: INBOUND_MESSAGE — tous clients / fallback]",
    });

    // ── 9. Sans réponse (polling) ─────────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Sans réponse — Relance automatique (30 min)',
      description:
        "Déclenché par le polling job toutes les minutes. " +
        "Condition : session en WAITING_REPLY depuis plus de 30 minutes sans réponse du client. " +
        "Trigger : NO_RESPONSE.",
      triggerType: 'NO_RESPONSE',
      triggerConfig: {},
      priority: 40,
      messageLabel: 'Relance sans réponse',
      messageBody:
        "Bonjour {contact_name}, nous n'avons pas eu de vos nouvelles depuis un moment. " +
        "Avez-vous toujours besoin d'aide ? N'hésitez pas à nous répondre si c'est le cas. " +
        "[TRIGGER: NO_RESPONSE — 30 min sans réponse]",
    });

    // ── 10. File d'attente (polling) ──────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: "[Test] File d'attente — Message de patience (30 min)",
      description:
        "Déclenché par le polling job toutes les 5 minutes. " +
        "Condition : conversation status='en attente', aucun agent assigné (poste_id IS NULL), " +
        "last_client_message_at >= 30 min. Respecte la fenêtre 23h WhatsApp. Trigger : QUEUE_WAIT.",
      triggerType: 'QUEUE_WAIT',
      triggerConfig: {},
      priority: 35,
      messageLabel: 'Message file d\'attente',
      messageBody:
        "Bonjour {contact_name}, merci pour votre patience ! " +
        "Votre demande est bien enregistrée et un agent va vous répondre dès que possible. " +
        "Nous faisons de notre mieux pour traiter chaque demande dans les meilleurs délais. " +
        "[TRIGGER: QUEUE_WAIT — 30 min en attente sans agent]",
    });

    // ── 11. Inactivité (polling) ──────────────────────────────────────────────
    await this.createFlow(queryRunner, now, {
      name: '[Test] Inactivité — Relance après 2 heures',
      description:
        "Déclenché par le polling job toutes les 5 minutes. " +
        "Condition : conversation active ou en attente sans aucune activité depuis 120 minutes. " +
        "Respecte la fenêtre 23h WhatsApp. Trigger : INACTIVITY.",
      triggerType: 'INACTIVITY',
      triggerConfig: {},
      priority: 30,
      messageLabel: 'Relance inactivité',
      messageBody:
        "Bonjour {contact_name}, votre conversation semble inactive depuis un moment. " +
        "Êtes-vous toujours là ? N'hésitez pas à nous contacter si vous avez besoin d'aide — " +
        "nous sommes disponibles pour vous. " +
        "[TRIGGER: INACTIVITY — 2h sans activité]",
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`flow_bot\` WHERE \`name\` LIKE '[Test]%'`,
    );
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async createFlow(
    queryRunner: QueryRunner,
    now: string,
    opts: {
      name: string;
      description: string;
      triggerType: string;
      triggerConfig: Record<string, unknown>;
      priority: number;
      messageLabel: string;
      messageBody: string;
    },
  ): Promise<void> {
    const flowId    = randomUUID();
    const msgNodeId = randomUUID();
    const endNodeId = randomUUID();
    const triggerId = randomUUID();
    const edgeId    = randomUUID();

    // flow_bot
    await queryRunner.query(
      `INSERT INTO \`flow_bot\`
         (id, name, description, is_active, priority,
          scope_channel_type, scope_provider_ref, scope_context_id,
          created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, NULL, NULL, NULL, ?, ?)`,
      [flowId, opts.name, opts.description, opts.priority, now, now],
    );

    // flow_trigger
    await queryRunner.query(
      `INSERT INTO \`flow_trigger\` (id, flow_id, trigger_type, config, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [triggerId, flowId, opts.triggerType, JSON.stringify(opts.triggerConfig)],
    );

    // flow_node — MESSAGE (point d'entrée)
    await queryRunner.query(
      `INSERT INTO \`flow_node\`
         (id, flow_id, type, label, position_x, position_y, config, timeout_seconds, is_entry_point)
       VALUES (?, ?, 'MESSAGE', ?, 100, 150, ?, NULL, 1)`,
      [
        msgNodeId,
        flowId,
        opts.messageLabel,
        JSON.stringify({ body: opts.messageBody, typingDelaySeconds: 1 }),
      ],
    );

    // flow_node — END
    await queryRunner.query(
      `INSERT INTO \`flow_node\`
         (id, flow_id, type, label, position_x, position_y, config, timeout_seconds, is_entry_point)
       VALUES (?, ?, 'END', 'Fin', 100, 300, '{}', NULL, 0)`,
      [endNodeId, flowId],
    );

    // flow_edge — MESSAGE → END
    await queryRunner.query(
      `INSERT INTO \`flow_edge\`
         (id, flow_id, source_node_id, target_node_id, condition_type, condition_value, condition_negate, sort_order)
       VALUES (?, ?, ?, ?, 'always', NULL, 0, 0)`,
      [edgeId, flowId, msgNodeId, endNodeId],
    );
  }
}
