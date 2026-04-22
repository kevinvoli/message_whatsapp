/**
 * S0-007 — Socle d'observabilité GICOP
 *
 * Constantes de logs structurés obligatoires pour chaque lot GICOP.
 * Chaque événement est loggé sous la forme : EVENT_KEY key=value key=value
 *
 * Utilisation : this.logger.log(`${GicopLogEvent.AFFINITY_HIT} trace=... chat_id=...`)
 */

export const GicopLogEvent = {
  // ─── Lot A — Sticky assignment ──────────────────────────────────────────────
  AFFINITY_HIT:        'AFFINITY_HIT',        // contact réaffecté à son poste d'affinité
  AFFINITY_WAITING:    'AFFINITY_WAITING',     // poste d'affinité hors-ligne, fallback queue
  AFFINITY_FALLBACK:   'AFFINITY_FALLBACK',    // poste d'affinité à capacité, fallback queue
  AFFINITY_OVERRIDDEN: 'AFFINITY_OVERRIDDEN',  // canal dédié prime sur l'affinité
  AFFINITY_CREATED:    'AFFINITY_CREATED',     // première affinité créée pour ce contact
  AFFINITY_UPDATED:    'AFFINITY_UPDATED',     // affinité transférée vers un nouveau poste
  AFFINITY_RELEASED:   'AFFINITY_RELEASED',    // affinité libérée (raison dans les données)

  // ─── Lot B — Capacité ───────────────────────────────────────────────────────
  CAPACITY_ALL_FULL:   'CAPACITY_ALL_FULL',    // tous les postes pool ont atteint le quota actif
  CAPACITY_FULL:       'CAPACITY_FULL',        // un poste spécifique a atteint son quota

  // ─── Lot C — Rapport GICOP (à venir Sprint 4) ───────────────────────────────
  REPORT_SAVED:        'REPORT_REPORT_SAVED',
  REPORT_VALIDATED:    'REPORT_VALIDATED',
  CLOSE_BLOCKED:       'CLOSE_BLOCKED',        // cloture bloquée car rapport incomplet

  // ─── Lot D/E — Satisfaction / Relances (à venir Sprint 5) ───────────────────
  SATISFACTION_SENT:   'SATISFACTION_SENT',
  FOLLOWUP_SCHEDULED:  'FOLLOWUP_SCHEDULED',
  FOLLOWUP_SENT:       'FOLLOWUP_SENT',

  // ─── Lot F — Obligations d'appels (à venir Sprint 6) ────────────────────────
  BATCH_CREATED:       'BATCH_CREATED',
  CALL_TASK_CREATED:   'CALL_TASK_CREATED',
  CALL_TASK_VALIDATED: 'CALL_TASK_VALIDATED',
  CALL_TASK_FAILED:    'CALL_TASK_FAILED',

  // ─── Lot G — Automations commande (à venir Sprint 7) ────────────────────────
  ORDER_RECAP_SENT:    'ORDER_RECAP_SENT',
  SHIPMENT_CODE_SENT:  'SHIPMENT_CODE_SENT',
  ERP_EVENT_IGNORED:   'ERP_EVENT_IGNORED',    // policy 24h bloquante

  // ─── Dispatch général ────────────────────────────────────────────────────────
  DISPATCH_START:      'DISPATCH_START',
  DISPATCH_REOPEN:     'DISPATCH_REOPEN',
} as const;

export type GicopLogEventKey = (typeof GicopLogEvent)[keyof typeof GicopLogEvent];

/**
 * S0-006 — Crons à suspendre en recette GICOP
 *
 * Ces crons peuvent perturber un scénario de recette contrôlé.
 * Ils sont pilotables via l'admin panel (CronConfig) ou via l'API :
 *   PATCH /cron-config/:name  { "is_enabled": false }
 */
export const GicopCronSuspendList = [
  {
    name: 'read-only-enforcement',
    reason: 'Ferme les conversations idle — risque de clôture auto pendant la recette',
    adminAction: 'Désactiver ou augmenter ttlDays à 999',
  },
  {
    name: 'window-external-timeout',
    reason: 'Auto-valide le critère call_confirmed après timeout — fausse les métriques de recette',
    adminAction: 'Mettre WINDOW_EXTERNAL_TIMEOUT_HOURS=0 (désactivé)',
  },
  {
    name: 'flow-polling-queue-wait',
    reason: 'Réassigne les conversations orphelines après 30 min — peut interférer avec les scénarios de test',
    adminAction: 'Désactiver via CronConfig job pollQueueWait',
  },
  {
    name: 'flow-polling-inactivity',
    reason: 'Clôture les sessions FlowBot inactives — peut terminer des conversations de test',
    adminAction: 'Désactiver via CronConfig job pollInactivity',
  },
] as const;
