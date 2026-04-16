# CAHIER DES CHARGES — Plateforme WhatsApp Multi-Tenant
## Roadmap 2026 — Déploiements indépendants par phase

**Basé sur :** `AUDIT_TECHNIQUE_2026-04-15.md`  
**Principe :** Chaque phase est déployable en production sans attendre les phases suivantes.  
**Convention tickets :**  
- `Px` = Phase  
- `Px.y` = Ticket principal  
- `Px.y.z` = Sous-ticket (tâche atomique)  
- 🔴 Bloquant | 🟡 Important | 🟢 Amélioration  
- `[B]` Backend | `[F]` Frontend | `[A]` Admin | `[DB]` Migration BDD | `[INF]` Infrastructure

---

## Table des phases

| Phase | Nom | Déployable seul | Durée estimée |
|---|---|---|---|
| [Phase 1](#phase-1--sécurité--fondations-techniques) | Sécurité & Fondations techniques | ✅ Oui | 2 semaines |
| [Phase 2](#phase-2--scalabilité--haute-disponibilité) | Scalabilité & Haute disponibilité | ✅ Oui (Redis requis depuis Phase 1) | 3 semaines |
| [Phase 3](#phase-3--fonctionnalités-de-base-manquantes) | Fonctionnalités de base manquantes | ✅ Oui | 5 semaines |
| [Phase 4](#phase-4--couverture-meta-webhook--templates-hsm) | Couverture Meta Webhook & Templates HSM | ✅ Oui | 4 semaines |
| [Phase 5](#phase-5--crm--analytics) | CRM & Analytics | ✅ Oui | 5 semaines |
| [Phase 6](#phase-6--intelligence--automatisation) | Intelligence & Automatisation | ✅ Oui | 6 semaines |

---

## PHASE 1 — Sécurité & Fondations techniques

> **Objectif :** Corriger les failles de sécurité critiques, mettre en place les briques d'infrastructure (Redis, BullMQ) et les indexes BDD manquants sans toucher aux fonctionnalités existantes.  
> **Déployable seul :** Oui — aucune dépendance externe.  
> **Durée estimée :** 2 semaines

---

### P1.1 — 🔴 Activer la validation HMAC webhook [B]

**Contexte :** La vérification de signature Whapi est commentée dans `src/whapi/whapi.controller.ts`. N'importe qui peut envoyer de faux webhooks.

#### P1.1.1 — Réactiver HMAC Whapi
- Fichier : `src/whapi/whapi.controller.ts`
- Décommenter `this.assertWhapiSecret(headers, request.rawBody, payload)`
- Vérifier que `WHAPI_WEBHOOK_SECRET_HEADER` et `WHAPI_WEBHOOK_SECRET_VALUE` sont dans `.env`
- Tester avec un webhook valide et un webhook avec mauvaise signature (doit retourner 401)

#### P1.1.2 — Validation HMAC Meta (SHA-256)
- Fichier : `src/webhooks/adapters/meta.adapter.ts` ou middleware dédié
- Lire le header `X-Hub-Signature-256`
- Vérifier : `sha256(APP_SECRET + body) === signature`
- Configurer `META_APP_SECRET` en variable d'environnement
- Ajouter au schéma Joi dans `app.module.ts`
- Retourner 401 si signature invalide

#### P1.1.3 — Tests de sécurité webhook
- Fichier : `src/whapi/__tests__/webhook-hmac.spec.ts`
- Test : requête valide → 200
- Test : header manquant → 401
- Test : signature incorrecte → 401
- Test : signature Meta valide → 200

---

### P1.2 — 🔴 Infrastructure Redis [INF]

**Contexte :** Redis est requis pour les phases suivantes (BullMQ, Redlock, Socket.io adapter). Doit être en place avant tout.

#### P1.2.1 — Setup Redis en environnement dev
- Ajouter `redis` dans `docker-compose.yml` (image `redis:7-alpine`)
- Port : 6379 (ou configurable)
- Persister les données avec volume Docker
- Documenter dans `.env.example` : `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

#### P1.2.2 — Setup Redis en production
- Choisir entre Redis standalone ou Redis Sentinel (haute disponibilité)
- Configurer `maxmemory-policy: allkeys-lru` (éviction LRU)
- Activer authentification (`requirepass`)
- TLS si Redis exposé hors localhost

#### P1.2.3 — Health check Redis
- Fichier : `src/redis/redis.health.ts`
- Endpoint `/health/redis` → ping Redis
- Intégrer dans `ObservabiliteView` admin

---

### P1.3 — 🔴 Indexes BDD manquants [DB]

**Contexte :** Des requêtes SLA et liste par agent font des full table scans. À corriger sans impacter les fonctionnalités.

#### P1.3.1 — Migration indexes conversations
- Fichier : `src/database/migrations/20260415_add_missing_indexes.ts`
- Ajouter :
  ```sql
  INDEX idx_chat_sla (tenant_id, status, last_client_message_at)
  INDEX idx_chat_by_poste (tenant_id, poste_id, status)
  INDEX idx_chat_unread (tenant_id, status, unread_count)
  ```
- Tester avec `EXPLAIN SELECT` avant/après

#### P1.3.2 — Migration indexes messages
- Même fichier ou migration séparée
- Ajouter :
  ```sql
  INDEX idx_msg_dedup (tenant_id, provider_message_id, direction)
  INDEX idx_msg_chat_ts (chat_id, timestamp DESC)
  ```

#### P1.3.3 — Migration indexes messages media
- Ajouter index `(message_id)` sur `whatsapp_media` si absent

---

### P1.4 — 🟡 Rate-limiting par tenant [B]

**Contexte :** Un tenant peut actuellement spammer l'API et dégrader le service pour les autres.

#### P1.4.1 — Middleware rate-limit par tenant
- Fichier : `src/common/middleware/rate-limit.middleware.ts`
- Utiliser `@nestjs/throttler` avec store Redis
- Limites configurable par tenant (default : 100 req/min sur `/webhooks/*`)
- Retourner 429 avec header `Retry-After`

#### P1.4.2 — Rate-limit login brute force
- Endpoint `POST /auth/login` → max 10 tentatives / 15 min par IP
- Blacklist IP temporaire en Redis
- Log les tentatives échouées

---

### P1.5 — 🟡 Variables d'environnement et sécurité headers [B][INF]

#### P1.5.1 — Audit variables ENV
- Vérifier que `.env.example` est complet et documenté
- Ajouter variables manquantes : `META_APP_SECRET`, `JWT_EXPIRATION`, `CORS_ORIGIN`
- Valider avec Joi dans `app.module.ts`

#### P1.5.2 — Expiration JWT
- `JWT_EXPIRATION=15m` (access token)
- Ajouter refresh token (optionnel mais recommandé)
- Vérifier que les clients Frontend/Admin gèrent le 401

#### P1.5.3 — CSP et security headers
- Middleware Helmet.js (`@nestjs/helmet`)
- Headers : `X-Frame-Options`, `X-XSS-Protection`, `Content-Security-Policy`
- CORS strict : liste blanche origines autorisées (déjà partiellement fait)

---

### Critères de validation Phase 1

- [ ] Webhook avec fausse signature → 401 (Whapi + Meta)
- [ ] Redis accessible et health check → OK
- [ ] `EXPLAIN` sur requête SLA montre utilisation des nouveaux indexes
- [ ] Login après 10 tentatives → 429
- [ ] `npx jest` → 218+ tests passent

---

## PHASE 2 — Scalabilité & Haute disponibilité

> **Objectif :** Rendre l'application horizontalement scalable (multi-instance) sans modifier les fonctionnalités visibles.  
> **Prérequis :** Phase 1 (Redis en place).  
> **Déployable seul :** Oui — aucun changement UX.  
> **Durée estimée :** 3 semaines

---

### P2.1 — 🔴 Queue asynchrone BullMQ pour les webhooks [B]

**Contexte :** Actuellement les webhooks sont traités de manière synchrone. À 1000+ msg/min, les timeouts causent des duplications. BullMQ permet de retourner 202 immédiatement et traiter en arrière-plan.

#### P2.1.1 — Installation et configuration BullMQ
- Installer `@nestjs/bullmq`, `bullmq`, `ioredis`
- Créer `src/queue/queue.module.ts` (global, utilise `REDIS_CLIENT`)
- Définir les queues : `webhook-processing`, `outbound-messages`, `cron-jobs`
- Ajouter `BULL_CONCURRENCY` en variable d'environnement (default : 5)

#### P2.1.2 — Job webhook-processing
- Fichier : `src/queue/jobs/webhook-processing.job.ts`
- Interface : `{ payload: any, provider: string, tenantId: string, correlationId: string }`
- Retry strategy : 3 tentatives, backoff exponentiel (1s, 5s, 30s)
- Dead-letter queue après 3 échecs → log + alerte admin

#### P2.1.3 — Modifier les controllers webhook pour enqueue
- Fichiers : `src/whapi/whapi.controller.ts`, `src/webhooks/unified-ingress.service.ts`
- Remplacer `void this.whapiService.handleIncomingMessage(...)` par `await this.queue.add('webhook-processing', jobData)`
- Retourner `HTTP 202 Accepted` immédiatement
- Garder le `correlationId` dans le job

#### P2.1.4 — Worker webhook-processing
- Fichier : `src/queue/workers/webhook.worker.ts`
- Instancier le worker dans un module dédié
- Appeler `inboundMessageService.handleMessages(messages)` (code existant)
- Log durée de traitement par job
- Émettre métriques (jobs/min, failed/min)

#### P2.1.5 — Dead-letter queue monitoring
- Fichier : `src/queue/dead-letter.service.ts`
- Job DLQ : log + notification admin + retry manuel possible depuis admin
- Vue `QueueView` admin : afficher jobs en erreur + bouton retry

#### P2.1.6 — Tests workers
- `src/queue/__tests__/webhook-worker.spec.ts`
- Test : job réussi → message persisté
- Test : job échoué 3x → dead-letter
- Test : duplicate job (même correlationId) → ignoré (idempotency)

---

### P2.2 — 🔴 Distributed locking avec Redlock [B]

**Contexte :** Tous les mutex `async-mutex` sont in-process. En multi-instance, deux serveurs peuvent modifier la même conversation simultanément.

#### P2.2.1 — Abstraction Redlock
- Fichier : `src/redis/distributed-lock.service.ts`
- Wrapper autour de `redlock` (npm)
- Interface : `acquireLock(key, ttlMs): Promise<Lock>` / `releaseLock(lock): Promise<void>`
- TTL par défaut : 30s
- Max retries : 3

#### P2.2.2 — Remplacer mutex chat dans InboundMessageService
- Fichier : `src/webhooks/inbound-message.service.ts`
- Remplacer `this.chatMutexes.get(chatId)` par `distributedLock.acquireLock('chat:${tenantId}:${chatId}', 30000)`
- Supprimer `private readonly chatMutexes = new Map<string, MutexInterface>()`
- Fix memory leak

#### P2.2.3 — Remplacer mutex queue dans QueueService
- Fichier : `src/dispatcher/services/queue.service.ts`
- Remplacer le mutex global par `distributedLock.acquireLock('queue:${tenantId}', 10000)`
- Vérifier que les crons dispatcher utilisent aussi le lock

#### P2.2.4 — Distributed locking pour les crons
- Fichier : `src/jorbs/*.ts`
- Pattern : chaque cron essaie d'acquérir `cron:${jobName}:${tenantId}` avant d'exécuter
- Si lock non obtenu → skip (une autre instance tourne déjà)
- TTL lock = durée max estimée du job × 2

#### P2.2.5 — Tests distributed locking
- `src/redis/__tests__/distributed-lock.spec.ts`
- Mock Redis avec `ioredis-mock`
- Test : deux acquéreurs concurrents → un seul obtient le lock
- Test : lock expiré → deuxième acquéreur réussit

---

### P2.3 — 🔴 Redis adapter pour Socket.io [B]

**Contexte :** Les broadcasts Socket.io sont in-memory. En multi-instance, un agent connecté à l'instance B ne reçoit pas les événements émis par l'instance A.

#### P2.3.1 — Installer et configurer socket.io-redis
- Installer `@socket.io/redis-adapter`
- Fichier : `src/whatsapp_message/whatsapp_message.gateway.ts`
- Configurer l'adapter dans `afterInit()` : `this.server.adapter(createAdapter(pubClient, subClient))`
- Créer `pubClient` et `subClient` depuis `REDIS_CLIENT`

#### P2.3.2 — Vérifier les rooms cross-instance
- Rooms : `tenant:{tenantId}`, `conversation:{chatId}`, `poste:{posteId}`
- Tester : agent sur instance A, message reçu via instance B → broadcast visible

#### P2.3.3 — Graceful shutdown Socket.io
- Drainer les connexions WebSocket avant arrêt (SIGTERM)
- Délai grace : 10 secondes
- Notifier les clients : event `server:shutdown` → frontend affiche banner reconnnexion

---

### P2.4 — 🟡 Optimisations requêtes BDD [B]

#### P2.4.1 — Batch insert medias
- Fichier : `src/ingress/infrastructure/media-persistence.service.ts`
- Remplacer boucle `for (const media of medias)` par `repository.save([...medias])`
- Test : 5 médias en un seul insert

#### P2.4.2 — Pagination cursor-based sur conversations
- Fichier : `src/whatsapp_chat/whatsapp_chat.service.ts`
- Remplacer `find({})` par `findWithCursor({ after?: string, limit: number })`
- Retourner `{ data, nextCursor, hasMore }`
- Mettre à jour les endpoints GET `/conversations`

#### P2.4.3 — Pagination cursor sur messages
- Fichier : `src/whatsapp_message/whatsapp_message.service.ts`
- Même pattern que conversations
- Frontend : scroll infini vers le haut pour charger l'historique

#### P2.4.4 — Query timeouts
- Configurer TypeORM `connectTimeout: 10000`, `acquireTimeout: 15000`
- Ajouter timeout par requête critique (dispatcher, SLA) : 5s max
- Log les queries > 1s

---

### P2.5 — 🟡 Crons BullMQ (remplacer @Cron) [B]

#### P2.5.1 — Migrer offline-reinjection vers BullMQ
- Créer un BullMQ repeatable job au lieu de `@Cron`
- Lock distribué avant exécution
- Un seul tenant à la fois (éviter starvation)

#### P2.5.2 — Migrer SLA checker vers BullMQ
- Même pattern
- Traitement par batch de 100 (au lieu de full scan)
- Cursor sur `last_checked_at` pour processing incrémental

#### P2.5.3 — Migrer orphan-checker vers BullMQ
- Même pattern

#### P2.5.4 — Dashboard crons dans admin
- Vue `CronConfigView` : afficher statut BullMQ (actif, en attente, échoué)
- Bouton "Lancer maintenant" → trigger manuel du job
- Historique des 10 dernières exécutions

---

### Critères de validation Phase 2

- [ ] Webhook retourne 202 en < 100ms
- [ ] Lancer 2 instances → même message traité une seule fois (idempotency)
- [ ] Agent instance A → message visible sur agent instance B (Socket.io cross-instance)
- [ ] Tuer une instance en cours de traitement → message retraité par l'autre instance (retry BullMQ)
- [ ] Aucun deadlock cron en multi-instance (Redlock)
- [ ] `npx jest` → 240+ tests passent

---

## PHASE 3 — Fonctionnalités de base manquantes

> **Objectif :** Implémenter les fonctionnalités standard d'une plateforme de messagerie B2C que l'application n'a pas encore.  
> **Prérequis :** Aucun (déployable seul, Phase 1+2 recommandées).  
> **Durée estimée :** 5 semaines  
> **Sous-sections :** Canned Responses | Transfert | Labels | Recherche | Opt-out

---

### P3.1 — 🔴 Canned Responses (réponses prédéfinies) [B][F][A]

**Contexte :** Les agents répètent souvent les mêmes messages. Les canned responses permettent de gagner 30% de temps par conversation.

#### P3.1.1 — Entité et migration BDD [DB]
- Migration : `20260415_create_quick_replies.ts`
- Table `whatsapp_quick_reply` :
  ```
  id            uuid PK
  tenant_id     varchar(36) NOT NULL
  title         varchar(100) NOT NULL        -- nom affiché
  body          text NOT NULL                -- contenu message
  shortcut      varchar(20) NULL             -- ex: "/bonjour"
  category      varchar(50) NULL             -- ex: "Accueil", "Facturation"
  created_by    varchar(36) NULL FK → poste
  created_at    datetime
  updated_at    datetime
  deleted_at    datetime NULL                -- soft delete
  ```
- Index : `(tenant_id, shortcut)`, `(tenant_id, category)`

#### P3.1.2 — Module backend QuickReply [B]
- `src/quick-reply/quick-reply.module.ts`
- `src/quick-reply/quick-reply.service.ts` — CRUD + search par titre/shortcut
- `src/quick-reply/quick-reply.controller.ts` :
  - `GET /quick-replies?q=&category=` → liste paginée
  - `GET /quick-replies/categories` → liste des catégories
  - `POST /quick-replies` → créer
  - `PATCH /quick-replies/:id` → modifier
  - `DELETE /quick-replies/:id` → soft delete
- Auth : agents peuvent lire/créer, admin peut tout gérer
- Tests : `src/quick-reply/__tests__/quick-reply.service.spec.ts`

#### P3.1.3 — Intégration Frontend ChatInput [F]
- Détecter `/` au début de la saisie → afficher un dropdown de suggestions
- Filtrage temps-réel au fur et à mesure de la frappe (`/bon` → filtre sur shortcut)
- Navigation clavier (↑↓ + Entrée pour sélectionner)
- Cliquer sur une suggestion → insérer le corps dans l'input
- Support variables : `{{nom_client}}`, `{{date}}` → remplacées automatiquement

#### P3.1.4 — Gestion canned responses dans Admin [A]
- Vue `QuickRepliesView` dans le menu admin
- Liste avec filtres par catégorie
- Formulaire création/édition
- Import CSV (titre, body, shortcut, categorie)
- Export CSV

---

### P3.2 — 🔴 Transfert de conversation agent→agent [B][F][A]

**Contexte :** Un agent ne peut pas passer une conversation à un collègue. C'est bloquant pour la gestion des équipes.

#### P3.2.1 — Entité et migration BDD [DB]
- Ajouter table `conversation_transfer` :
  ```
  id              uuid PK
  conversation_id uuid FK → whatsapp_chat
  from_poste_id   uuid FK → whatsapp_poste
  to_poste_id     uuid FK → whatsapp_poste
  reason          varchar(255) NULL
  note            text NULL
  transferred_at  datetime
  transferred_by  varchar(36) NULL FK → poste
  ```

#### P3.2.2 — Service de transfert [B]
- Fichier : `src/dispatcher/application/transfer-conversation.use-case.ts`
- Logique :
  1. Vérifier que `from_poste` est bien assigné à la conversation
  2. Désassigner `from_poste`
  3. Assigner `to_poste` (mode direct, pas de queue)
  4. Créer enregistrement `conversation_transfer`
  5. Émettre événement Socket.io vers les deux postes
  6. Notifier l'agent qui reçoit
- Endpoint : `POST /conversations/:id/transfer` `{ toPosteId, reason?, note? }`
- Endpoint : `GET /conversations/:id/transfer-history`

#### P3.2.3 — UI Transfert Frontend [F]
- Bouton "Transférer" dans `ChatHeader`
- Modal : liste des agents disponibles (status online, charge actuelle)
- Champ note optionnel
- Confirmation → appel API → mise à jour conversation en temps réel

#### P3.2.4 — Notification réception transfert [F]
- L'agent destinataire reçoit une notification Socket.io
- Toast : "Conversation transférée par [Nom] : [Client]"
- La conversation apparaît en haut de sa liste (priorité haute)

#### P3.2.5 — Vue transferts dans Admin [A]
- Historique des transferts par agent (qui transfère le plus ?)
- Filtre par période, par agent source, par agent destination

---

### P3.3 — 🟡 Labels / Tags sur conversations [B][F][A]

**Contexte :** `WhatsappChatLabel` existe mais l'API CRUD est incomplète. Les agents ne peuvent pas tagger leurs conversations.

#### P3.3.1 — Compléter l'entité Label [DB]
- Vérifier/ajouter colonnes manquantes : `color` (hex), `icon` (emoji), `tenant_id`
- Migration si colonnes absentes

#### P3.3.2 — API Labels CRUD [B]
- Endpoints admin : `POST /labels`, `GET /labels`, `PATCH /labels/:id`, `DELETE /labels/:id`
- Endpoints agent : `POST /conversations/:id/labels/:labelId`, `DELETE /conversations/:id/labels/:labelId`
- `GET /conversations?labelId=` → filtre par label
- Tests unitaires

#### P3.3.3 — UI Labels Frontend [F]
- Affichage des labels sur chaque `ConversationItem` (pastilles colorées)
- Dans `ChatHeader` : bouton "+" pour ajouter/retirer des labels
- Filtre par label dans la sidebar `ConversationFilters`

#### P3.3.4 — Gestion Labels Admin [A]
- Vue `LabelsView` : CRUD labels (nom, couleur, icône)
- Stats : combien de conversations avec chaque label

---

### P3.4 — 🟡 Recherche de messages (Meilisearch) [B][F][INF]

**Contexte :** Actuellement aucune recherche full-text. Trouver un message = parcourir l'historique visuellement.

#### P3.4.1 — Setup Meilisearch [INF]
- Ajouter `meilisearch` dans `docker-compose.yml`
- Variables ENV : `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`
- Module : `src/search/search.module.ts`

#### P3.4.2 — Index messages Meilisearch [B]
- Fichier : `src/search/message-search.service.ts`
- Index : `messages_{tenantId}` (isolation par tenant)
- Champs indexés : `message_id`, `chat_id`, `text`, `from_name`, `timestamp`, `direction`
- Job BullMQ `search-indexing` : indexation des nouveaux messages (async, après persistance)
- Job de ré-indexation initiale (bulk, par batch de 1000)

#### P3.4.3 — Endpoint recherche [B]
- `GET /search/messages?q=&chatId=&from=&to=&limit=20&page=1`
- Auth : résultats filtrés par tenant + conversations de l'agent
- Retourne : `{ hits: [{ messageId, chatId, text, highlight, timestamp }], total, nbPages }`

#### P3.4.4 — UI Recherche Frontend [F]
- Barre de recherche globale dans le header (Ctrl+K)
- Résultats en temps réel (debounce 300ms)
- Cliquer sur un résultat → ouvrir la conversation + scroll jusqu'au message
- Highlight du terme recherché dans le message

---

### P3.5 — 🟡 Gestion opt-out (RGPD/LGPD) [B][F][A]

**Contexte :** Légalement obligatoire. Un client qui dit "STOP" ou se désabonne doit ne plus recevoir de messages.

#### P3.5.1 — Entité opt-out [DB]
- Ajouter colonne `opted_out_at datetime NULL` sur `whatsapp_chat`
- Ajouter table `opt_out_log` : `(id, tenant_id, chat_id, reason, opted_out_at, opted_in_at)`

#### P3.5.2 — Détection automatique opt-out [B]
- Dans `InboundMessageService` : détecter les messages "STOP", "ARRÊT", "UNSUBSCRIBE", "NO" (configurable)
- Si détecté → appeler `optOutService.optOut(chatId, 'user_request')`
- Bloquer l'envoi de messages sortants si `opted_out_at IS NOT NULL`

#### P3.5.3 — API opt-out [B]
- `POST /conversations/:id/opt-out` → marquer opted out
- `POST /conversations/:id/opt-in` → réactiver
- `GET /conversations/:id/opt-status`

#### P3.5.4 — UI opt-out [F]
- Badge "STOP" visible sur `ConversationItem` si opted out
- Warning dans `ChatInput` si agent tente d'envoyer un message à un client opted-out
- Bouton "Réactiver" si client a redonné son consentement

#### P3.5.5 — Vue conformité Admin [A]
- Nombre de clients opted-out par tenant
- Export CSV des opt-outs (conformité CNIL)
- Purge données : bouton "Anonymiser ce contact" (supprime nom, téléphone → garder stats)

---

### P3.6 — 🟢 Merge de conversations [B][F]

**Contexte :** Un même client peut avoir plusieurs conversations (WhatsApp + Instagram par exemple). Le merge regroupe l'historique.

#### P3.6.1 — API merge [B]
- `POST /conversations/merge` `{ primaryChatId, secondaryChatId[] }`
- Logique : déplacer les messages de `secondary` vers `primary`, fermer `secondary`, créer log de merge
- Contrainte : même tenant uniquement

#### P3.6.2 — UI merge Frontend [F]
- Dans `ContactDetailView` : liste des conversations du contact → bouton "Fusionner"
- Modal de confirmation avec aperçu des conversations à fusionner

---

### Critères de validation Phase 3

- [ ] Agent tape `/bonjour` → suggestions apparaissent en < 200ms
- [ ] Transfert d'une conversation → l'agent destinataire reçoit notification en temps réel
- [ ] Filtre par label → liste filtrée correcte
- [ ] Recherche "remboursement" → messages pertinents en < 500ms
- [ ] Message "STOP" d'un client → envoi bloqué côté agent
- [ ] `npx jest` → 280+ tests passent

---

## PHASE 4 — Couverture Meta Webhook & Templates HSM

> **Objectif :** Traiter les 10 événements Meta abonnés mais ignorés + implémenter les HSM templates et les campagnes de broadcast.  
> **Prérequis :** Aucun (déployable seul).  
> **Durée estimée :** 4 semaines

---

### P4.1 — 🔴 Handlers événements Meta critiques [B]

**Contexte :** Les événements `security`, `account_alerts` et `message_template_status_update` sont abonnés mais ignorés → disruptions silencieuses en production.

#### P4.1.1 — Handler security [B]
- Fichier : `src/webhooks/adapters/meta-event-handlers/security.handler.ts`
- Payload Meta : `{ type: 'security', ... }`
- Actions :
  - Log complet de l'événement
  - Créer alerte admin via `SystemAlertService`
  - Vérifier si le token est révoqué → désactiver le channel si oui
  - Email notification à l'admin (si configuré)

#### P4.1.2 — Handler account_alerts [B]
- Fichier : `src/webhooks/adapters/meta-event-handlers/account-alerts.handler.ts`
- Types d'alertes : `PAYMENT_ISSUE`, `RATE_LIMIT_HIT`, `MESSAGING_LIMIT_CHANGE`, `NAME_UPDATE`
- Actions par type : log + alerte admin + notification temps-réel dans admin

#### P4.1.3 — Handler message_template_status_update [B]
- Fichier : `src/webhooks/adapters/meta-event-handlers/template-status.handler.ts`
- Payload : `{ messageTemplateId, messageTemplateName, event: 'APPROVED'|'REJECTED'|'PAUSED' }`
- Actions : mettre à jour statut du template en BDD + notifier l'admin
- Prérequis : Module template (P4.2) doit exister → handler peut aussi être ajouté avec P4.2

#### P4.1.4 — Handler account_update [B]
- Log + notification admin
- Si `account_restriction` → marquer channel comme restreint en BDD

#### P4.1.5 — Handler messaging_handovers [B]
- Log transferts vers applications tierces (pass thread control)
- Marquer conversation comme "handed over" si nécessaire

#### P4.1.6 — Handler calls [B]
- Persister les appels WhatsApp manqués/reçus dans `CallLogModule`
- Notification agent si appel manqué pendant sa session

#### P4.1.7 — Handlers mineurs (log only) [B]
- `flows` → log statut flow Meta
- `history` → déclencher sync messages historiques
- `user_preferences` → mettre à jour `opted_out_at` si l'utilisateur a refusé les messages
- `account_review_update` → log + alerte admin

#### P4.1.8 — Registre des handlers dans meta.adapter.ts [B]
- Refactoriser `meta.adapter.ts` : router chaque type d'événement vers son handler
- Pattern Strategy/Registry
- Tests pour chaque handler

---

### P4.2 — 🔴 Module HSM Templates [B][A]

**Contexte :** Les templates HSM sont des messages pré-approuvés par Meta, obligatoires pour contacter un client après 24h ou pour les campagnes. Non implémenté = campagnes impossibles.

#### P4.2.1 — Entité et migration BDD [DB]
- Migration : `20260415_create_whatsapp_templates.ts`
- Table `whatsapp_template` :
  ```
  id                  uuid PK
  tenant_id           varchar(36) NOT NULL
  channel_id          uuid FK → whapi_channel
  name                varchar(512) NOT NULL
  category            enum('MARKETING','UTILITY','AUTHENTICATION')
  language            varchar(10) NOT NULL           -- ex: 'fr', 'en_US'
  status              enum('PENDING','APPROVED','REJECTED','PAUSED','DISABLED')
  rejected_reason     varchar(512) NULL
  meta_template_id    varchar(100) NULL              -- ID chez Meta
  header_type         enum('TEXT','IMAGE','VIDEO','DOCUMENT') NULL
  header_content      text NULL
  body_text           text NOT NULL
  footer_text         varchar(60) NULL
  parameters          json NULL                      -- variables {{1}}, {{2}}...
  buttons             json NULL                      -- CTA / quick reply buttons
  created_at          datetime
  updated_at          datetime
  ```
- Index : `(tenant_id, status)`, `(meta_template_id)`

#### P4.2.2 — Service templates [B]
- Fichier : `src/whatsapp_template/whatsapp-template.service.ts`
- `create(dto)` → créer en local + soumettre à Meta API
- `syncFromMeta(channelId)` → récupérer tous les templates Meta et mettre à jour la BDD
- `updateStatus(metaTemplateId, status, rejectedReason?)` → appelé par handler P4.1.3
- `findAll(tenantId, filters)` → liste avec pagination

#### P4.2.3 — Controller templates [B]
- `GET /templates` → liste avec filtres (status, category, language)
- `POST /templates` → créer + soumettre à Meta
- `GET /templates/:id` → détail
- `DELETE /templates/:id` → désactiver (Meta ne supprime pas)
- `POST /templates/sync` → re-sync depuis Meta

#### P4.2.4 — Envoi HSM dans communication_meta.service [B]
- Fichier : `src/communication_whapi/communication_meta.service.ts`
- Nouvelle méthode `sendTemplate(channelId, to, templateName, language, components[])`
- Appel API Meta : `POST /{phone-number-id}/messages` avec `type: 'template'`
- Gérer les variables (composants header, body, buttons)

#### P4.2.5 — Vue Templates Admin [A]
- Vue `TemplatesView` : liste avec statut (badge couleur APPROVED/REJECTED/PENDING)
- Formulaire création : nom, catégorie, langue, header, body, footer, paramètres, boutons
- Preview live du template
- Bouton "Synchroniser depuis Meta"
- Badge rouge si template rejeté avec raison du rejet

---

### P4.3 — 🔴 Module Broadcast / Campagnes [B][A]

**Contexte :** Permet d'envoyer un message HSM à une liste de destinataires. Cas d'usage : promos, rappels, notifications.

#### P4.3.1 — Entité et migration BDD [DB]
- Migration : `20260415_create_broadcasts.ts`
- Table `whatsapp_broadcast` :
  ```
  id              uuid PK
  tenant_id       varchar(36) NOT NULL
  name            varchar(255) NOT NULL
  template_id     uuid FK → whatsapp_template
  channel_id      uuid FK → whapi_channel
  status          enum('DRAFT','SCHEDULED','RUNNING','PAUSED','COMPLETED','FAILED')
  scheduled_at    datetime NULL
  started_at      datetime NULL
  completed_at    datetime NULL
  total_count     int DEFAULT 0
  sent_count      int DEFAULT 0
  delivered_count int DEFAULT 0
  read_count      int DEFAULT 0
  failed_count    int DEFAULT 0
  created_by      varchar(36)
  created_at      datetime
  ```
- Table `whatsapp_broadcast_recipient` :
  ```
  id              uuid PK
  broadcast_id    uuid FK → whatsapp_broadcast CASCADE
  phone           varchar(20) NOT NULL
  variables       json NULL       -- valeurs {{1}}, {{2}} spécifiques à ce destinataire
  status          enum('PENDING','SENT','DELIVERED','READ','FAILED')
  error_message   varchar(255) NULL
  sent_at         datetime NULL
  ```

#### P4.3.2 — Service broadcast [B]
- Fichier : `src/whatsapp_broadcast/broadcast.service.ts`
- `create(dto)` → créer campagne en DRAFT
- `schedule(id, date)` → programmer
- `launch(id)` → lancer maintenant → enqueue jobs d'envoi
- `pause(id)`, `resume(id)`, `cancel(id)`
- Rate limiting envoi : max 1000/min par numéro (contrainte Meta)

#### P4.3.3 — Worker d'envoi broadcast [B]
- File BullMQ `broadcast-sending`
- Batch : 50 envois par job, 1 job/s (respect rate limit Meta)
- Retry : 2 tentatives si erreur temporaire
- Mise à jour compteurs en temps réel

#### P4.3.4 — Controller broadcast [B]
- CRUD standard
- `POST /broadcasts/:id/launch`
- `POST /broadcasts/:id/pause`
- `GET /broadcasts/:id/stats` → stats temps-réel
- `GET /broadcasts/:id/recipients?status=FAILED` → liste destinataires par statut

#### P4.3.5 — Upload destinataires [B]
- `POST /broadcasts/:id/recipients/upload` → CSV (colonne phone + variables)
- Validation format E.164
- Déduplication automatique
- Limite : 100k destinataires max par campagne

#### P4.3.6 — Vue Broadcasts Admin [A]
- Vue `BroadcastsView` : liste campagnes avec statut + barre de progression
- Formulaire création : nom, template, channel, scheduling
- Import CSV destinataires avec preview (10 premières lignes)
- Dashboard stats : sent/delivered/read/failed (graphique temps-réel)
- Boutons : Lancer, Pauser, Annuler

---

### P4.4 — 🟡 Webhook health check périodique [B]

**Contexte :** Meta peut révoquer un token ou désactiver un webhook sans prévenir. Sans monitoring, l'app est silencieusement brisée.

#### P4.4.1 — Service channel health check [B]
- Fichier : `src/channel/channel-health.service.ts`
- Cron toutes les heures : vérifier que chaque channel Meta est actif via Graph API `GET /{phone-number-id}`
- Si erreur 401/403 → marquer channel `status: 'DISCONNECTED'` + alerte admin

#### P4.4.2 — Indicateur visuel dans Admin [A]
- Badge vert/rouge sur chaque channel dans `ChannelsView`
- Dernière vérification : timestamp
- Bouton "Re-connecter" si disconnected

---

### Critères de validation Phase 4

- [ ] Simuler webhook `security` Meta → alerte visible dans admin en < 5s
- [ ] Créer template → statut PENDING → simuler webhook approval → statut APPROVED
- [ ] Broadcast 10 destinataires → 10 messages envoyés, compteurs corrects
- [ ] Upload CSV 100 destinataires → tous enregistrés, doublons dédupliqués
- [ ] `npx jest` → 320+ tests passent

---

## PHASE 5 — CRM & Analytics

> **Objectif :** Enrichir les profils clients, ajouter des analytics actionnables pour les managers, et l'audit trail de conformité.  
> **Prérequis :** Aucun (déployable seul).  
> **Durée estimée :** 5 semaines

---

### P5.1 — 🟡 CRM Profiles (champs personnalisés) [B][F][A]

**Contexte :** L'entité `Contact` existe mais est basique. Les entreprises ont besoin de champs métier spécifiques (numéro client, secteur, tier, etc.)

#### P5.1.1 — Custom fields definition [DB]
- Table `contact_field_definition` :
  ```
  id          uuid PK
  tenant_id   varchar(36) NOT NULL
  name        varchar(100) NOT NULL    -- ex: "Numéro client"
  field_key   varchar(50) NOT NULL     -- ex: "numero_client"
  field_type  enum('text','number','date','boolean','select','multiselect')
  options     json NULL                -- pour select/multiselect
  required    boolean DEFAULT false
  position    int DEFAULT 0
  created_at  datetime
  ```
- Table `contact_field_value` :
  ```
  id              uuid PK
  contact_id      uuid FK → contact
  field_id        uuid FK → contact_field_definition
  value_text      text NULL
  value_number    decimal(15,4) NULL
  value_date      date NULL
  value_boolean   tinyint NULL
  value_json      json NULL            -- pour select/multiselect
  ```

#### P5.1.2 — Service custom fields [B]
- `ContactFieldService` : CRUD définitions
- `ContactService.updateCustomFields(contactId, values[])` : mise à jour valeurs
- Validation par type (number range, date format, select options)

#### P5.1.3 — API custom fields [B]
- `GET /contacts/field-definitions` → liste les définitions du tenant
- `POST /contacts/field-definitions` → créer un champ
- `PATCH /contacts/:id/custom-fields` → mettre à jour les valeurs

#### P5.1.4 — UI Custom fields Frontend [F]
- Dans `ContactDetailView` : section "Informations client" avec tous les champs
- Édition inline par champ
- Affichage différent par type (date picker, toggle pour boolean, etc.)

#### P5.1.5 — Builder champs Admin [A]
- Vue `CrmFieldsView` : liste des champs + drag-and-drop pour réordonner
- Formulaire création : nom, type, options (pour select), obligatoire
- Preview du formulaire contact tel que vu par l'agent

---

### P5.2 — 🟡 Analytics & Reporting [B][A]

**Contexte :** `MetriquesModule` existe mais peu de métriques temps-réel. Les managers n'ont pas de visibilité sur la performance des équipes.

#### P5.2.1 — Entité AnalyticsEvent [DB]
- Étendre ou utiliser `Metrique` existant
- Événements trackés :
  - `CONVERSATION_CREATED`, `CONVERSATION_CLOSED`, `CONVERSATION_TRANSFERRED`
  - `MESSAGE_RECEIVED`, `MESSAGE_SENT`
  - `FIRST_RESPONSE`, `RESOLUTION`
  - `BOT_STARTED`, `BOT_HANDOFF`, `BOT_COMPLETED`
- Champs : `tenant_id`, `event_type`, `poste_id`, `chat_id`, `channel_id`, `duration_ms`, `occurred_at`

#### P5.2.2 — Service analytics [B]
- Fichier : `src/analytics/analytics.service.ts`
- Calculs :
  - `avgFirstResponseTime(tenantId, from, to, posteId?)` → temps moyen première réponse
  - `avgResolutionTime(tenantId, from, to)` → temps moyen résolution
  - `conversationVolume(tenantId, from, to, groupBy: 'hour'|'day'|'week')` → volume par période
  - `agentPerformance(tenantId, from, to)` → classement agents (volume, temps réponse, satisfaction)
  - `channelBreakdown(tenantId, from, to)` → répartition par channel
  - `tagBreakdown(tenantId, from, to)` → répartition par label

#### P5.2.3 — API analytics [B]
- `GET /analytics/overview?from=&to=` → KPIs globaux
- `GET /analytics/agents?from=&to=` → performance par agent
- `GET /analytics/volume?from=&to=&groupBy=` → volume temporel
- `GET /analytics/channels?from=&to=` → répartition channels
- Export CSV/PDF : `GET /analytics/export?type=agents&from=&to=&format=csv`

#### P5.2.4 — Dashboard analytics Admin [A]
- Vue `AnalyticsView` avec onglets : Vue d'ensemble | Agents | Channels | Labels
- Graphiques : recharts ou chart.js
  - Volume conversations (ligne temporelle)
  - Temps moyen première réponse (barres par agent)
  - Répartition par channel (camembert)
  - Heatmap activité (heures × jours de la semaine)
- Sélecteur de période (aujourd'hui, 7j, 30j, personnalisé)
- Export CSV

---

### P5.3 — 🟡 SLA Rules configurables [B][A]

**Contexte :** Seul le SLA "first response 24h" est en place. Les entreprises ont besoin de SLA différents par client, par label ou par channel.

#### P5.3.1 — Entité SLA Rule [DB]
- Table `sla_rule` :
  ```
  id                      uuid PK
  tenant_id               varchar(36) NOT NULL
  name                    varchar(100) NOT NULL
  priority                int DEFAULT 0          -- plus élevé = appliqué en premier
  condition_type          enum('ALL','LABEL','CHANNEL','TAG')
  condition_value         varchar(100) NULL
  first_response_minutes  int NOT NULL           -- SLA première réponse
  resolution_hours        int NOT NULL           -- SLA résolution
  escalation_poste_id     uuid NULL FK           -- escalader vers ce poste
  is_default              boolean DEFAULT false
  created_at              datetime
  ```

#### P5.3.2 — Service SLA Rules [B]
- Évaluer quelle règle SLA s'applique à une conversation (par priorité)
- Mettre à jour `SlaPolicy` existant pour utiliser les règles
- Alertes paramétrables : alerte à 50%, 80%, 100% du SLA

#### P5.3.3 — Vue SLA Admin [A]
- Vue `SlaRulesView` : liste des règles avec priorité drag-and-drop
- Formulaire : conditions, seuils, escalation
- Indicateurs temps-réel : conversations en risque SLA (orange), SLA dépassé (rouge)

---

### P5.4 — 🟡 Audit Trail [B][A]

**Contexte :** Impossible de savoir qui a fermé une conversation, qui a transféré, qui a modifié une config. Problème de conformité et de debug.

#### P5.4.1 — Entité AuditLog [DB]
- Table `audit_log` :
  ```
  id          uuid PK
  tenant_id   varchar(36) NOT NULL
  actor_type  enum('admin','poste','system','bot')
  actor_id    varchar(36) NOT NULL
  actor_name  varchar(100) NULL
  action      varchar(100) NOT NULL     -- ex: 'conversation.closed', 'channel.created'
  entity_type varchar(50) NOT NULL      -- ex: 'conversation', 'channel'
  entity_id   varchar(36) NOT NULL
  old_value   json NULL
  new_value   json NULL
  ip_address  varchar(45) NULL
  occurred_at datetime NOT NULL
  ```
- Index : `(tenant_id, entity_type, entity_id)`, `(tenant_id, actor_id)`, `(occurred_at)`

#### P5.4.2 — Decorator @Audited [B]
- Décorateur TypeScript pour les méthodes de service
- Usage : `@Audited('conversation.closed')` → intercepte et loge automatiquement
- Injecter dans : conversation close/transfer, channel CRUD, template CRUD, config changes

#### P5.4.3 — Vue Audit Admin [A]
- Vue `AuditTrailView` : flux d'événements avec filtres (acteur, type action, entité, période)
- Détail par événement : avant/après (diff)
- Export CSV

---

### P5.5 — 🟢 Roles & Permissions ACL [B][F][A]

**Contexte :** Actuellement : admin ou agent, rien entre les deux. Impossible de faire un agent senior, un superviseur, un agent en lecture seule.

#### P5.5.1 — Entité Role et Permission [DB]
- Table `role` : `(id, tenant_id, name, permissions json)`
- Table `poste_role` : relation many-to-many
- Permissions granulaires : `conversation.read`, `conversation.transfer`, `broadcast.create`, `analytics.view`, etc.

#### P5.5.2 — Guard ACL [B]
- `@RequirePermission('broadcast.create')` → decorator
- Middleware vérifie JWT + permissions du role
- Cache roles en Redis (TTL 5min)

#### P5.5.3 — Gestion Roles Admin [A]
- Vue `RolesView` : CRUD roles, checkboxes permissions
- Assigner role à un agent

---

### Critères de validation Phase 5

- [ ] Créer champ custom "Numéro client" → visible sur fiche contact agent
- [ ] Dashboard analytics : volume correct sur 7 derniers jours
- [ ] SLA rule "LABEL=VIP → 30 min" → conversation VIP montre deadline 30 min
- [ ] Fermer une conversation → entrée audit trail créée
- [ ] `npx jest` → 360+ tests passent

---

## PHASE 6 — Intelligence & Automatisation

> **Objectif :** Ajouter des fonctionnalités d'intelligence artificielle et d'automatisation avancées pour différencier la plateforme.  
> **Prérequis :** Phases 3 et 5 recommandées (CRM + Analytics).  
> **Durée estimée :** 6 semaines

---

### P6.1 — 🟢 Analyse de sentiment [B][A]

#### P6.1.1 — Intégration API sentiment
- Choisir provider : Google NLP, AWS Comprehend, ou modèle local (Hugging Face)
- Variable ENV : `SENTIMENT_PROVIDER`, `SENTIMENT_API_KEY`
- Analyser message client → score sentiment (-1 à +1) + label (POSITIVE/NEUTRAL/NEGATIVE)
- Job BullMQ async : analyse après persistance (ne bloque pas le pipeline)

#### P6.1.2 — Stockage et agrégats
- Ajouter `sentiment_score float NULL` sur `whatsapp_message`
- Agrégat par conversation : `avg_sentiment` sur `whatsapp_chat`
- Analytics : évolution sentiment par période, par agent, par channel

#### P6.1.3 — UI sentiment
- Indicateur sentiment sur `ConversationItem` (emoji 😊/😐/😠)
- Dashboard admin : conversations à sentiment négatif → alerte superviseur
- Filtre conversations par sentiment dans la sidebar

---

### P6.2 — 🟢 Workflow Automation avancée (extensions FlowBot) [B][A]

#### P6.2.1 — Nouveaux types de triggers
- `SCHEDULE` : lancer un flow à une heure précise
- `INACTIVITY` : client inactif depuis X heures
- `LABEL_ADDED` : quand un label est apposé
- `SLA_BREACH` : quand le SLA est dépassé
- `SENTIMENT_NEGATIVE` : si sentiment < seuil

#### P6.2.2 — Nouveaux types de nodes
- `DELAY` : attendre X minutes avant de continuer
- `HTTP_REQUEST` : appeler un webhook externe (Zapier, n8n, CRM)
- `SEND_TEMPLATE` : envoyer un HSM template
- `ASSIGN_LABEL` : apposer un label
- `CLOSE_CONVERSATION` : fermer automatiquement
- `CREATE_TASK` : créer une tâche (si module tasks)

#### P6.2.3 — Flow retry et timeout par node
- Chaque node peut avoir un timeout configurable (default 30s)
- Si timeout → chemin d'erreur configurable
- Retry 2x avant d'aller sur le chemin erreur

#### P6.2.4 — Templates de flows prédéfinis [A]
- "Accueil hors-heures" — message auto + réassignation le lendemain matin
- "Escalade SLA" — notification superviseur + transfer automatique
- "Bot → Humain" — handoff après 3 tentatives bot échouées
- Import/Export flows en JSON

---

### P6.3 — 🟢 Intégrations externes [B][A]

#### P6.3.1 — Webhooks sortants (outbound webhooks)
- Admin peut configurer des URLs à notifier lors d'événements
- Événements disponibles : `conversation.created`, `message.received`, `conversation.closed`
- Payload : JSON normalisé
- Retry en cas d'échec (3x exponential backoff)
- Log des appels dans `OutboundWebhookLog`

#### P6.3.2 — Zapier / n8n connector
- Créer un trigger Zapier : "New WhatsApp conversation"
- Créer une action Zapier : "Send WhatsApp template"
- Documenter l'API pour n8n (HTTP Request node)

---

### P6.4 — 🟢 AI-assisted replies [B][F]

#### P6.4.1 — Suggestions de réponses
- Analyser les X derniers messages de la conversation
- Appeler LLM (GPT-4o, Claude, etc.) pour suggérer 3 réponses courtes
- Afficher dans le `ChatInput` comme suggestions cliquables
- Configurable : activer/désactiver par agent dans les settings

#### P6.4.2 — Résumé de conversation
- Bouton "Résumer" dans `ChatHeader`
- Appel LLM → résumé en 3 points
- Utile lors d'un transfer pour briefer le nouvel agent

---

### Critères de validation Phase 6

- [ ] Message négatif → score sentiment affiché en < 3s
- [ ] Flow avec node DELAY(5min) → message envoyé 5 min après trigger
- [ ] Webhook sortant configuré → appelé lors d'une nouvelle conversation
- [ ] AI suggestion → 3 options affichées en < 2s dans ChatInput
- [ ] `npx jest` → 400+ tests passent

---

## Récapitulatif global

### Tableau de bord des phases

| Phase | Tickets | Sous-tickets | Durée | Valeur business |
|---|---|---|---|---|
| Phase 1 — Sécurité | 5 | 18 | 2 sem | Sécurité production |
| Phase 2 — Scalabilité | 5 | 21 | 3 sem | Multi-instance, haute dispo |
| Phase 3 — Fonctionnalités de base | 6 | 28 | 5 sem | Compétitivité terrain |
| Phase 4 — Meta Webhook + HSM | 4 | 20 | 4 sem | Revenue (campagnes) |
| Phase 5 — CRM & Analytics | 5 | 22 | 5 sem | Insights management |
| Phase 6 — Intelligence | 4 | 14 | 6 sem | Différenciation |
| **Total** | **29** | **123** | **25 sem** | |

---

### Ordre de déploiement recommandé

```
MAINTENANT (sem 1-2)
└─ Phase 1 : Sécurité & Fondations
   └─ P1.1 HMAC (1 jour)
   └─ P1.2 Redis (2 jours)
   └─ P1.3 Indexes BDD (1 jour)

EN PARALLÈLE (sem 3-7)
├─ Phase 2 : Scalabilité (dépend Redis de P1.2)
└─ Phase 3 : Fonctionnalités de base (indépendant)

ENSUITE (sem 8-11)
└─ Phase 4 : Meta Webhook + HSM (indépendant)

PUIS (sem 12-16)
└─ Phase 5 : CRM & Analytics (indépendant)

ENFIN (sem 17-25)
└─ Phase 6 : Intelligence (bénéficie de P5)
```

---

### Définition of Done (par ticket)

Un ticket est considéré TERMINÉ quand :
- [ ] Code implémenté et respecte les conventions du projet
- [ ] Tests unitaires écrits (couverture ≥ 80% sur le nouveau code)
- [ ] `npx tsc --noEmit` → 0 erreur
- [ ] `npx jest` → tous les tests passent
- [ ] Documenté (JSDoc sur les méthodes publiques)
- [ ] Revu par un pair (PR approuvée)
- [ ] Déployé sur staging sans régression
- [ ] Feature flag ON/OFF si fonctionnalité risquée

---

*Document généré le 2026-04-15 — Basé sur AUDIT_TECHNIQUE_2026-04-15.md*
