/**
 * P2.1 — Interface du job BullMQ pour le traitement asynchrone des webhooks.
 *
 * Le contrôleur webhook enqueue ce job après validation de la signature
 * et retourne 202 immédiatement.
 * Le worker (WebhookWorker) reprend ce job pour executer le pipeline complet.
 */

export type WebhookProvider = 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram';

export interface WebhookJobData {
  /** Provider d'origine du webhook */
  provider: WebhookProvider;
  /** Payload brut (déjà validé et authentifié par le controller) */
  payload: unknown;
  /** Tenant résolu */
  tenantId: string;
  /** Channel ID résolu (phone_number_id, page_id, bot_id, etc.) */
  channelId: string;
  /** Correlation ID pour le tracing */
  correlationId: string;
  /** Type d'événement (messages, statuses, etc.) */
  eventType: string;
  /** Timestamp d'enqueue (pour mesurer la latence queue) */
  enqueuedAt: number;
}
