# AUDIT COMPLET — Projet WhatsApp Demutualisation & Dispatching

**Date:** 2026-03-03
**Branche:** master
**Répertoire:** `/projet/whatsapp`
**Stack:** NestJS 11 · TypeORM · MySQL · Next.js 16 · React 19 · Socket.io

---

## TABLE DES MATIÈRES

1. [Structure générale](#1-structure-générale)
2. [Backend NestJS](#2-backend-nestjs)
3. [Frontend commerciaux (front)](#3-frontend-commerciaux)
4. [Panel Admin (admin)](#4-panel-admin)
5. [Flux de données](#5-flux-de-données)
6. [Variables d'environnement](#6-variables-denvironnement)
7. [Sécurité](#7-sécurité)
8. [Performance & Scalabilité](#8-performance--scalabilité)
9. [État production](#9-état-production)
10. [Points critiques & risques](#10-points-critiques--risques)

---

## 1. STRUCTURE GÉNÉRALE

```
whatsapp/
├── message_whatsapp/     ← Backend NestJS + TypeORM + MySQL (port 3002)
├── front/                ← Frontend React/Next.js — Agents commerciaux (port 3000)
├── admin/                ← Panel Admin Next.js (port 3001)
├── programmeTest/        ← Scripts de test webhooks
├── scripts/              ← Utilitaires
├── docs/                 ← Documentation
└── docker-compose.yml    ← Orchestration conteneurs
```

---

## 2. BACKEND NESTJS

### 2.1 Modules (22 modules)

| Module | Controller | Service(s) | Entité(s) | Rôle |
|--------|-----------|------------|-----------|------|
| AdminModule | AdminController | AdminService | Admin | Gestion admins |
| AuthModule | AuthController | AuthService, JwtStrategy | WhatsappCommercial | Auth JWT commerciaux (3600s) |
| AuthAdminModule | AuthAdminController | AuthAdminService, JwtAdminStrategy | Admin | Auth JWT admins (refresh token) |
| CallLogModule | CallLogController | CallLogService | CallLog | Logs appels téléphoniques |
| ChannelModule | ChannelController | ChannelService | WhapiChannel, ProviderChannel | Canaux Whapi/Meta |
| CommunicationWhapiModule | CommunicationWhapiController | CommunicationWhapiService, CommunicationMetaService, OutboundRouterService | — | Envoi messages sortants |
| ContactModule | ContactController | ContactService | Contact | Contacts clients (CRM) |
| DispatcherModule | DispatcherController | DispatcherService, QueueService, DispatchSettingsService | QueuePosition, DispatchSettings, DispatchSettingsAudit | File d'attente + assignation |
| JorbsModule | — | TasksService, FirstResponseTimeoutJob, OfflineReinjectionJob, ReadOnlyEnforcementJob | — | CRON jobs |
| LoggingModule | — | AppLogger | — | Logging centralisé |
| MessageAutoModule | MessageAutoController | MessageAutoService, AutoMessageOrchestrator, AutoMessageScopeConfigService | MessageAuto, AutoMessageScopeConfig | Messages automatiques |
| MetriquesModule | MetriquesController | MetriquesService | — | Statistiques & analytics |
| WhatsappButtonModule | WhatsappButtonController | WhatsappButtonService | WhatsappButton | Boutons interactifs |
| WhatsappChatModule | WhatsappChatController | WhatsappChatService | WhatsappChat | Conversations |
| WhatsappChatLabelModule | WhatsappChatLabelController | WhatsappChatLabelService | WhatsappChatLabel | Étiquettes chats |
| WhatsappCommercialModule | WhatsappCommercialController | WhatsappCommercialService | WhatsappCommercial | Agents commerciaux |
| WhatsappContactsModule | WhatsappContactsController | WhatsappContactsService | WhatsappContacts | Contacts WhatsApp importés |
| WhatsappCustomerModule | WhatsappCustomerController | WhatsappCustomerService | WhatsappCustomer | Clients finaux |
| WhatsappErrorModule | WhatsappErrorController | WhatsappErrorService | WhatsappError | Logs erreurs |
| WhatsappLastMessageModule | — | — | WhatsappLastMessage | Cache dernier message par chat |
| WhatsappMediaModule | WhatsappMediaController | WhatsappMediaService | WhatsappMedia | Médias |
| WhatsappMessageModule | WhatsappMessageController | WhatsappMessageService, WhatsappMessageGateway | WhatsappMessage | Messages + WebSocket temps réel |
| WhatsappPosteModule | WhatsappPosteController | WhatsappPosteService | WhatsappPoste | Postes de travail |

### 2.2 Entités de base de données (20 tables)

```
WhatsappMessage           id, chat_id, channel_id, direction(IN/OUT), status(SENT/DELIVERED/READ/PLAYED),
                          timestamp, commercial_id, quoted_message_id, from_me, provider_message_id,
                          error_code, error_title, createdAt, updatedAt, deletedAt

WhatsappChat              chat_id, channel_id, poste_id, status(ACTIF/EN_ATTENTE/FERME),
                          unread_count, assigned_at, assigned_mode(ONLINE/OFFLINE),
                          first_response_deadline_at, last_client_message_at, last_poste_message_at,
                          last_msg_client_channel_id, read_only, auto_message_step,
                          last_auto_message_sent_at, auto_message_enabled, createdAt, deletedAt

WhatsappMedia             id, message_id, chat_id, provider(whapi/meta), provider_media_id,
                          whapi_media_id, url, mime_type, file_name, file_size, createdAt

WhatsappCommercial        id, email(UNIQUE), name, password(HASHED), poste_id(FK),
                          isConnected, lastConnectionAt, createdAt, deletedAt

WhatsappPoste             id, name, code, is_active, is_queue_enabled,
                          chats(OneToMany), commercial(OneToMany), createdAt, deletedAt

WhapiChannel              channel_id(UNIQUE), token(TEXT), provider(whapi/meta),
                          external_id(UNIQUE), device_id, ip, version, start_at, uptime,
                          is_business, api_version, core_version

ProviderChannel           id, provider, external_id, channel_id, tenant_id, createdAt

Admin                     id(UUID), email(UNIQUE), name, password(HASHED), createdAt, deletedAt

Contact                   id(UUID), name, phone, chat_id, is_active, call_status, last_call_date,
                          next_call_date, call_count, conversion_status, source, priority,
                          createdAt, updatedAt, deletedAt

WhatsappContacts          phone, name, avatar
WhatsappCustomer          customer_id, phone, name
QueuePosition             id, poste_id, position, addedAt, updatedAt
DispatchSettings          no_reply_reinject_interval_minutes, read_only_check_interval_minutes,
                          offline_reinject_cron, auto_message_enabled, auto_message_delay_min/max_seconds,
                          auto_message_max_steps
DispatchSettingsAudit     id, settings_id, payload(JSON), createdAt
MessageAuto               id, body, delai, canal(whatsapp/sms/email), position, actif, createdAt, updatedAt
AutoMessageScopeConfig    id, scope_type(poste/canal/provider), scope_id, label, enabled
WhatsappError             id, error_code, error_title, message_id
WhatsappChatLabel         id, chat_id, label
WhatsappButton            id, message_id, button_data
WhatsappLastMessage       id, chat_id, content, timestamp
CallLog                   id, chat_id, call_status, duration, outcome, notes, createdAt
```

**Convention TypeORM:**
- Properties: camelCase (`createdAt`, `posteId`)
- Colonnes SQL: snake_case via `name: 'created_at'`
- QueryBuilder: utilise les **property names** (camelCase), pas les column names
- Soft delete: `@DeleteDateColumn()` partout (jamais de hard delete)

### 2.3 Routes API complètes

#### Authentification
```
POST   /auth/login                            → Login commercial (JWT cookie 3600s)
POST   /auth/logout                           → Logout commercial
POST   /auth/admin/login                      → Login admin (JWT + refresh token)
POST   /auth/admin/logout                     → Logout admin
GET    /auth/admin/profile                    → Vérifier auth admin en cours
```

#### Messages
```
POST   /messages                  [AdminGuard]  → Envoyer message texte (admin)
POST   /messages/media            [JwtGuard]    → Upload + envoyer média (commercial)
GET    /messages/:chat_id/count   [AdminGuard]  → Nombre de messages du chat
GET    /messages/:chat_id         [AdminGuard]  → Messages d'un chat
GET    /messages?limit&offset     [AdminGuard]  → Tous les messages (pagination)
GET    /messages/media/whapi/:messageId         → Stream média Whapi
GET    /messages/media/meta/:providerMediaId    → Stream média Meta
```

#### Queue & Dispatch
```
GET    /queue                           [AdminGuard] → Positions file d'attente
POST   /queue/reset                     [AdminGuard] → Reset complète de la queue
POST   /queue/block/:posteId            [AdminGuard] → Bloquer un poste
POST   /queue/unblock/:posteId          [AdminGuard] → Débloquer un poste
GET    /queue/dispatch                  [AdminGuard] → Snapshot queue + chats en attente
GET    /queue/dispatch/settings         [AdminGuard] → Paramètres dispatch
POST   /queue/dispatch/settings         [AdminGuard] → Mettre à jour settings
POST   /queue/dispatch/settings/reset   [AdminGuard] → Remettre settings par défaut
GET    /queue/dispatch/settings/audit   [AdminGuard] → Historique changements settings
GET    /queue/dispatch/settings/audit/page [AdminGuard] → Historique paginé
```

#### Chats
```
GET    /chats?limit&offset         [AdminGuard] → Liste conversations (pagination)
```

#### Contacts
```
GET    /contact?limit&offset       [AdminGuard] → Contacts clients (pagination)
POST   /contact                    [AdminGuard] → Créer contact
PATCH  /contact/:id                [AdminGuard] → Mettre à jour contact
DELETE /contact/:id                [AdminGuard] → Supprimer contact
```

#### Postes & Commerciaux
```
GET    /poste                      [AdminGuard] → Liste postes
POST   /poste                      [AdminGuard] → Créer poste
PATCH  /poste/:id                  [AdminGuard] → Mettre à jour poste
DELETE /poste/:id                  [AdminGuard] → Supprimer poste
GET    /users                      [AdminGuard] → Liste commerciaux
POST   /users                      [AdminGuard] → Créer commercial
PATCH  /users/:id                  [AdminGuard] → Mettre à jour commercial
DELETE /users/:id                  [AdminGuard] → Supprimer commercial
```

#### Canaux
```
GET    /channel                    [AdminGuard] → Liste canaux
POST   /channel                    [AdminGuard] → Créer canal (Whapi ou Meta)
PATCH  /channel/:id                [AdminGuard] → Mettre à jour canal
DELETE /channel/:id                [AdminGuard] → Supprimer canal
```

#### Messages Automatiques
```
GET    /message-auto               [AdminGuard] → Liste auto-messages
POST   /message-auto               [AdminGuard] → Créer auto-message
PATCH  /message-auto/:id           [AdminGuard] → Mettre à jour auto-message
DELETE /message-auto/:id           [AdminGuard] → Supprimer auto-message
GET    /message-auto/scope-config  [AdminGuard] → Scopes de config (poste/canal/provider)
GET    /message-auto/scope-config/type/:type    → Scopes d'un type donné
POST   /message-auto/scope-config  [AdminGuard] → Upsert scope config
DELETE /message-auto/scope-config/:id [AdminGuard] → Supprimer scope config
```

#### Métriques & Stats
```
GET    /api/metriques/globales                        [AdminGuard] → Métriques globales
GET    /api/metriques/commerciaux                     [AdminGuard] → Performance commerciaux
GET    /api/metriques/channels                        [AdminGuard] → Statut des canaux
GET    /api/metriques/performance-temporelle?jours=7  [AdminGuard] → Performance sur période
GET    /api/metriques/overview                        [AdminGuard] → Tout en une requête
GET    /metrics/webhook                               [AdminGuard] → Métriques webhooks
GET    /stats                                         [AdminGuard] → Stats globales (counts)
```

#### Webhooks (entrants Whapi & Meta)
```
POST   /webhooks/whapi                      [HMAC signature] → Webhook Whapi (messages + statuts)
GET    /webhooks/whatsapp?hub.mode=...      [Public]         → Vérification webhook Meta
POST   /webhooks/whatsapp                   [HMAC SHA256]    → Webhook Meta (messages + statuts)
```

### 2.4 Migrations (19 fichiers)

```
add_dispatch_settings
add_dispatch_settings_audit
add_pending_message_payload
add_poste_queue_enabled
remove_pending_messages
add_multitenant_columns
add_perf_indexes
backfill_tenant_id
create_channels_mapping           → Table ProviderChannel
create_webhook_event_log
drop_global_uniques
sql_gates_validation
add_error_fields_to_message
expand_whapi_channel_token
create_call_log
add_auto_message_settings
create_auto_message_scope_config
fix_channel_fk_on_delete_set_null
```

### 2.5 CRON Jobs

| Job | Fréquence | Action |
|-----|-----------|--------|
| FirstResponseTimeoutJob | Toutes les 5 min | Si `first_response_deadline_at` dépassé → réinjecter chat en queue |
| ReadOnlyEnforcementJob | Toutes les 10 min | Si `auto_message_step >= max_steps` → `chat.read_only = true` |
| OfflineReinjectionJob | Configurable (`offline_reinject_cron`) | Réinjecter chats non répondus des postes hors ligne |

---

## 3. FRONTEND COMMERCIAUX

### 3.1 Structure (`front/src/`)

```
app/
├── layout.tsx
├── page.tsx                    → Redirect vers /whatsapp
└── whatsapp/
    ├── page.tsx                → Page principale chat
    └── components/
        ├── ChatSidebar.tsx     → Liste des chats (avec unread_count)
        ├── ChatWindow.tsx      → Fenêtre de conversation
        ├── MessageList.tsx     → Affichage messages
        └── MessageInput.tsx    → Saisie texte + upload média + emoji + quoted reply
components/
├── WebSocketEvents.tsx         → Listeners Socket.io
└── EmojiPicker.tsx
contexts/
├── AuthProvider.tsx            → Gestion état auth commercial (JWT cookie)
└── SocketProvider.tsx          → Contexte Socket.io
lib/
├── api.ts                      → Client Axios (credentials: include)
├── dateUtils.ts                → Formatage dates FR
├── contactApi.ts
└── logger.ts
store/
├── chatStore.ts                → Zustand: chats + messages
├── contactStore.ts             → Zustand: contacts
└── stats.store.ts              → Zustand: stats
types/
└── chat.ts                     → Types TypeScript
```

### 3.2 Fonctionnalités clés

- Auth JWT cookie → POST /auth/login
- Liste chats temps réel (Socket.io event: `chat-message`)
- Envoi texte → POST /messages
- Upload média → POST /messages/media (multipart)
- Réponse à un message (quoted reply)
- Indicateur de statut (SENT/DELIVERED/READ/PLAYED)
- Emoji picker
- Formatage dates FR (dateUtils.ts)

### 3.3 Événements WebSocket (Socket.io client)

| Événement | Sens | Description |
|-----------|------|-------------|
| `chat-message` | Serveur → Client | Nouveau message en temps réel |
| `typing` | Serveur → Client | Indicateur de frappe |
| `message-status-update` | Serveur → Client | Mise à jour statut message |
| `queue-update` | Serveur → Client | Changement position queue |

### 3.4 Dépendances principales

```json
next: 16.1.1, react: 19.2.3, zustand: ^5.0.10,
socket.io-client: ^4.8.3, axios: ^1.13.2,
lucide-react: ^0.562.0, emoji-mart: ^5.6.0,
tailwindcss: ^4, geist: ^1.5.1
```

---

## 4. PANEL ADMIN

### 4.1 Pages (ViewMode)

| Vue | Description |
|-----|-------------|
| `overview` | Dashboard — métriques globales |
| `commerciaux` | CRUD agents commerciaux |
| `performance` | Métriques agents |
| `analytics` | Analytique |
| `messages` | Consultation messages (lecture seule) |
| `clients` | CRUD contacts clients |
| `rapports` | Rapports |
| `postes` | CRUD postes de travail |
| `canaux` | CRUD canaux Whapi/Meta |
| `automessages` | CRUD messages automatiques |
| `conversations` | Liste chats |
| `queue` | File d'attente + assignation |
| `dispatch` | Paramètres dispatch (CRUD + audit) |
| `observabilite` | Métriques santé (webhook metrics) |
| `go_no_go` | Checks de readiness avant déploiement |

### 4.2 Types principaux (definitions.ts)

```typescript
Commercial, Poste, Channel, WhatsappChat, WhatsappMessage,
Contact, QueuePosition, DispatchSnapshot, DispatchSettings,
DispatchSettingsAudit, MetriquesGlobales, PerformanceCommercial,
StatutChannel, PerformanceTemporelle
```

### 4.3 Dépendances principales

```json
next: 16.1.6, react: 19.2.3, socket.io-client: ^4.8.1,
lucide-react: ^0.563.0, recharts: ^3.7.0, tailwindcss: ^4, geist: ^1.7.0
```

---

## 5. FLUX DE DONNÉES

### 5.1 Message entrant (Webhook → DB → WebSocket)

```
Client envoie message WhatsApp
        ↓
Whapi/Meta → POST /webhooks/whapi ou /whatsapp
        ↓
Validation HMAC signature + Rate limit + Idempotency + Circuit breaker
        ↓
WhapiService.handleIncomingMessage() ou handleMetaWebhook()
  ├─ Parse payload (chat_id, from, text, media, timestamp)
  ├─ Create/Update WhatsappChat
  ├─ Create WhatsappMessage (direction: IN, status: DELIVERED)
  ├─ Si média: fetch URL + persist WhatsappMedia
  │
  ├─ AutoMessageOrchestrator.processChat()
  │    ├─ Load MessageAuto rules selon scope (poste/canal)
  │    ├─ Wait random delay (min/max seconds)
  │    └─ Send auto-message via OutboundRouter
  │
  └─ DispatcherService.dispatchChat()
       ├─ Find best poste (minimal load FIFO)
       ├─ Set chat.assigned_at, assigned_mode, first_response_deadline_at
       └─ WebSocket broadcast (new message + queue update)
```

### 5.2 Message sortant (Admin/Commercial → Whapi/Meta)

```
Admin: POST /messages [AdminGuard]
Commercial: POST /messages/media [JwtGuard]
        ↓
WhatsappMessageService.createAgentMessage() ou createAgentMediaMessage()
  ├─ Resolve channel (via chat.last_msg_client_channel_id ou chat.channel_id)
  ├─ OutboundRouterService.route() → Whapi OU Meta selon channel.provider
  │
  ├─ Si Whapi: CommunicationWhapiService.sendToWhapiChannel()
  │    → POST gate.whapi.cloud/messages/text (token Bearer)
  │    → Pour médias: base64 data URI dans JSON
  │
  ├─ Si Meta: CommunicationMetaService.sendToMeta()
  │    → Pour médias: FormData multipart upload → media_id → send message
  │    → POST graph.instagram.com/{API_VERSION}/messages
  │
  ├─ Persist WhatsappMessage (direction: OUT, status: SENT)
  ├─ Persist WhatsappMedia si média
  └─ WebSocket broadcast (message sortant)
```

### 5.3 Dispatch & Queue

```
Chat nouveau (webhook entrant) → status: EN_ATTENTE
        ↓
DispatcherService.dispatchChat()
  ├─ QueueService: get FIFO ou weighted positions
  ├─ async-mutex pour éviter race conditions
  ├─ Assign to poste minimal load
  └─ Set chat: assigned_at, assigned_mode, first_response_deadline_at, poste_id
        ↓
CRON: FirstResponseTimeoutJob (toutes les 5 min)
  └─ Si deadline dépassé → réinjecter en queue

CRON: ReadOnlyEnforcementJob (toutes les 10 min)
  └─ Si auto_message_step >= max_steps → chat.read_only = true

Admin: peut manuellement reset, bloquer/débloquer postes
```

### 5.4 Mise à jour statuts

```
Whapi/Meta → Webhook (event type: status)
        ↓
WhapiService.updateStatusMessage()
  ├─ Find WhatsappMessage by provider_message_id
  ├─ Update status: SENT → DELIVERED → READ → PLAYED
  └─ WebSocket broadcast status update
```

---

## 6. VARIABLES D'ENVIRONNEMENT

### Backend (message_whatsapp/.env)

```env
NODE_ENV=production

# Base de données
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=whatsappflow

# Serveur
SERVER_PORT=3002
SERVER_PUBLIC_HOST=https://your-domain.com
WS_PORT=3005
CORS_ORIGINS=http://votre-ip:3000,http://votre-ip:3001

# Whapi
WHAPI_TOKEN=
WHAPI_URL=https://gate.whapi.cloud/
WHATSAPP_NUMBER=
WHAPI_WEBHOOK_SECRET_HEADER=x-whapi-signature
WHAPI_WEBHOOK_SECRET_VALUE=
WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS=

# Meta WhatsApp Business API
META_API_VERSION=v22.0
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_APP_SECRET_PREVIOUS=

# JWT
JWT_SECRET=                          # min 32 caractères

# Compte Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=                      # min 12 caractères en production
ADMIN_NAME=Admin

# CRON
REDISPATCH_CRON=*/30 * * * * *

# Feature flags
FF_UNIFIED_WEBHOOK_ROUTER=true
FF_SHADOW_UNIFIED=true
FF_UNIFIED_WHAPI_PCT=100
```

### Frontend (front/.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3002
NEXT_PUBLIC_SOCKET_URL=http://localhost:3002
```

### Admin (admin/.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3002
```

---

## 7. SÉCURITÉ

### 7.1 Authentification

| Acteur | Méthode | Durée | Transport |
|--------|---------|-------|-----------|
| Commercial | JWT | 3600s (1h) | HTTP-only cookie |
| Admin | JWT + refresh token | configurable | HTTP-only cookie |

- Mots de passe: bcrypt salt rounds 10
- Soft delete: champ `deletedAt` (jamais de hard delete)

### 7.2 Guards

```typescript
AdminGuard          → Vérifie JWT cookie + isAdmin: true
AuthGuard('jwt')    → Vérifie JWT Bearer header + extraction user
```

### 7.3 Sécurité Webhooks

| Mécanisme | Description |
|-----------|-------------|
| HMAC signature | Header configurable + value SHA256 (Whapi) ou x-hub-signature-256 (Meta) |
| Rotation secrets | Support `*_PREVIOUS` pour zero-downtime rotation |
| Rate limiting | Per IP + tenant, avec seuil configurable |
| Circuit breaker | Auto-désactivation sur échecs répétés |
| Idempotency | Déduplication par webhook ID (évite double traitement) |
| Payload size | Limite 1MB |

### 7.4 Données sensibles

- JWT secrets dans `.env` (non commité)
- Tokens Whapi dans `channel.token` (stocker chiffré recommandé)
- Secrets webhook avec rotation sans downtime

---

## 8. PERFORMANCE & SCALABILITÉ

### 8.1 Index DB

```sql
IDX_whatsapp_message_tenant_id
UQ_whatsapp_message_tenant_provider_msg_direction    ← Déduplication idempotency
IDX_whatsapp_chat_tenant_id
UQ_whatsapp_chat_tenant_chat_id
UQ_whapi_channel_id
UQ_whapi_channels_provider_external_id
```

### 8.2 Concurrence

- **async-mutex:** Locks dans DispatcherService (prévenir race conditions assignation)
- **Transactions TypeORM:** Opérations multi-étapes atomiques

### 8.3 Temps réel

- Socket.io rooms: par chat (message updates), queue room (admin)
- Broadcast ciblé (pas de fan-out global)

### 8.4 Traitement webhooks

- Degraded queue: si surcharge, webhooks traités en file async
- Idempotency tracker: pas de double insertion DB

### 8.5 Multi-tenancy

- Colonne `tenant_id` présente dans les entités clés (design pour futur scaling)

---

## 9. ÉTAT PRODUCTION

### 9.1 Tests

| Partie | Nb tests | Couverture estimée |
|--------|----------|-------------------|
| Backend | 45 .spec.ts | ~70% services, ~90% controllers |
| Frontend (front) | 0 | — |
| Admin | 0 | — |

### 9.2 Points à régler avant déploiement

- [ ] **console.log actifs** dans :
  - `communication_meta.service.ts` (ligne ~50)
  - `outbound-router.service.ts` (ligne ~30)
  - `whapi.controller.ts` (4 lignes)
  - `whatsapp_poste.controller.ts` (ligne ~20)
- [ ] Dépendance inutilisée : `@casl/ability` → `npm uninstall @casl/ability`
- [ ] Vérifier que les `.env` ne sont PAS commités (doivent être dans `.gitignore`)
- [ ] `npm run build` sans erreurs TypeScript
- [ ] `npm run migration:run` sur la DB de production
- [ ] HTTPS configuré côté reverse proxy
- [ ] Variables d'environnement injectées (pas de `.env` files en prod)

### 9.3 Migrations

Commande: `npm run migration:run` depuis `message_whatsapp/`

---

## 10. POINTS CRITIQUES & RISQUES

| # | Criticité | Sujet | Détail |
|---|-----------|-------|--------|
| 1 | 🔴 Critique | console.log en prod | 4 fichiers avec logs actifs → fuite données, perf |
| 2 | 🔴 Critique | HTTPS | Meta API exige HTTPS pour webhooks en production |
| 3 | 🟡 Moyen | 0 tests frontend | Risque de régressions UI non détectées |
| 4 | 🟡 Moyen | Tokens Whapi en clair | `channel.token` stocké en TEXT non chiffré |
| 5 | 🟡 Moyen | `@casl/ability` inutilisé | +500KB bundle inutile |
| 6 | 🟢 Faible | Multi-tenancy partiel | `tenant_id` présent mais pas encore enforced |
| 7 | 🟢 Faible | Admin n'envoie pas de médias | Voulu — guard commercial intentionnel |
| 8 | 🟢 Faible | `ApiConversation` interface non importée | Interface orpheline dans `interface/` |

---

## RÉSUMÉ TECHNIQUE

| Aspect | Détail |
|--------|--------|
| Backend | NestJS 11 + TypeORM 0.3 + MySQL |
| Frontend | Next.js 16 + React 19 + Zustand + Socket.io |
| Admin | Next.js 16 + React 19 + Recharts |
| Auth | JWT (commerciaux 3600s, admins avec refresh) |
| Webhooks | Whapi + Meta (HMAC SHA256 signés) |
| Messages | Texte + médias (image/video/audio/document) |
| Queue | FIFO + weighted assignment + CRON timeout jobs |
| Auto-messages | Delay aléatoire + scope config + max steps |
| Temps réel | Socket.io (messages, statuts, queue) |
| Localisation | FR-FR (dates toujours françaises) |
| Persistance | MySQL (19 migrations + soft delete partout) |
| Conteneurs | Docker Compose (backend + MySQL) |
| Tests backend | 45 spec.ts (~70-90% couverture) |
| Tests frontend | 0 (à créer) |
