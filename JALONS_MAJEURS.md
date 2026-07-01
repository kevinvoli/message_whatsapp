# Jalons majeurs — Plateforme de Messagerie WhatsApp

> Branche : `production` · Référence : `RAPPORT_ARCHITECTURE.md`
> Plans détaillés : `PLAN_IMPLEMENTATION_INTERNE.md` · `PLAN_IMPLEMENTATION_EXTERNE.md`

---

## Règles de développement durable — OBLIGATIONS ABSOLUES

Ces règles s'appliquent à **chaque jalon**, sans exception.
Elles constituent des critères de sortie (Definition of Done) pour chaque livraison.

| Code | Règle | Bloquant |
|---|---|---|
| R1 | Toute nouvelle feature backend doit avoir ≥ 1 test unitaire sur le service | PR review |
| R2 | Tout nouveau hook React doit avoir ≥ 1 test Vitest | PR review |
| R3 | Toute migration SQL doit avoir un commentaire décrivant le rollback | PR review |
| R4 | Zéro `any` TypeScript | PR review |
| R5 | Zéro requête SQL dans une boucle — utiliser `IN (:...ids)` ou jointures | PR review |
| R6 | Tout endpoint exposé publiquement doit être rate-limité | PR review |
| R7 | Les constantes Socket.IO ne sont jamais dupliquées — shared package uniquement | PR review |

## Points d'excellence à préserver à chaque jalon

| Code | Principe | Règle concrète |
|---|---|---|
| E1 | Sécurité webhooks HMAC + timingSafeEqual + idempotency | Ne jamais commenter `assertWhapiSecret()`, `assertMetaSignature()`, ne jamais remplacer `timingSafeEqual` par `===` |
| E2 | Architecture modulaire NestJS | Un module = un domaine, pas de couplage fort entre modules |
| E3 | CI/CD avec migrations auto | Migrations exécutées AVANT `docker compose up` — ne jamais modifier cet ordre dans les workflows |

---

## Vue calendaire

```
Aujourd'hui (2026-07-01)
  │
  ├── J1 — Fondations qualité         [~2 semaines]
  │
  ├── J2 — Robustesse & sécurité      [~3 semaines après J1]
  │
  ├── J3 — Observabilité & perf       [~4 semaines après J2]
  │
  └── J4 — Scalabilité externe        [~4 semaines après J3]
```

---

## Jalon J1 — Fondations qualité

**Objectif :** poser les bases qui permettent de développer sereinement.
Aucune nouvelle feature n'est livrable sans ces fondations.

**Date cible :** ~2026-07-15

### Critères de sortie (Definition of Done)

- [ ] Prettier configuré sur les 3 projets (`front/`, `admin/`, `message_whatsapp/`)
- [ ] lint-staged + Husky actif : tout commit passe ESLint + Prettier automatiquement
- [ ] Vitest configuré dans `front/` (commande `npm test` fonctionnelle)
- [ ] ≥ 4 tests de hooks critiques écrits et passants : `useBreakPrompt`, `usePlanningCommercial`, `useIdleTimer`, `chatStore`
- [ ] CI GitHub Actions exécute `npm test` sur le front et bloque si un test échoue

### Critères de non-régression J1

- [ ] `npm run build` passe sur les 3 projets après activation Prettier ✅
- [ ] `npm run dev` démarre sans erreur après ajout Vitest ✅
- [ ] Aucun test n'appelle l'API réelle (tous les appels HTTP sont mockés) ✅
- [ ] Les tests sont isolés : l'ordre d'exécution n'affecte pas les résultats ✅
- [ ] Un commit avec une faute de style est bloqué par Husky ✅

### Livrables

| Livrable | Source | Jalon |
|---|---|---|
| `.prettierrc.json` (×3) | Plan interne § 1.1 | J1 |
| `.husky/pre-commit` (×3) | Plan interne § 1.1 | J1 |
| `front/vitest.config.ts` | Plan interne § 1.2 | J1 |
| `front/src/test/setup.ts` | Plan interne § 1.2 | J1 |
| `hooks/useBreakPrompt.spec.ts` | Plan interne § 1.3 | J1 |
| `hooks/usePlanningCommercial.spec.ts` | Plan interne § 1.3 | J1 |
| `hooks/useIdleTimer.spec.ts` | Plan interne § 1.3 | J1 |
| `store/chatStore.spec.ts` | Plan interne § 1.3 | J1 |
| Mise à jour CI `.github/workflows/` | — | J1 |

### Risques J1

| Risque | Régression possible | Mitigation |
|---|---|---|
| Prettier conflicte avec ESLint | Boucle infinie `--fix` → tous les commits bloqués | Installer `eslint-config-prettier` AVANT d'activer Husky |
| Vitest incompatible avec une dépendance browser-only (leaflet, socket.io) | Tests en erreur dès le premier `npm test` | Mocker ces dépendances dans `src/test/setup.ts` |
| Prettier génère un diff massif | `git blame` illisible sur tous les fichiers | Commit "style only" isolé, sans revue fonctionnelle |

---

## Jalon J2 — Robustesse & sécurité

**Objectif :** éliminer les risques de perte de données et renforcer la sécurité de l'authentification.

**Date cible :** ~2026-08-05

**Dépendances :** J1 complété · Serveur Redis disponible (pour Phase A externe)

### Critères de sortie

- [ ] Package `@whatsapp/socket-contracts` créé, backend et front consomment via le package
- [ ] Plus aucune duplication de `socket-events.constants.ts` (R7 ✅)
- [ ] Refresh token implémenté : access 15 min + refresh 7 jours pour les commerciaux
- [ ] `@nestjs/throttler` actif : `/auth/login` limité à 5 req/min
- [ ] Endpoint `GET /health` répond avec statut DB + gateway + crons
- [ ] BullMQ opérationnel sur la queue `webhook-inbound` (si Redis disponible)
- [ ] Feature flag `FF_BULLMQ_WEBHOOK` activable sans redémarrage

### Livrables

| Livrable | Source | Jalon |
|---|---|---|
| `packages/socket-contracts/` (nouveau) | Plan interne § 2.1 | J2 |
| Entité + migration `refresh_tokens` | Plan interne § 3.1 | J2 |
| `POST /auth/refresh`, `POST /auth/logout` | Plan interne § 3.1 | J2 |
| `AppModule` — ThrottlerModule configuré | Plan interne § 3.2 | J2 |
| `GET /health` + TerminusModule | Plan interne § 3.3 | J2 |
| `WebhookQueueModule` + BullMQ | Plan externe § A | J2 |
| Feature flag `FF_BULLMQ_WEBHOOK` | Plan externe § A.2 | J2 |

### Critères de non-régression J2

- [ ] Un commercial reçoit un message en temps réel après migration socket-contracts ✅
- [ ] `break:prompt` s'affiche correctement (BREAK_EVENTS depuis le package) ✅
- [ ] Un commercial reste connecté après 14 minutes (refresh token silencieux) ✅
- [ ] `POST /auth/login` retourne 429 après 5 tentatives rapides ✅
- [ ] Les webhooks Whapi continuent d'être reçus normalement (`@SkipThrottle` actif) ✅
- [ ] `GET /health` répond 200 avec statut DB OK ✅
- [ ] Si Redis est indisponible : BullMQ bascule sur la file mémoire, log warn visible ✅

### Risques J2

| Risque | Régression possible | Mitigation |
|---|---|---|
| socket-contracts renomme un event | Front sourd aux events backend | Tests de contrat d'events dans le package (vérifient les noms exacts) |
| Refresh token : déconnexion au déploiement | Interruption service pendant les heures de travail | Déployer la nuit, conserver expiry 7j jusqu'à validation staging |
| ThrottlerGuard bloque les webhooks | Perte de messages WhatsApp | `@SkipThrottle()` sur tous les controllers webhook avant activation |
| Redis indisponible au démarrage | Backend plante au démarrage | Circuit breaker avec fallback mémoire + `FF_BULLMQ_WEBHOOK=false` par défaut |

---

## Jalon J3 — Observabilité & performance

**Objectif :** savoir ce qui se passe en production sans accès SSH, détecter les goulots de performance.

**Date cible :** ~2026-09-02

**Dépendances :** J2 complété · Serveur Jaeger/Tempo disponible · Espace disque pour logs Loki

### Critères de sortie

- [ ] Pagination keyset uniforme sur tous les endpoints de liste
- [ ] Audit index MySQL réalisé : ≥ 3 index covering ajoutés sur les hot paths identifiés
- [ ] Zéro N+1 query détecté dans les 10 requêtes les plus fréquentes (audit EXPLAIN)
- [ ] MySQL présent dans `docker-compose.local.yml` (setup dev unifié)
- [ ] Entité + migration `admin_audit_log` + décorateur `@AuditLog` opérationnel
- [ ] OpenTelemetry actif en staging : traces visibles dans Jaeger
- [ ] Loki + Grafana opérationnel : logs ingérés, dashboard webhook + dispatch actifs
- [ ] Prometheus `/metrics` exposé : ≥ 6 métriques clés collectées

### Livrables

| Livrable | Source | Jalon |
|---|---|---|
| Pagination keyset unifiée | Plan interne § 2.2 | J3 |
| Migrations index MySQL (×3 minimum) | Plan interne § 4.1 | J3 |
| Audit N+1 + corrections | Plan interne § 4.2 | J3 |
| MySQL dans docker-compose local | Plan interne § 5.1 | J3 |
| Entité + migration `admin_audit_log` | Plan interne § 5.2 | J3 |
| `src/tracing.ts` + instrumentation OTEL | Plan externe § C.2 | J3 |
| `MetricsService` + endpoint `/metrics` | Plan externe § D.2 | J3 |
| `docker-compose.observability.yml` | Plan externe § D.1 | J3 |
| Dashboards Grafana (×4) | Plan externe § D.3 | J3 |

### Critères de non-régression J3

- [ ] Latence webhook P99 stable (≤ +5%) après activation OTEL ✅
- [ ] Backend démarre normalement si Jaeger est indisponible ✅
- [ ] Aucun token ni numéro de téléphone dans les logs Loki ✅
- [ ] `/metrics` retourne 401 sans token d'authentification ✅
- [ ] `EXPLAIN ANALYZE` sur les hot paths : `type` = `ref` ou `range` (plus de `ALL`) ✅
- [ ] Aucun N+1 détecté dans les 10 requêtes auditées ✅
- [ ] Création d'index : aucun timeout ni lock observé dans les logs pendant le déploiement ✅

### Risques J3

| Risque | Régression possible | Mitigation |
|---|---|---|
| OTEL crash au bootstrap | Backend ne démarre pas | `try/catch` autour de `sdk.start()` — OTEL ne bloque jamais le process |
| Loki sature le disque | Serveur disk-full → application entière down | Rétention 30j configurée + alerte Grafana sur espace disque |
| Index MySQL lock en production | Indisponibilité service pendant la migration | `ALGORITHM=INPLACE, LOCK=NONE` obligatoire sur chaque `ADD INDEX` |
| `leftJoinAndSelect` charge trop de données | OOM backend | Tester avec 1 000+ conversations sur staging avant production |
| Données sensibles dans Loki | Fuite RGPD (numéros téléphone) | Règles de masquage Promtail validées manuellement sur staging |

---

## Jalon J4 — Scalabilité externe

**Objectif :** découpler la plateforme des ressources serveur pour supporter la croissance du volume de médias et d'utilisateurs.

**Date cible :** ~2026-10-01

**Dépendances :** J3 complété · Compte Cloudflare R2 configuré · Budget validé

### Critères de sortie

- [ ] Couverture tests frontend ≥ 60% (hooks + composants critiques)
- [ ] Tous les médias nouveaux sont uploadés vers R2 (feature flag `FF_R2_STORAGE=true`)
- [ ] Script de migration des médias existants exécuté avec succès (0 échec sur les 7 derniers jours)
- [ ] Aucune charge de téléchargement de média sur le serveur API (URL R2 CDN directe)
- [ ] Alertes Grafana configurées et testées (simulation de breach SLA + chute socket)

### Livrables

| Livrable | Source | Jalon |
|---|---|---|
| Couverture tests frontend 60% | Plan interne § 1.3 étendu | J4 |
| Abstraction `IMediaStorage` | Plan externe § B.2 | J4 |
| `R2MediaStorage` + feature flag | Plan externe § B.2 | J4 |
| Script migration médias → R2 | Plan externe § B.3 | J4 |
| Alertes Grafana (×4 dashboards) | Plan externe § D.3 | J4 |

### Critères de non-régression J4

- [ ] Images dans les conversations historiques toujours affichées (local_url fallback actif) ✅
- [ ] Si R2 est indisponible : média sauvegardé en local, log warn visible ✅
- [ ] Migration médias : 0 fichier perdu, `local_url` conservé en BDD ✅
- [ ] Aucune credential R2 dans les logs ✅
- [ ] Couverture tests frontend ≥ 60% sur les hooks et composants critiques ✅

### Risques J4

| Risque | Régression possible | Mitigation |
|---|---|---|
| Migration médias écrase `local_url` | Rollback impossible, URLs historiques cassées | Snapshot `whatsapp_media_backup` AVANT migration + ne jamais supprimer `local_url` |
| R2 indisponible en production | Médias non affichés sans alerte | Circuit breaker avec fallback local + alerte Grafana sur erreurs R2 |
| Migration trop lente (> 100k fichiers) | Fenêtre de maintenance trop longue | Batch de 100 fichiers/iteration + throttling 100 uploads/s max |
| Tests frontend révèlent des bugs cachés | Bugs en production non détectés jusqu'à J4 | Corriger les bugs découverts avant de valider le jalon ✅ |

---

## Vue consolidée — Toutes phases

```
J1 (2026-07-15)    Fondations qualité
  ├── Prettier + Husky + lint-staged (×3 projets)
  ├── Vitest setup + 4 tests hooks critiques
  └── CI bloque sur tests frontend

J2 (2026-08-05)    Robustesse & sécurité
  ├── [INTERNE]  Package socket-contracts (R7)
  ├── [INTERNE]  Refresh token commerciaux
  ├── [INTERNE]  Rate-limiting @nestjs/throttler (R6)
  ├── [INTERNE]  Health endpoint /health
  └── [EXTERNE]  BullMQ + Redis (si disponible)

J3 (2026-09-02)    Observabilité & performance
  ├── [INTERNE]  Audit index MySQL + corrections N+1 (R5)
  ├── [INTERNE]  Pagination keyset uniforme
  ├── [INTERNE]  MySQL dans docker-compose local
  ├── [INTERNE]  Audit trail admin
  ├── [EXTERNE]  OpenTelemetry + Jaeger
  └── [EXTERNE]  Loki + Grafana + Prometheus

J4 (2026-10-01)    Scalabilité externe
  ├── [INTERNE]  Couverture tests frontend 60%
  └── [EXTERNE]  Cloudflare R2 + migration médias
```

---

## Métriques de succès

Ces métriques doivent être mesurables à la fin de chaque jalon.

| Métrique | Baseline (aujourd'hui) | Cible J1 | Cible J2 | Cible J3 | Cible J4 |
|---|---|---|---|---|---|
| Tests frontend (count) | 0 | ≥ 4 | ≥ 10 | ≥ 30 | ≥ 60% coverage |
| Duplications Socket.IO constants | 2 fichiers | 2 fichiers | 0 (shared pkg) | 0 | 0 |
| Perte de données webhook au restart | Possible | Possible | Éliminée | Éliminée | Éliminée |
| Temps diagnostic incident | SSH + grep | SSH + grep | SSH + grep | Grafana (< 5 min) | Grafana (< 5 min) |
| Charge serveur pour médias | 100% sur API | 100% | 100% | 100% | 0% (R2 CDN) |
| `any` TypeScript | Non mesuré | 0 nouveaux | 0 | 0 | 0 |

---

## Révision des jalons

Ce document doit être révisé :
- À la fin de chaque jalon (marquer les critères de sortie atteints)
- Lors de tout changement de priorité métier
- Si un risque identifié se matérialise

*Dernière révision : 2026-07-01*
