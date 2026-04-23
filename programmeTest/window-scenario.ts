/**
 * window-scenario.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scénarios de test pour les conditions de coulissement de la fenêtre glissante.
 *
 * FENÊTRE GLISSANTE (Phase 9) :
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  Bloc de N conversations (défaut 10)                          │
 *   │  Chaque conversation doit valider ses critères                │
 *   │  Quand toutes sont validées → la fenêtre "coulisse" (rotate)  │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * OBLIGATIONS D'APPELS (Sprint 6) — conditions pour compléter un batch :
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  15 appels requis = 5 × 3 catégories                         │
 *   │  Catégories : commande_annulee | commande_avec_livraison |    │
 *   │               jamais_commande                                 │
 *   │  Durée minimale : 90 secondes par appel                      │
 *   │  + Contrôle qualité messages (dernier message = commercial)   │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { config } from './config.ts';
import {
  buildCallEvent,
  sendCallEvents,
  sendCallEvent,
  randomClientPhone,
  type GicopSendResult,
} from './gicop-sender.ts';

// ── Couleurs console ──────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  blue:   '\x1b[34m',
};

function log(msg: string) { console.log(msg); }
function ok(msg: string)  { log(`${C.green}✓${C.reset} ${msg}`); }
function err(msg: string) { log(`${C.red}✗${C.reset} ${msg}`); }
function info(msg: string){ log(`${C.cyan}ℹ${C.reset} ${msg}`); }
function sep()            { log(`${C.gray}${'─'.repeat(60)}${C.reset}`); }

// ── Affichage rapport ─────────────────────────────────────────────────────────

function printResults(results: GicopSendResult[]) {
  const ok_count    = results.filter(r => r.status === 'ok').length;
  const err_count   = results.filter(r => r.status === 'error').length;
  const latencies   = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

  log('');
  log(`${C.bold}  Résultats${C.reset}`);
  log(`  Envoyés  : ${results.length}`);
  log(`  Succès   : ${C.green}${ok_count}${C.reset}`);
  log(`  Erreurs  : ${err_count > 0 ? C.red : C.gray}${err_count}${C.reset}`);
  log(`  Latence  : p50=${p50}ms  p95=${p95}ms`);

  const errors = results.filter(r => r.status === 'error');
  if (errors.length > 0) {
    log('');
    log(`${C.red}  Détails erreurs :${C.reset}`);
    for (const e of errors) {
      log(`    ${e.clientPhone} — HTTP ${e.httpStatus ?? 'N/A'} — ${e.error}`);
    }
  }
}

// ── SCÉNARIO 1 : Appel unique ─────────────────────────────────────────────────

export async function scenarioSingleCall() {
  sep();
  log(`${C.bold}SCÉNARIO : Appel unique${C.reset}`);
  info(`Envoie 1 appel vers ${config.gicopWebhookUrl}`);
  info(`Commercial : ${config.commercialPhone}  Durée : ${config.callDurationSeconds}s`);
  sep();

  const clientPhone = config.clientPhones[0] ?? randomClientPhone();
  const event = buildCallEvent({
    clientPhone,
    commercialPhone: config.commercialPhone,
    durationSeconds: config.callDurationSeconds,
  });

  info(`Client : ${clientPhone}  callEventId : ${event.callEventId}`);
  const result = await sendCallEvent(event);

  if (result.status === 'ok') {
    ok(`HTTP ${result.httpStatus}  latence=${result.latencyMs}ms`);
    log(`  Réponse : ${JSON.stringify(result.response)}`);
  } else {
    err(`HTTP ${result.httpStatus ?? 'N/A'}  ${result.error}`);
  }
}

// ── SCÉNARIO 2 : Obligations complètes (15 appels, 5 par catégorie) ───────────

export async function scenarioObligations() {
  sep();
  log(`${C.bold}SCÉNARIO : Obligations d'appels — batch complet${C.reset}`);
  log(`
  Conditions pour compléter un batch GICOP :
  ${C.yellow}•${C.reset} 5 appels "commande_annulee"       → clients qui ont annulé une commande
  ${C.yellow}•${C.reset} 5 appels "commande_avec_livraison" → clients livrés
  ${C.yellow}•${C.reset} 5 appels "jamais_commande"         → clients sans commande
  ${C.yellow}•${C.reset} Durée ≥ 90s  (configuré : ${config.callDurationSeconds}s)
  ${C.yellow}•${C.reset} Un batch PENDING doit exister (créé via POST /call-obligations/init-all)
  `);
  sep();

  // On utilise les phones configurés ou on génère des aléatoires
  const phones = config.clientPhones.length >= 15
    ? config.clientPhones.slice(0, 15)
    : Array.from({ length: 15 }, (_, i) => config.clientPhones[i] ?? randomClientPhone());

  const events = phones.map((clientPhone, i) =>
    buildCallEvent({
      clientPhone,
      commercialPhone: config.commercialPhone,
      durationSeconds: config.callDurationSeconds,
    })
  );

  info(`Envoi de ${events.length} appels (${config.parallelRequests} en parallèle)…`);

  const results = await sendCallEvents(events, config.parallelRequests);
  printResults(results);

  const ok_count = results.filter(r => r.status === 'ok').length;
  log('');
  if (ok_count === 15) {
    log(`${C.green}${C.bold}  ✓ Tous les appels envoyés — vérifier dans l'admin si le batch est COMPLETE${C.reset}`);
  } else {
    log(`${C.yellow}  ⚠ ${ok_count}/15 appels réussis — le batch risque d'être incomplet${C.reset}`);
  }
  log(`${C.gray}  → Admin : GET /call-obligations/poste/:posteId pour vérifier l'état${C.reset}`);
}

// ── SCÉNARIO 3 : Appel trop court (< 90s) ────────────────────────────────────

export async function scenarioShortCall() {
  sep();
  log(`${C.bold}SCÉNARIO : Appel trop court (< 90s — doit être REJETÉ)${C.reset}`);
  info(`Durée envoyée : 45s  (minimum requis : 90s)`);
  sep();

  const event = buildCallEvent({
    clientPhone:     config.clientPhones[0] ?? randomClientPhone(),
    commercialPhone: config.commercialPhone,
    durationSeconds: 45,  // intentionnellement trop court
  });

  const result = await sendCallEvent(event);
  if (result.status === 'ok') {
    const resp = result.response as Record<string, unknown> | undefined;
    const matched = resp?.matched === true;
    if (!matched) {
      ok(`Rejeté correctement (matched=false)  HTTP ${result.httpStatus}`);
      log(`  Raison : ${resp?.reason ?? 'durée_insuffisante'}`);
    } else {
      err(`PROBLÈME : l'appel court a été accepté (matched=true) !`);
    }
  } else {
    err(`Erreur HTTP ${result.httpStatus} — ${result.error}`);
  }
}

// ── SCÉNARIO 4 : Fenêtre glissante ───────────────────────────────────────────

export async function scenarioWindow() {
  sep();
  log(`${C.bold}SCÉNARIO : Fenêtre glissante (sliding window)${C.reset}`);
  log(`
  Pour que la fenêtre coulisse, les conditions suivantes doivent toutes être remplies :

  ${C.yellow}[1]${C.reset} Un bloc de conversations est ouvert (via messages webhook)
  ${C.yellow}[2]${C.reset} Chaque conversation doit valider ses critères
       → Critère "result_set"  : résultat métier renseigné (outcome)
       → Critère "call_made"   : au moins un appel ≥ 90s (si activé)
  ${C.yellow}[3]${C.reset} Le batch d'obligations d'appels est COMPLETE (si SLIDING_WINDOW_ENABLED=true)
  ${C.yellow}[4]${C.reset} FF_STICKY_ASSIGNMENT=true & SLIDING_WINDOW_ENABLED=true

  ${C.cyan}Ce scénario envoie :${C.reset}
  ${C.gray}•${C.reset} ${config.windowSize} appels simulés (1 par conversation du bloc)
  ${C.gray}•${C.reset} Durée : ${config.callDurationSeconds}s (≥ 90 → valide)
  `);
  sep();

  const phones = Array.from(
    { length: config.windowSize },
    (_, i) => config.clientPhones[i] ?? randomClientPhone()
  );

  info(`Envoi de ${phones.length} appels (taille bloc = ${config.windowSize})…`);

  const events = phones.map(clientPhone =>
    buildCallEvent({ clientPhone, commercialPhone: config.commercialPhone })
  );

  const results = await sendCallEvents(events);
  printResults(results);

  const ok_count = results.filter(r => r.status === 'ok').length;
  log('');
  log(`${C.bold}  Vérifications à faire côté admin :${C.reset}`);
  log(`  ${C.gray}1.${C.reset} GET /call-obligations/poste/:posteId → batch status COMPLETE ?`);
  log(`  ${C.gray}2.${C.reset} GET /window/status/:posteId          → window_slot avancé ?`);
  log(`  ${C.gray}3.${C.reset} GoNoGoView dans l'admin              → GICOP gates au vert ?`);
  log('');
  if (ok_count === config.windowSize) {
    ok(`${ok_count} appels envoyés — fenêtre prête à coulisser si les autres critères sont validés`);
  } else {
    log(`${C.yellow}  ⚠ Seulement ${ok_count}/${config.windowSize} appels réussis${C.reset}`);
  }
}

// ── SCÉNARIO 5 : Diagnostic rapide ───────────────────────────────────────────

export async function scenarioPing() {
  sep();
  log(`${C.bold}SCÉNARIO : Diagnostic (1 appel valide + 1 trop court)${C.reset}`);
  sep();

  info('Appel valide (120s)…');
  const validEvent = buildCallEvent({
    clientPhone:     config.clientPhones[0] ?? randomClientPhone(),
    commercialPhone: config.commercialPhone,
    durationSeconds: 120,
  });
  const r1 = await sendCallEvent(validEvent);
  r1.status === 'ok'
    ? ok(`HTTP ${r1.httpStatus}  matched=${(r1.response as Record<string,unknown>)?.matched}  latence=${r1.latencyMs}ms`)
    : err(`HTTP ${r1.httpStatus}  ${r1.error}`);

  info('Appel trop court (30s)…');
  const shortEvent = buildCallEvent({
    clientPhone:     config.clientPhones[1] ?? randomClientPhone(),
    commercialPhone: config.commercialPhone,
    durationSeconds: 30,
  });
  const r2 = await sendCallEvent(shortEvent);
  if (r2.status === 'ok') {
    const matched = (r2.response as Record<string,unknown>)?.matched;
    matched === false
      ? ok(`Rejeté correctement (matched=false)  HTTP ${r2.httpStatus}`)
      : err(`Appel court accepté — matched=${matched}`);
  } else {
    err(`HTTP ${r2.httpStatus}  ${r2.error}`);
  }
}
