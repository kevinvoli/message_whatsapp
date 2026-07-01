# Rapport Architecture — Plateforme de Messagerie WhatsApp

> **Branche analysée : `production`** · Commit `1fae37e3` · Généré le 2026-07-01
>
> Ce rapport décrit exclusivement l'état du code sur la branche `production`.
> La branche `master` (staging) peut contenir des fonctionnalités supplémentaires non couvertes ici.

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture backend](#2-architecture-backend)
3. [Architecture frontend & admin](#3-architecture-frontend--admin)
4. [Communication temps-réel](#4-communication-temps-réel)
5. [Persistance & stockage](#5-persistance--stockage)
6. [Sécurité](#6-sécurité)
7. [CI/CD & déploiement](#7-cicd--déploiement)
8. [Tests & qualité](#8-tests--qualité)
9. [Comparaison aux conventions du marché](#9-comparaison-aux-conventions-du-marché)
10. [Axes d'amélioration continue](#10-axes-damélioration-continue)
11. [Feuille de route développement durable](#11-feuille-de-route-développement-durable)

---

## 1. Vue d'ensemble

### Topologie générale

```
Internet
  │
  ├── Agents commerciaux  →  front/        (Next.js :3000)
  ├── Panel administrateur →  admin/        (Next.js :3001)
  │
  └── Backend NestJS      →  message_whatsapp/  (:3002 HTTP + :3005 WS)
        │
        ├── MySQL (whatsappflow)         — DB primaire
        ├── MySQL DB2 (ORDER_DB)         — DB commandes/ERP (lecture seule)
        └── Fichiers locaux              — uploads/media/
```

### Stack technique

| Couche | Technologie | Version |
|---|---|---|
| Backend API | NestJS | 11.0 |
| ORM | TypeORM | 0.3.28 |
| Base de données | MySQL | 8.x |
| Temps-réel | Socket.IO | 4.8.3 |
| Frontend commercial | Next.js 16 / React 19 | 16.1.1 / 19.2.3 |
| Panel admin | Next.js 16 / React 19 | 16.1.6 / 19.2.3 |
| État frontend | Zustand | 5.0.10 |
| CSS | Tailwind CSS | 4.x |
| Auth | Passport JWT + cookies HTTP-only | — |
| Jobs planifiés | @nestjs/schedule (crons dynamiques BDD) | — |
| File dégradée | WebhookDegradedQueueService (Map mémoire) | — |
| Logs | AppLogger (console + JSON file) | — |
| Déploiement | Docker Compose + GitHub Actions | — |

---

## 2. Architecture backend

### 2.1 Organisation modulaire

Le backend compte **31 modules NestJS** organisés par domaine métier. Cette granularité est saine et respecte le principe de séparation des responsabilités.

**Domaines identifiés :**

| Domaine | Modules clés |
|---|---|
| Messagerie entrante | `webhooks/`, `whatsapp_message/`, `whatsapp_chat/` |
| Messagerie sortante | `communication_whapi/`, `channel/` |
| Dispatch & assignation | `dispatcher/`, `whatsapp_poste/` |
| Commerciaux & présence | `whatsapp_commercial/`, `commercial-group/` |
| Pauses décalées | `commercial-group/` (BreakScheduleEngine) |
| Automatisation | `message-auto/`, `jorbs/` |
| Médias | `whatsapp_media/`, `media-storage/`, `media-asset/` |
| Quiz & accès | `quiz/`, `conversation-restriction/` |
| Analytics | `metriques/`, `call-log/` |
| Configuration | `system-config/`, `system-alert/`, `cron-config/` |
| Intégration ERP | `order-db/`, `integration-sync/` |

### 2.2 Flux entrant (webhook → agent)

```
Webhook Whapi / Meta / Messenger / Instagram / Telegram
  → UnifiedIngressService     (déduplication WebhookIdempotencyService)
  → ProviderAdapterRegistry   (sélection de l'adaptateur provider)
  → InboundMessageService     (persist WhatsappMessage)
  → DispatcherService         (assignation via mutex par chatId)
  → WhatsappMessageGateway    (émission Socket.IO → agent commercial)
```

**Points forts :** déduplication via `WebhookIdempotencyService`, mutex `async-mutex` par `chatId` (pas de double-assignation), pattern adaptateur extensible (`WhapiAdapter`, `MetaAdapter`, `MessengerAdapter`…).

### 2.3 Flux sortant

```
Client (front/admin)
  → POST /messages  (AuthGuard jwt | AdminGuard)
  → OutboundRouterService    (sélection provider selon channel.provider)
  → CommunicationWhapiService  (provider = 'whapi')
  → MetaOutboundService        (provider = 'meta')
```

### 2.4 Jobs asynchrones

Le backend utilise `@nestjs/schedule` avec une couche de configuration dynamique (`CronConfig` en BDD). Les jobs les plus critiques :

| Job | Fréquence | Criticité |
|---|---|---|
| `sla-checker` | Configurable | P0 — réassignation si SLA dépassé |
| `auto-message-master` | Configurable | P0 — messages automatiques |
| `offline-reinjection` | Configurable | P1 — réouverture conversations FERME |
| `idle-disconnect` | Configurable | P1 — nettoyage sessions inactives |
| `calendar-regen` | Configurable | P2 — planning pauses |

**Note :** la file dégradée (`WebhookDegradedQueueService`) est implémentée en mémoire (Map). Elle gère les bursts webhook mais ne survit pas à un redémarrage du process.

### 2.5 Migrations

67 migrations TypeORM couvrent l'historique complet du schéma (fév–juin 2026). La convention de nommage (`NomFeature{timestamp13}`) est respectée. `TYPEORM_SYNCHRONIZE=false` en production — approche correcte.

---

## 3. Architecture frontend & admin

### 3.1 Frontend commercial (`front/`)

**Structure App Router Next.js :**
```
app/
  whatsapp/page.tsx   — interface principale (Sidebar + ChatMainArea + panels)
  contacts/page.tsx
  quiz/page.tsx
```

**État global — Zustand :**
- `chatStore` — source de vérité centrale : conversations (3 onglets), messages, socket, restrictions, cooldown
- `contactStore`, `stats.store`
- Pattern éprouvé : le store expose les actions, les composants consomment via selectors

**Temps-réel :**
- `SocketProvider` → singleton `socket.io-client`
- `WebSocketEvents.tsx` — composant bridge : subscribe aux events Socket.IO → dispatche dans le store
- `useBreakPrompt` — hook dédié aux events de pauses

### 3.2 Panel admin (`admin/`)

**57 composants de vue** gérés sans store global — chaque vue porte son état local via `useAsync` et `useCrudResource`. Approche cohérente pour un panel de configuration qui n'a pas besoin d'état partagé complexe.

**Exports** : Excel (xlsx) et PDF (jsPDF + autotable) côté client via `exportService.ts`.

### 3.3 Conventions partagées front/admin

- Dates : `lib/dateUtils.ts` (locale `fr-FR`, nulls → `"-"`)
- Appels HTTP : `lib/api.ts` uniquement
- Types API : `lib/definitions.ts` (front) et `admin/src/app/lib/definitions.ts` (admin)
- Constantes Socket.IO : fichiers miroirs manuellement synchronisés

---

## 4. Communication temps-réel

### 4.1 Architecture des rooms Socket.IO

```
commercial:{commercialId}   — events personnels (break:prompt, force-disconnect…)
poste:{posteId}             — events d'équipe (nouvelles conversations, file…)
tenant:{tenantId}           — diffusion multi-tenant
```

### 4.2 Catalogue des events (server → client)

**Channel `chat:event` :**
`CONVERSATION_LIST`, `CONVERSATION_UPSERT`, `CONVERSATION_ASSIGNED`, `CONVERSATION_REMOVED`,
`MESSAGE_LIST`, `MESSAGE_ADD`, `MESSAGE_STATUS_UPDATE`, `MESSAGE_SEND_ERROR`,
`TOTAL_UNREAD_UPDATE`, `TYPING_START`, `TYPING_STOP`, `FOLLOW_UP_REMINDER`, `OBLIGATION_UPDATED`

**Events spéciaux :**
`break:prompt`, `break:prompt_clear`, `break:disconnect_alert`,
`commercial:force-disconnect`, `queue:updated`, `restriction:status`

### 4.3 Points d'attention

- `SocketThrottleGuard` : rate-limiting par client/event (postes dédiés exemptés)
- Déduplication envoi : `pendingAgentMessages` (cooldown 1,5s) + `recentTempIds` (fenêtre 10s)
- Les constantes d'events sont **dupliquées** entre backend et frontend — risque de désynchronisation

---

## 5. Persistance & stockage

### 5.1 Base de données principale (MySQL)

- Pool : 30 connexions, file d'attente 200
- Charset : `utf8mb4` (support emojis/caractères CJK)
- Soft-delete sur toutes les entités (`@DeleteDateColumn deletedAt`)
- Deux data sources : DB1 (lecture/écriture) + DB2 ERP (lecture seule)

**Entités majeures :**

| Entité | Table | Rôle |
|---|---|---|
| `WhatsappChat` | `whatsapp_chat` | Conversation (statuts : actif, en attente, fermé, converti) |
| `WhatsappMessage` | `whatsapp_message` | Message individuel |
| `WhapiChannel` | `whapi_channels` | Canal WhatsApp (provider : whapi, meta) |
| `WhatsappPoste` | `whatsapp_poste` | Poste agent |
| `WhatsappCommercial` | `whatsapp_commercial` | Compte agent |
| `MessagingApplication` | `messaging_application` | App Meta (app_id, system_token centralisés) |
| `CommercialGroup` | `commercial_group` | Groupe/sous-groupe agents avec planning pauses |

### 5.2 Stockage fichiers

- Médias entrants : `uploads/media/{YYYY}/{MM}/{DD}/{tenantId}/{mediaId}.{ext}`
- Servis statiquement via Express (`/uploads/media/...`)
- Volumes Docker persistants : `backend_uploads` + `backend_logs`
- Pas de CDN ni de stockage objet externe (S3 / Cloudflare R2) — voir axes d'amélioration

### 5.3 Redis

Présent dans `.env.example` et `ioredis` est importé, mais aucun module BullMQ actif en production. La file dégradée webhook est en mémoire. Redis est préparé mais pas encore utilisé.

---

## 6. Sécurité

### 6.1 Authentification

- JWT avec cookies HTTP-only (`Authentication`, `AuthenticationAdmin`) — bonne pratique (résistant au vol XSS)
- `tokenVersion` en BDD pour invalidation globale des sessions commerciaux
- Deux systèmes JWT distincts (commercial vs admin) — isolation correcte
- Restriction horaire configurable pour les connexions commerciaux

### 6.2 Webhooks entrants

- Vérification HMAC-SHA256 obligatoire (`assertWhapiSecret`, `assertMetaSignature`)
- Comparaison avec `crypto.timingSafeEqual` (résistant aux timing attacks)
- Déduplication par `eventId` (`WebhookIdempotencyService`)
- Rate limiting par provider (`WebhookRateLimitService`)

### 6.3 Sanitisation des données

- `sanitizeChannel()` obligatoire avant tout retour HTTP (masque `token`, `meta_app_secret`, `webhook_secret`)
- `ValidationPipe` global (`whitelist: true`, `forbidNonWhitelisted: true`)
- QueryBuilder avec paramètres liés — pas de concaténation SQL

### 6.4 Points de vigilance actuels

- La file dégradée en mémoire `WebhookDegradedQueueService` perd ses messages si le process redémarre
- Pas d'audit trail sur les actions admin (lectures de données sensibles)
- Tokens JWT sans rotation (expiry 7 jours, pas de refresh token pour les commerciaux)

---

## 7. CI/CD & déploiement

### 7.1 Pipelines GitHub Actions

**Deux workflows :**
- `ci-cd.yml` → branche `master` (staging) : tags `:latest`
- `deploy-production.yml` → branche `production` : tags `:prod`

**Étapes communes :**
1. Détection des changements par service (diff git)
2. Build Docker → push `ghcr.io`
3. Sync `docker-compose.yml` via SCP
4. Exécution des migrations TypeORM **avant** `docker compose up`
5. Healthcheck + rollback automatique si échec

**Point fort :** migrations auto au déploiement — évite le step manuel.

### 7.2 Docker Compose

- `docker-compose.yml` — prod (images GHCR)
- `docker-compose.local.yml` — dev local (build depuis Dockerfile)
- Healthchecks configurés sur chaque service
- Pas de MySQL dans Docker — MySQL sur l'hôte (`host.docker.internal`)

### 7.3 Environnements

| Environnement | Source | Tags Docker |
|---|---|---|
| Développement local | `docker-compose.local.yml` | build local |
| Staging | branche `master` | `:latest` + `:sha` |
| Production | branche `production` | `:prod` |

---

## 8. Tests & qualité

### 8.1 Couverture backend

**Tests unitaires** (~320 specs) couvrant :
- Tous les services métiers critiques (dispatcher, message-auto, SLA, break-schedule-engine)
- Tous les adapters webhook (Whapi, Meta, Messenger, Instagram)
- Gateway Socket.IO et services associés
- Sécurité webhook (HMAC, idempotency)

**Tests E2E :**
- `app.e2e-spec.ts` — smoke test
- `auth-chat-admin.e2e-spec.ts`, `message-flow.e2e-spec.ts`, `webhook-security.e2e-spec.ts`
- Factories et helpers pour la création de fixtures

### 8.2 Couverture frontend/admin

**Aucun test** (`.spec.ts`, `.test.ts`) dans `front/src/` ni `admin/src/`.

### 8.3 Outils qualité

- ESLint configuré sur les 3 projets
- TypeScript strict (zéro `any` en règle de review)
- Pas de Prettier configuré (formatage non uniformisé)
- Pas de pre-commit hook (Husky) ni lint-staged

---

## 9. Comparaison aux conventions du marché

Ce type d'application — **plateforme de messagerie métier multi-agent avec dispatch intelligent** — est comparable à Crisp, Intercom, Chatwoot ou Freshdesk. Voici une analyse honnête des écarts.

### 9.1 Ce qui est aligné avec les conventions du marché

| Pratique | Statut |
|---|---|
| Monorepo par domaine (backend / front / admin) | ✅ Conforme |
| Séparation des concerns par module NestJS | ✅ Conforme |
| ORM avec migrations versionnées | ✅ Conforme |
| Cookies HTTP-only pour JWT | ✅ Conforme |
| Soft-delete sur les entités | ✅ Conforme |
| Rate-limiting webhooks | ✅ Conforme |
| HMAC webhook verification | ✅ Conforme |
| CI/CD avec déploiement automatisé | ✅ Conforme |
| Deduplication idempotency webhook | ✅ Conforme |
| Socket.IO rooms par scope (user/team/tenant) | ✅ Conforme |
| Store Zustand centralisé (front) | ✅ Conforme |
| Tailwind CSS (frontend moderne) | ✅ Conforme |
| App Router Next.js | ✅ Conforme |
| Feature flags (`FF_*`) | ✅ Conforme |

### 9.2 Écarts par rapport aux conventions du marché

#### P0 — Critique

| Écart | Impact | Standard du marché |
|---|---|---|
| **File webhook en mémoire** (`WebhookDegradedQueueService` Map) | Perte de messages au redémarrage | BullMQ + Redis (Chatwoot, Crisp) |
| **Aucun test frontend/admin** | Régressions UI non détectées | Vitest + Testing Library (standard SaaS 2024+) |
| **Pas de refresh token** pour les commerciaux | Session de 7 jours non révocable sans `tokenVersion` en BDD | Rotation access (15min) + refresh (7j) |
| **Constantes Socket.IO dupliquées** | Désynchronisation silencieuse | Shared package ou génération automatique |

#### P1 — Important

| Écart | Impact | Standard du marché |
|---|---|---|
| **Pas de CDN ni stockage objet** pour les médias | Charge sur le serveur, pas de geo-distribution | AWS S3 / Cloudflare R2 + CDN |
| **Logs structurés mais sans agrégation** | Pas de searchabilité en production | ELK stack, Loki, ou Datadog |
| **Pas de tracing distribué** | Impossible de corréler une requête HTTP → Socket.IO → webhook | OpenTelemetry (OTEL) |
| **Pas de Prettier** | Code style inconsistant entre contributeurs | Prettier + ESLint + lint-staged |
| **Admin sans store global** | Duplication logique de fetching entre vues | React Query ou TanStack Query |
| **MySQL sans index covering sur hot paths** | Dégradation perf à volume (> 1M messages) | Audit EXPLAIN + index composites |

#### P2 — Amélioration

| Écart | Impact | Standard du marché |
|---|---|---|
| **Pas de health endpoint structuré** | Monitoring partiel | `/health` avec checks DB, Redis, providers |
| **Pas de rate-limiting API HTTP** | Exposition aux abus | `@nestjs/throttler` sur les endpoints publics |
| **Pagination offset** sur certains endpoints | Inconsistante (keyset ailleurs) | Keyset pagination partout (cursor-based) |
| **Pas d'audit trail admin** | Non traçabilité des modifications | Log d'audit sur les actions CRUD sensibles |
| **`docker-compose` sans MySQL** | Setup local plus complexe | MySQL dans le compose local au moins |
| **Pas de tests de migration** | Migration réversible non vérifiée | Tests avant/après migration sur dump réel |

---

## 10. Axes d'amélioration continue

### 10.1 File de messages robuste — BullMQ + Redis (P0)

**Problème actuel :** `WebhookDegradedQueueService` stocke les tâches en `Map` mémoire. Un crash process = perte de webhooks.

**Cible :** BullMQ (déjà préparé dans les dépendances) + Redis (déjà dans `.env.example`).

```
Architecture cible :
  Webhook entrant → BullMQ queue "webhook-inbound"
    → Worker NestJS (concurrence configurable)
      → UnifiedIngressService
```

**Gain :** persistance, retry automatique, dashboard Bull Board, dead-letter queue.

**Effort estimé :** 3-5 jours backend.

---

### 10.2 Tests frontend — Vitest + Testing Library (P0)

**Problème actuel :** zéro test sur `front/` et `admin/`. Toute régression UI est détectée en production.

**Cible :**
```
Tests unitaires :  hooks (useBreakPrompt, usePlanningCommercial, useIdleTimer)
Tests composants : ChatMainArea, ConversationList, Sidebar (render + interactions)
Tests intégration : chatStore (Zustand) — actions et sélecteurs
```

**Stack recommandée :**
- Vitest (compatibilité Next.js, 10× plus rapide que Jest sur React)
- `@testing-library/react` + `@testing-library/user-event`
- `msw` (Mock Service Worker) pour les appels API

**Effort estimé :** 5-8 jours, à intégrer dans la CI.

---

### 10.3 Tracing distribué — OpenTelemetry (P1)

**Problème actuel :** impossible de corréler un webhook entrant → traitement dispatcher → événement Socket.IO → réponse agent.

**Cible :** instrumentation OTEL sur NestJS (`@opentelemetry/sdk-node`) avec export vers Jaeger ou Tempo (Grafana stack).

```
Chaque requête reçoit un traceId propagé :
  Webhook [traceId] → Dispatcher [traceId] → Gateway Socket.IO [traceId]
```

**Gain :** diagnostic des timeouts, détection des goulots, SLA mesurable.

---

### 10.4 Shared package pour les types Socket.IO (P1)

**Problème actuel :** `socket-events.constants.ts` est copié/collé entre `message_whatsapp/` et `front/`. Toute modification du backend doit être répercutée manuellement.

**Cible :** package `packages/socket-contracts/` partagé dans le monorepo, consommé par les deux projets via `tsconfig paths` ou `npm workspace`.

```
packages/
  socket-contracts/
    src/
      events.ts       — constants
      payloads.ts     — types des payloads
      index.ts
```

---

### 10.5 Stockage médias externe — Cloudflare R2 (P1)

**Problème actuel :** les médias sont stockés sur le système de fichiers du conteneur. Un redéploiement avec recréation du conteneur sans volume persistant = perte des médias. La charge de téléchargement pèse sur le serveur API.

**Cible :** Cloudflare R2 (compatible S3, sans frais d'egress).

```
MediaDownloadService.downloadAndStore()
  → upload vers R2 (presigned URL)
  → whatsapp_media.local_url = URL CDN publique R2
```

**Gain :** scalabilité, CDN global, zéro charge sur le serveur API pour les téléchargements.

---

### 10.6 Monitoring structuré — Grafana + Loki (P1)

**Problème actuel :** les logs sont en JSON sur disque, pas interrogeables sans accès SSH.

**Cible :**
- Promtail → Loki : ingestion des logs JSON
- Grafana : dashboards (taux d'erreur webhook, latence dispatch, connexions actives)
- AlertManager : alertes sur les anomalies (spike erreurs, temps SLA dépassé)

**Métriques clés à exposer :**
- `webhook.received.count` par provider
- `dispatch.assigned.latency` (P50/P95/P99)
- `socket.connections.active`
- `sla.breach.count` par poste
- `media.download.failures`

---

### 10.7 Rate-limiting API HTTP — @nestjs/throttler (P2)

**Problème actuel :** aucun rate-limiting sur les endpoints REST publics (login, webhooks méta).

**Cible :**
```typescript
ThrottlerModule.forRoot([{
  name: 'short',  ttl: 1_000,   limit: 10,
  name: 'medium', ttl: 10_000,  limit: 50,
  name: 'long',   ttl: 60_000,  limit: 200,
}])
```

Avec `@SkipThrottle()` sur les endpoints webhook (déjà protégés par HMAC).

---

### 10.8 Refresh token pour les commerciaux (P0)

**Problème actuel :** access token de 7 jours. Un token volé est valable 7 jours (même si `tokenVersion` permet la révocation manuelle).

**Cible :**
- Access token : 15 minutes, stocké en mémoire côté client
- Refresh token : 7 jours, HTTP-only cookie
- Endpoint `POST /auth/refresh` silencieux

Standard Crisp/Intercom : access 1h, refresh 30j avec rotation.

---

## 11. Feuille de route développement durable

### Principe général

Le développement durable sur ce type d'application repose sur trois piliers :

1. **Confiance dans le code** — chaque feature livrée est testée, chaque régression est détectée avant la prod
2. **Observabilité** — on sait ce qui se passe en production sans accès SSH
3. **Évolutivité** — le schéma de données et l'architecture supportent la croissance

### Roadmap priorisée

#### Sprint S — Fondations qualité (2 semaines)

| Tâche | Effort | Impact |
|---|---|---|
| Prettier + lint-staged + pre-commit hook | 0.5j | Uniformise le style, bloque les commits sales |
| Vitest setup + 10 premiers tests hooks | 3j | Couverture des hooks critiques (break, planning, idle) |
| Health endpoint `/health` (DB, Redis) | 1j | Monitoring basique opérationnel |
| Package shared `socket-contracts` | 2j | Élimine la duplication des constantes Socket.IO |

#### Sprint M — Robustesse infra (3 semaines)

| Tâche | Effort | Impact |
|---|---|---|
| BullMQ + Redis pour les webhooks | 4j | Zéro perte de message au redémarrage |
| Refresh token pour les commerciaux | 2j | Sécurité session améliorée |
| Rate-limiting HTTP `@nestjs/throttler` | 1j | Protection contre les abus |
| MySQL sur docker-compose local | 0.5j | Setup dev unifié |

#### Sprint L — Observabilité (3 semaines)

| Tâche | Effort | Impact |
|---|---|---|
| OpenTelemetry sur NestJS | 3j | Tracing distribué webhook → socket |
| Loki + Grafana dashboards | 2j | Logs interrogeables, alertes automatiques |
| Métriques Prometheus exposées | 2j | KPIs en temps réel (dispatch, SLA, socket) |

#### Sprint XL — Scalabilité (1 mois)

| Tâche | Effort | Impact |
|---|---|---|
| Migration médias → Cloudflare R2 | 5j | Décharge le serveur, CDN global |
| Tests frontend Vitest (couverture 60%) | 8j | Confiance dans les déploiements front |
| Audit index MySQL (EXPLAIN hot paths) | 3j | Perf queries à volume (> 1M messages) |
| Pagination keyset uniforme | 3j | Consistance et perf sur toutes les listes |

### Règles de développement durable à adopter dès maintenant

```
1. Toute nouvelle feature backend doit avoir ≥ 1 test unitaire sur le service
2. Tout nouveau hook React doit avoir ≥ 1 test Vitest
3. Toute migration SQL doit avoir un commentaire décrivant le rollback
4. Zéro `any` TypeScript — bloquant en PR review
5. Zéro requête SQL dans une boucle — utiliser IN (:...ids) ou jointures
6. Tout endpoint exposé publiquement doit être rate-limité
7. Les constantes Socket.IO ne sont jamais dupliquées — shared package uniquement
```

---

## Synthèse exécutive

Le projet est **techniquement solide** pour une plateforme de messagerie métier en croissance. Les choix de stack (NestJS + TypeORM + Socket.IO + Next.js + Zustand) sont alignés avec les standards du marché et permettent une montée en charge raisonnable.

**Les trois risques principaux à traiter en priorité :**

1. **File webhook en mémoire** → migrer vers BullMQ + Redis (perte de données potentielle)
2. **Zéro test frontend** → régressions UI invisibles à chaque déploiement
3. **Manque d'observabilité** → impossible de diagnostiquer un incident en production sans accès SSH

**Les trois points d'excellence à préserver :**

1. **Sécurité webhooks** — HMAC + `timingSafeEqual` + idempotency — parmi les meilleures pratiques du secteur
2. **Architecture modulaire NestJS** — 31 modules bien délimités, extensible
3. **CI/CD avec migrations auto** — déploiements reproductibles et sûrs

---

*Document généré automatiquement à partir de l'analyse du code source. À réviser à chaque jalon majeur.*
