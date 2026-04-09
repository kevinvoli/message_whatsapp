# BILAN COMPLET DU CODE — Projet WhatsApp Multi-Tenant

> Généré le 2026-04-09 — Analyse statique exhaustive de l'ensemble du codebase.

---

## TABLE DES MATIÈRES

1. [Architecture & Organisation](#1-architecture--organisation)
2. [Dépendances circulaires (forwardRef)](#2-dépendances-circulaires-forwardref)
3. [Qualité du code backend](#3-qualité-du-code-backend)
4. [Qualité du code frontend / admin](#4-qualité-du-code-frontend--admin)
5. [Flux de données & Pertinence des données retournées](#5-flux-de-données--pertinence-des-données-retournées)
6. [Sécurité & Guards](#6-sécurité--guards)
7. [Performance](#7-performance)
8. [Tests](#8-tests)
9. [Dette technique & TODOs](#9-dette-technique--todos)
10. [Résumé des priorités de refactoring](#10-résumé-des-priorités-de-refactoring)

---

## 1. Architecture & Organisation

### Backend NestJS (`message_whatsapp/src/`)

✅ **Bien fait**

- Structure modulaire NestJS respectée avec séparation claire par domaine métier : `channel`, `dispatcher`, `whatsapp_chat`, `whatsapp_message`, `metriques`, `notification`, `system-alert`, `webhooks`, `jorbs`, `message-auto`, `contact`, `auth`, `auth_admin`.
- Pattern Adapter pour les webhooks multi-providers (`webhooks/adapters/`) avec `ProviderAdapterRegistry`, `whapi.adapter.ts`, `meta.adapter.ts`, `messenger.adapter.ts`, `instagram.adapter.ts`, `telegram.adapter.ts` — séparation propre des concerns, très bonne conception.
- Normalisation des messages entrants via `UnifiedMessage` et `UnifiedStatus` (`webhooks/normalization/`) — traitement uniforme quel que soit le provider.
- Validation des variables d'environnement dans `app.module.ts` (lignes 52-88) avec Joi, incluant des validations conditionnelles selon `NODE_ENV` — exemplaire.
- `ValidationPipe` global dans `main.ts` (lignes 23-30) avec `whitelist`, `forbidNonWhitelisted`, et `transform` — protège correctement les inputs.

❌ **Problématique**

- **Gateway monolithique** : `whatsapp_message.gateway.ts` fait **1423 lignes**. Ce fichier gère les connexions WebSocket, les conversations, les messages, les contacts, les call logs, le typing, le queue update, la recherche — tout mélangé. Devrait être découpé en sous-handlers thématiques.
- **Service monolithique** : `whatsapp_message.service.ts` fait **1114 lignes** avec des responsabilités mélangées : création de messages agents, gestion de médias, requêtes de lecture, déduplication, mise à jour de statuts.
- **`channel.service.ts` (576 lignes)** : La méthode `create()` contient une énorme duplication pour chaque provider (messenger, instagram, meta, telegram, whapi) avec des blocs quasi-identiques de 50+ lignes. Le pattern Strategy serait plus adapté.
- **`TasksService` est un fichier mort** (`jorbs/tasks.service.ts`) : tout le code est commenté (lignes 7-27), mais le service est toujours déclaré comme provider dans `app.module.ts` (ligne 119).
- **`AppModule` importe directement des entités** (`app.module.ts` lignes 44-49) via `TypeOrmModule.forFeature` — ce n'est pas la responsabilité du module racine.

⚠️ **À améliorer**

- Le contrôleur `whapi.controller.ts` gère tous les providers dans un seul fichier. Un contrôleur par provider serait plus maintenable.
- `communication_whapi/` contient des services pour tous les providers (`communication_meta.service.ts`, etc.) mais le dossier garde le nom "whapi" — renommage nécessaire pour cohérence.

---

### Frontend (`front/src/`) et Admin (`admin/src/`)

✅ **Bien fait**

- Organisation claire : `components/`, `contexts/`, `store/`, `lib/`, `types/` dans le front.
- Le panel admin a une bonne séparation `ui/` (composants de vue) et `lib/` (API, utilitaires).
- Zustand pour le state management frontend — choix pertinent, bien implémenté dans `chatStore.ts`.

❌ **Problématique**

- **Composants admin trop gros** :

| Fichier | Lignes |
|---|---|
| `admin/ui/MessageAutoView.tsx` | 946 |
| `admin/ui/ConversationsView.tsx` | 884 |
| `admin/ui/ChannelsView.tsx` | 824 |
| `admin/ui/CommerciauxView.tsx` | 713 |
| `admin/ui/OverviewView.tsx` | 687 |
| `admin/ui/DispatchView.tsx` | 642 |
| `admin/ui/SettingsView.tsx` | 560 |
| `admin/ui/PostesView.tsx` | 504 |
| `front/contacts/ContactDetailView.tsx` | 671 |
| `front/contacts/page.tsx` | 502 |
| `front/chat/ChatInput.tsx` | 449 |

---

## 2. Dépendances circulaires (forwardRef)

**Nombre total : 9 occurrences de `forwardRef`**

| Module source | Module cible | Justifié ? |
|---|---|---|
| `JorbsModule` | `MessageAutoModule` | ✅ Oui — crons déclenchent auto-messages |
| `JorbsModule` | `WhatsappMessageModule` | ✅ Oui — crons envoient des messages |
| `DispatcherModule` | `WhatsappMessageModule` | ⚠️ Partiel — dispatcher injecte `WhatsappMessageGateway` pour émettre des events socket |
| `DispatcherService` | `WhatsappMessageGateway` | ❌ Non — le dispatcher ne devrait pas connaître le gateway directement. Pattern EventEmitter recommandé |
| `MessageAutoModule` | `WhatsappMessageModule` | ✅ Oui — auto-messages doivent envoyer via le service message |
| `MessageAutoModule` | `JorbsModule` | ⚠️ Partiel — pourrait être inversé |
| `message-auto.service.ts` | `WhatsappMessageGateway` | ❌ Non — même problème que le dispatcher |
| `auto-message-orchestrator.service.ts` | `WhatsappMessageGateway` | ❌ Non — même pattern |
| `ContactModule` | `WhatsappMessageModule` | ✅ Oui — contacts liés aux messages |

**Verdict** : 3 `forwardRef` sont injustifiés et liés au fait que `WhatsappMessageGateway` est un God Object injecté partout. Adopter le pattern `EventEmitter2` (NestJS built-in) pour les notifications vers le gateway résoudrait ces cycles proprement.

---

## 3. Qualité du code backend

### Entités TypeORM

✅ **Bien fait**

- Indexes bien pensés et documentés sur `WhatsappChat` et `WhatsappMessage` : `IDX_chat_poste_activity`, `IDX_msg_response_time`, `IDX_msg_commercial_dir_time`, etc.
- Index unique composé `UQ_whatsapp_message_tenant_provider_msg_direction` protège la déduplication multi-tenant.
- Soft-delete via `@DeleteDateColumn` en place partout.
- Architecture élaborée des auto-messages dans `WhatsappChat` (triggers A-I) avec colonnes dédiées par trigger.

❌ **Problématique**

- **Typo dans le nom de relation** : `messageCnntent` au lieu de `messageContent` (`whatsapp_message.entity.ts` ligne 164).
- **Commentaires obsolètes "trajet"** : `comment: 'Primary key - Unique trajet identifier'` et `'Timestamp when the trajet was created'` — copie-colle d'un autre projet visible dans `whatsapp_chat.entity.ts` (lignes 42, 305, 314) et `whatsapp_message.entity.ts` (lignes 62, 263, 272).
- `last_activity_at` dans `WhatsappChat` (ligne 188) est déclaré `nullable: true` en BDD mais le type TypeScript est `Date` (non nullable) — incohérence type/BDD.
- **Pas d'index sur `channel_id`** dans `WhatsappChat`, malgré les requêtes fréquentes par channel (`getDedicatedPosteId`, `getStatutChannels`).

⚠️ **À améliorer**

- L'entité `WhatsappChat` a **37 colonnes** dont beaucoup liées aux auto-messages. Envisager une table dédiée `chat_auto_message_state`.
- Les colonnes `chat_pic` et `chat_pic_full` ont un default `'default.png'` et `nullable: false` mais ne semblent jamais remplies avec de vraies valeurs métier.

---

### Services — Requêtes et Performance

✅ **Bien fait**

- `MetriquesService` utilise `Promise.all()` pour paralléliser les requêtes indépendantes (lignes 111-119).
- Les requêtes annotées avec des commentaires avant/après optimisation — bonne documentation de l'intention.
- `findLastMessagesBulk` et `countUnreadMessagesBulk` dans `whatsapp_message.service.ts` évitent les N+1 classiques.
- Utilisation de `ROW_NUMBER()` dans `findRecentByChatIds` — optimisation pertinente pour MySQL 8+.

❌ **Problématique**

- **`recomputeUnreadCount`** dans `whatsapp_chat.service.ts` (ligne 191) utilise `$1` comme placeholder — **syntaxe PostgreSQL** au lieu de `?` (syntaxe MySQL). **Bug actif** si cette méthode est appelée.
- **`findOne` dans `WhatsappChatService`** (ligne 389) charge la relation `messages` complète via `leftJoinAndSelect('chat.messages', 'messages')` — peut charger des milliers de messages en RAM pour une seule conversation.
- **`getDispatchSnapshot`** dans `dispatcher.service.ts` (ligne 646) exécute 3 requêtes séparées qui pourraient être fusionnées.
- **`WHAPI_TOKEN`** dans `WhatsappMessageService` (ligne 29) est lu depuis `process.env` au moment de l'instanciation — non injectable, non testable, potentiellement `undefined`.

---

### Gestion d'erreurs

❌ **Problématique**

- **`findLastMessageBychat_id`** (ligne 451-464) : `throw new NotFoundException(new Error(error))` — on passe un objet `Error` au constructeur de `NotFoundException` au lieu d'un message string. L'erreur sera mal sérialisée en JSON.
- **`countUnreadMessages`** (ligne 635-653) : même anti-pattern `throw new NotFoundException(new Error(error))`.
- **`createInternalMessage`** (ligne 655) accepte `message: any` — aucun typage des inputs pour une méthode critique.
- Import `ExceptionsHandler` dans `whatsapp_message.service.ts` (ligne 19) — jamais utilisé.
- Import `last` from `rxjs` dans `whatsapp_message.gateway.ts` (ligne 31) — jamais utilisé.

---

### Transactions manquantes

❌ **Problématique**

- **`assignConversationInternal`** dans `dispatcher.service.ts` : `chatRepository.save()` suivi de `emitConversationUpsertByChatId()` sans transaction. Si l'émission échoue, la BDD est inconsistante avec le socket.
- **`createAgentMessage`** dans `whatsapp_message.service.ts` : envoi externe → save message → update chat — sans transaction. Crash entre les étapes 2 et 3 = message sauvé mais chat non mis à jour.
- **`createAgentMediaMessage`** : même problème, 4 étapes (envoi → save message → save media → update chat) sans transaction.

✅ Seul `queue.service.ts` utilise correctement les transactions via `queryRunner` (lignes 122-156).

---

### Code mort et console.log

❌ **Problématique**

- **3 `console.log` actifs** dans `whapi.controller.ts` (lignes 190, 194, 197) dans le handler de vérification webhook Meta — code de debug en production.
- **12 `console.log` commentés** dans le backend non supprimés.
- **Code commenté non supprimé** : fallback de message en échec dans `createAgentMessage` (lignes 232-244).
- **`@BeforeInsert` commenté** dans `whatsapp_message.entity.ts` (lignes 286-291).

---

## 4. Qualité du code frontend / admin

### Types `any`

❌ **Problématique**

- `WebSocketEvents.tsx` lignes 64 et 235 : `payload: any` dans les handlers socket — perte totale de typage pour le cœur du data flow.
- `WebSocketEvents.tsx` lignes 278, 283 : `call_logs: any[]` et `call_log: any`.
- Le fichier `types/chat.ts` du front (663+ lignes) mélange types métier et fonctions helper (couleurs, labels) — séparation à faire.

---

### useEffect et deps

❌ **Problématique**

- `SocketProvider.tsx` (ligne 53) : `// eslint-disable-next-line react-hooks/exhaustive-deps` — suppression manuelle du warning. La dépendance `socket` est exclue, ce qui peut causer des fuites de connexion si le socket change sans que le cleanup s'exécute.

✅ **Bien fait**

- `WebSocketEvents.tsx` a un cleanup propre dans le `return` du `useEffect` (lignes 313-322) avec désinscription de tous les listeners.
- `OverviewView.tsx` utilise `useCallback` + `useEffect` avec la dépendance `fetchData` correctement chaînée.

---

### Duplication front / admin

❌ **Problématique**

- `dateUtils.ts` est **100% dupliqué** entre `front/src/lib/dateUtils.ts` (85 lignes) et `admin/src/app/lib/dateUtils.ts` (93 lignes) — fonctions identiques mot pour mot. Un package partagé (`packages/shared/`) ou un monorepo Turborepo/Nx résoudrait cela proprement.
- Les types `definitions.ts` dans admin et `types/chat.ts` dans front définissent des structures similaires mais différentes pour les mêmes entités (`WhatsappChat`, `WhatsappMessage`) — pas de package partagé.

---

### Faux pourcentages de variation

❌ **Problématique critique (UX)**

- `OverviewView.tsx` ligne 102-104 : `getVariation(valeur: number)` retourne `Math.floor(Math.random() * 30) - 10` — **les pourcentages de variation affichés dans le dashboard sont aléatoires et faux**. C'est un placeholder jamais remplacé par de vraies données historiques.

---

## 5. Flux de données & Pertinence des données retournées

### Données surchargées

❌ **Problématique**

- `WhatsappChatService.findOne()` (ligne 389) charge `messages` en eager via `leftJoinAndSelect` — retourne TOUTES les messages d'une conversation. Utilisé depuis `ConversationsView` admin où l'on affiche seulement les métadonnées.
- L'endpoint `findAll` du chat service retourne `data + total + totalAll + totalActifs + totalEnAttente + totalUnread + totalFermes` — 7 compteurs calculés à chaque appel même si le front n'en utilise qu'une partie.
- `sendConversationsToClient` dans le gateway charge 300 conversations avec `lastMessage`, `unreadCount`, et `contactMap` en 3 requêtes bulk — correct au niveau pattern mais 300 conversations d'un coup peut être lourd sur des volumes importants.

---

### Cohérence DTO backend ↔ types TypeScript frontend

✅ **Bien fait**

- Les types `admin/lib/definitions.ts` correspondent globalement bien aux DTOs backend (`MetriquesGlobales`, `PerformanceCommercial`, `StatutChannel`, etc.).
- `definitions.ts` sert de source unique de types pour tout le panel admin.

❌ **Problématique**

- Le type `Commercial` dans `admin/definitions.ts` a des champs comme `avatar`, `region`, `messagesEnvoyes` qui ne viennent pas de l'API backend — vestiges d'un mock jamais nettoyé.
- `WhatsappChat` dans `definitions.ts` a `unreadCount?: number` ET `unread_count: number` — double représentation du même champ avec deux conventions de nommage différentes.

---

## 6. Sécurité & Guards

### Ce qui est en place

✅ **Bien fait**

- Séparation auth commercial / admin : deux stratégies JWT distinctes (`jwt` et `jwt-admin`) avec guards dédiées.
- Tous les controllers admin protégés par `@UseGuards(AdminGuard)`.
- JWT via cookies HTTP-only — les tokens ne sont pas exposés dans localStorage.
- CORS configurable via `CORS_ORIGINS` env var avec validation Joi stricte dans `main.ts`.
- Auth WebSocket : vérification JWT dans `handleConnection` avec déconnexion si invalide.
- Rate limiting WebSocket via `SocketThrottleGuard`.
- HMAC/signature verification pour les webhooks — architecture en place.

### Failles identifiées

❌ **Problématique critique**

- **Vérification HMAC Whapi commentée** : `whapi.controller.ts` ligne 57 — `// this.assertWhapiSecret(headers, request.rawBody, payload);` est commenté. Les webhooks Whapi ne sont **pas vérifiés cryptographiquement**. N'importe qui connaissant l'URL peut envoyer de faux webhooks. **Faille de sécurité majeure**.
- **WebSocket CORS : `origin: '*'`** dans le gateway (ligne 49) — accepte les connexions de n'importe quelle origine. Devrait être restreint aux mêmes origines que le CORS HTTP.
- **Access token TTL : 7 jours** dans `auth.service.ts` (ligne 14) — excessif pour un access token. Le refresh token est également à `'7d'`, ce qui annule l'intérêt d'un mécanisme de refresh. Recommandé : access token 15-30 min, refresh token 7j.
- **Routes proxy média non protégées** : `media/meta/:mediaId` et `media/whapi/:whapiMediaId` dans `WhatsappMessageController` ne semblent pas avoir de guard — vérifier l'accès.

---

## 7. Performance

### Requêtes SQL

✅ **Bien fait**

- `MetriquesService` utilise des agrégations conditionnelles (`SUM(CASE WHEN...)`) pour fusionner plusieurs COUNT en une seule passe.
- Jointure temps de réponse avec filtre `INTERVAL 1 HOUR` dans la clause ON — laisse MySQL utiliser l'index dès le join.
- Index déclarés directement sur les entités via décorateurs TypeORM.
- `getStatutChannels` utilise des sous-requêtes scalaires pour éviter la multiplication de lignes d'un double LEFT JOIN.

⚠️ **À surveiller**

- `getStatutChannels` avec sous-requêtes corrélées — acceptable pour un faible nombre de canaux, mais à monitorer si le nombre de channels dépasse la centaine.
- `findAll` dans `WhatsappChatService` peut faire jusqu'à 4 allers-retours DB (données paginées, unread bulk, last messages bulk, stats globales).

---

### Crons

✅ **Bien fait**

- Architecture centralisée via `CronConfigService` avec configs en BDD — permet de modifier les intervalles sans redémarrage.
- Chaque trigger dans `AutoMessageMasterJob` est isolé par `safeRun` avec try/catch individuel (lignes 81-88) — un trigger en échec ne bloque pas les autres.
- Protection plage horaire sur le SLA checker et le master job (5h-21h).

❌ **Problématique**

- **Risque de chevauchement multi-instance** : `CronConfigService` n'a pas de mécanisme de lock distribué. Si l'application est déployée en multi-instance (PM2, K8s), chaque instance exécuterait les mêmes crons en parallèle — doublons de messages auto, de notifications, etc.
- **`stopAgentSlaMonitor`** dans `first-response-timeout.job.ts` (ligne 75) est un no-op — juste un log debug. Le nom suggère qu'il devrait arrêter quelque chose.

---

### WebSocket

✅ **Bien fait**

- Vérification si d'autres sockets du même poste sont connectés avant de désactiver le poste — évite les faux offline.
- Remplissage automatique de la queue en mode offline si vide après déconnexion.
- Rate limiting par client via `SocketThrottleGuard`.
- Reconnexion exponentielle côté frontend avec banner `ReconnectingBanner`.

❌ **Problématique**

- **Fuite potentielle du `chatDispatchLocks` Map** dans `dispatcher.service.ts` : les Mutex sont créés par `chat_id` mais ne sont supprimés que si `!lock.isLocked()` dans le finally. En cas d'erreur persistante, le mutex reste dans la Map indéfiniment.
- **`chatMutexes` Map** dans `inbound-message.service.ts` : même problème — pas de purge périodique.
- `pendingAgentMessages` et `recentTempIds` Maps dans le gateway : purgées uniquement par timeout individuel, pas de nettoyage global périodique.

---

### Cache

✅ **Bien fait**

- `AnalyticsSnapshotService` implémente un cache TTL pour les métriques lourdes calculées par cron.
- `OverviewView.tsx` charge les sections progressivement via `Promise.allSettled` — dégradation gracieuse si une section échoue.

⚠️ **À améliorer**

- Pas de cache côté frontend sur les données peu volatiles (liste des canaux, postes, commerciaux) — chaque refresh du panel admin re-fetche tout.

---

## 8. Tests

### Couverture

**Modules avec tests (25 fichiers spec) :**

| Module | Fichiers testés |
|---|---|
| `channel` | `channel.service.spec.ts` |
| `communication_whapi` | `controller.spec.ts`, `service.spec.ts` |
| `contact` | `controller.spec.ts`, `service.spec.ts` |
| `dispatcher` | `controller.spec.ts`, `service.spec.ts`, `queue.service.spec.ts` |
| `jorbs` | `auto-message-master.job.spec.ts` |
| `message-auto` | `controller.spec.ts`, `service.spec.ts`, `business-hours.service.spec.ts` |
| `metriques` | `controller.spec.ts`, `service.spec.ts` |
| `webhooks/adapters` | `meta.adapter.spec.ts`, `whapi.adapter.spec.ts`, `provider-adapter.registry.spec.ts` |
| `webhooks/idempotency` | `webhook-idempotency.service.spec.ts` |
| `whapi` | `controller.spec.ts`, `service.spec.ts`, `whapi-crypto.spec.ts`, `whapi-payload-validation.spec.ts`, `webhook-rate-limit.service.spec.ts`, `webhook-idempotency-purge.service.spec.ts` |
| `whatsapp_button` | `gateway.spec.ts`, `service.spec.ts` |
| `whatsapp_chat` | `gateway.spec.ts`, `service.spec.ts` |

**Modules sans tests :**

- ❌ `whatsapp_message` — service **et** gateway (le module le plus critique du système)
- ❌ `notification`
- ❌ `system-alert`
- ❌ `system-config`
- ❌ `auth` / `auth_admin`
- ❌ `admin` (backend admin service)
- ❌ `whatsapp_commercial`, `whatsapp_customer`, `whatsapp_media`, `whatsapp_last_message`
- ❌ `call-log`, `logging`
- ❌ **Aucun test** dans les frontends `front/` et `admin/`

❌ **Problématique critique**

- `whatsapp_message.service.ts` (1114 lignes) et `whatsapp_message.gateway.ts` (1423 lignes) sont **100% non testés**. C'est le cœur du système — envoi, réception, routage de messages.
- Aucun test E2E sur l'ensemble du projet.

---

## 9. Dette technique & TODOs

### TODOs restants dans le code

| Fichier | Ligne | Contenu |
|---|---|---|
| `front/src/app/contacts/page.tsx` | 403 | `// TODO: émettre socket pour archiver le contact` |
| `admin/src/app/lib/utils.ts` | 91 | `// TODO: Implémenter avec les vraies données historiques` |

### Patterns inconsistants

- **Nommage snake_case vs camelCase** : les méthodes mélangent `findBychat_id`, `findByExternalId`, `markChatAsRead`. Les colonnes BDD sont en snake_case (`chat_id`, `poste_id`) mais les propriétés TypeScript utilisent camelCase (`createdAt`, `updatedAt`). Convention correcte mais appliquée de façon inégale.
- **Typo dans le nom de méthode** : `jobRunnertcheque` dans `dispatcher.service.ts` (ligne 495) — faute de frappe ("tcheque" au lieu de "check").
- **Nommage fichier incohérent** : `user.entity.ts` dans `whatsapp_commercial/entities/` au lieu de `whatsapp_commercial.entity.ts`.
- **Imports inutilisés** : `ExceptionsHandler` dans `whatsapp_message.service.ts`, `last` de `rxjs` dans le gateway, `json` de `stream/consumers` dans `whapi.controller.ts`.
- **Emoji dans les logs** : utilisation intensive de `📩`, `🆕`, `🔁`, `⏳`, `🧼`, `🔥` mélangée avec des logs structurés `DISPATCH_START trace=...` — adopter un style uniforme.

### Migrations

✅ **Bien fait**

- Migrations bien nommées et chronologiques (20260213 → 20260409).
- Helpers `createIndexIfNotExists` pour l'idempotence.
- Pas de migration destructive dangereuse détectée.

---

## 10. Résumé des priorités de refactoring

### 🔴 Critique — À traiter immédiatement

| # | Action | Fichier | Impact |
|---|---|---|---|
| C1 | Réactiver la vérification HMAC Whapi | `whapi.controller.ts:57` | Sécurité |
| C2 | Corriger `recomputeUnreadCount` (`$1` → `?`) | `whatsapp_chat.service.ts:192` | Bug actif |
| C3 | Supprimer les `console.log` actifs | `whapi.controller.ts:190,194,197` | Production |
| C4 | Remplacer `getVariation()` aléatoire | `admin/ui/OverviewView.tsx:102` | UX / fiabilité |
| C5 | Restreindre `origin: '*'` WebSocket | `whatsapp_message.gateway.ts:49` | Sécurité |

### 🟠 Important — Impact qualité et maintenabilité

| # | Action | Fichier | Impact |
|---|---|---|---|
| I1 | Découper `WhatsappMessageGateway` (1423 lignes) | `whatsapp_message.gateway.ts` | Maintenabilité |
| I2 | Ajouter des transactions sur les opérations multi-étapes | `createAgentMessage`, `assignConversation` | Intégrité données |
| I3 | Éliminer la duplication dans `channel.service.ts create()` | `channel.service.ts` | DRY |
| I4 | Ajouter tests pour `whatsapp_message.service.ts` et `.gateway.ts` | — | Qualité |
| I5 | Mutualiser `dateUtils.ts` en package partagé | `front/lib/`, `admin/lib/` | DRY |
| I6 | Corriger les `throw new NotFoundException(new Error(error))` | `whatsapp_message.service.ts` | Qualité erreurs |
| I7 | Réduire TTL access token (7j → 15-30min) | `auth.service.ts:14` | Sécurité |
| I8 | Résoudre les 3 `forwardRef` injustifiés via EventEmitter2 | `dispatcher`, `message-auto` | Architecture |
| I9 | Supprimer `TasksService` mort | `jorbs/tasks.service.ts` | Nettoyage |

### 🟡 Souhaitable — Amélioration continue

| # | Action | Fichier | Impact |
|---|---|---|---|
| S1 | Extraire l'état auto-message de `WhatsappChat` (37 colonnes) | `whatsapp_chat.entity.ts` | Performance BDD |
| S2 | Découper les composants admin > 600 lignes | `MessageAutoView`, `ChannelsView`, etc. | Maintenabilité |
| S3 | Ajouter un index sur `WhatsappChat.channel_id` | migration | Performance |
| S4 | Corriger les typos : `messageCnntent`, `jobRunnertcheque`, commentaires "trajet" | divers | Lisibilité |
| S5 | Ajouter un mécanisme de lock distribué pour les crons | `cron-config.service.ts` | Multi-instance |
| S6 | Purger périodiquement les Maps de mutexes | `dispatcher.service.ts`, `inbound-message.service.ts` | Mémoire |
| S7 | Nettoyer les champs mock dans `Commercial` admin | `admin/definitions.ts` | Cohérence types |
| S8 | Typer `payload: any` dans `WebSocketEvents.tsx` | `WebSocketEvents.tsx:64,235` | TypeScript |
| S9 | Corriger `last_activity_at` nullable BDD vs type TS non-nullable | `whatsapp_chat.entity.ts:188` | Cohérence |
| S10 | Ajouter cache front sur données peu volatiles (canaux, postes) | `admin/lib/api.ts` | Performance |

---

*Fin du rapport — 20 items identifiés, classés par priorité.*
