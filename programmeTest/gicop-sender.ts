/**
 * gicop-sender.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Envoie des événements d'appel vers le webhook GICOP du backend.
 * Endpoint : POST /webhooks/gicop (ou la valeur de GICOP_WEBHOOK_URL)
 *
 * Le payload correspond exactement à ce qu'attend GicopWebhookService :
 *   { type, clientPhone, commercialPhone, callEventId, durationSeconds, posteId? }
 *
 * La condition pour valider une tâche d'appel :
 *   - durationSeconds ≥ 90
 *   - le contact a une catégorie mappée (commande_annulee | commande_avec_livraison | jamais_commande)
 *   - un batch PENDING existe pour ce poste
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { config } from './config.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export type GicopCallEvent = {
  type:            'call_event';
  clientPhone:     string;   // Numéro du client (ex: "225071234567")
  commercialPhone: string;   // Numéro de la commerciale
  callEventId:     string;   // ID unique de l'événement
  durationSeconds: number;   // Durée >= 90 pour valider
  posteId?:        string;   // UUID du poste (optionnel, résolu depuis commercialPhone sinon)
};

export type GicopSendResult = {
  callEventId: string;
  clientPhone:  string;
  status:       'ok' | 'error';
  httpStatus?:  number;
  response?:    unknown;
  error?:       string;
  latencyMs:    number;
};

// ── Générateur d'événements ───────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

/** Génère un numéro de client ivoirien aléatoire */
export function randomClientPhone(): string {
  const prefixes = ['07', '01', '05', '27'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0');
  return `225${prefix}${suffix}`;
}

/** Construit un payload call_event */
export function buildCallEvent(params: {
  clientPhone:     string;
  commercialPhone: string;
  durationSeconds?: number;
  posteId?:        string;
}): GicopCallEvent {
  return {
    type:            'call_event',
    clientPhone:     params.clientPhone,
    commercialPhone: params.commercialPhone,
    callEventId:     uuid(),
    durationSeconds: params.durationSeconds ?? config.callDurationSeconds,
    posteId:         params.posteId ?? config.posteId ?? undefined,
  };
}

// ── Envoi HTTP ────────────────────────────────────────────────────────────────

function signPayload(body: string): Record<string, string> {
  const secret = config.integrationSecret;
  if (!secret) return {};
  return { 'x-integration-secret': secret };
}

export async function sendCallEvent(event: GicopCallEvent): Promise<GicopSendResult> {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent':   'ProgrammeTest/3.0',
    ...signPayload(body),
  };

  const t0 = Date.now();
  try {
    const res = await axios.post(config.gicopWebhookUrl, event, {
      headers,
      timeout: 10_000,
    });
    return {
      callEventId:  event.callEventId,
      clientPhone:  event.clientPhone,
      status:       'ok',
      httpStatus:   res.status,
      response:     res.data,
      latencyMs:    Date.now() - t0,
    };
  } catch (err) {
    const axErr = err as AxiosError;
    return {
      callEventId:  event.callEventId,
      clientPhone:  event.clientPhone,
      status:       'error',
      httpStatus:   axErr.response?.status,
      error:        axErr.message,
      latencyMs:    Date.now() - t0,
    };
  }
}

/** Envoie N appels en séquence (throttle intégré pour ne pas saturer le backend) */
export async function sendCallEvents(
  events: GicopCallEvent[],
  parallelMax = config.parallelRequests,
): Promise<GicopSendResult[]> {
  const results: GicopSendResult[] = [];

  for (let i = 0; i < events.length; i += parallelMax) {
    const batch = events.slice(i, i + parallelMax);
    const batchResults = await Promise.all(batch.map(sendCallEvent));
    results.push(...batchResults);
  }

  return results;
}
