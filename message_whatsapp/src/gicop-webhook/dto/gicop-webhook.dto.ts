/**
 * Payload unifié GICOP — modèle Whapi adapté.
 *
 * POST /webhooks/gicop
 * Header : x-integration-secret  (= INTEGRATION_SECRET dans SystemConfig)
 *
 * GET  /webhooks/gicop
 * Query : hub.mode=subscribe & hub.verify_token=<TOKEN> & hub.challenge=<CHALLENGE>
 */

export type GicopEventType =
  | 'order_created'
  | 'order_updated'
  | 'order_cancelled'
  | 'client_order_summary_updated'
  | 'client_certification_updated'
  | 'referral_updated'
  | 'call_event'
  | 'shipment_code_created';

export interface GicopMessage {
  /** Identifiant unique de l'événement — idempotence */
  id: string;
  /** Type d'événement */
  type: GicopEventType | string;
  /** Numéro de téléphone client ou identifiant source */
  from: string;
  /** Timestamp Unix (secondes) */
  timestamp: number;
  /** Données spécifiques à l'événement */
  data: Record<string, unknown>;
}

export interface GicopWebhookPayload {
  /** Identifiant du canal source (ex: "gicop", "erp", "call_center") */
  channel_id: string;
  event: {
    type: string;
    event: string;
  };
  /** Liste d'événements à traiter */
  messages: GicopMessage[];
}
