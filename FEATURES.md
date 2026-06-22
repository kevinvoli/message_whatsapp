# Fonctionnalités de la Plateforme WhatsApp Messagerie
> Analysé le 2026-06-22

## Légende
- ✅ Complet
- 🔄 Partiel (implémenté mais incomplet)
- ❌ Non implémenté
- 🐛 Bug connu / problème identifié

---

## [1] Authentification & Sécurité

### 1.1 — Authentification commerciale (JWT)
- **État** : ✅ Complet
- **Backend** : `src/auth/auth.controller.ts` — `POST /auth/login` avec throttle 10 req/15min par IP
- **Backend** : `src/auth/auth.controller.ts` — `POST /auth/auto-login` (connexion par username sans mot de passe)
- **Backend** : `src/auth/auth.controller.ts` — `POST /auth/logout` + fermeture session
- **Backend** : `src/auth/auth.controller.ts` — `GET /auth/profile`, `GET /auth/me/stats`
- **Frontend** : `front/src/contexts/AuthProvider.tsx` — gestion état auth + cookies JWT
- **Frontend** : `front/src/app/login/page.tsx` + `front/src/components/auth/loginForm.tsx`
- **Reste à faire** : —
- **Erreurs/Bugs** : `any` sur `req.user` dans `jwt.strategy.ts:validate`
- **Optimisations** : —

### 1.2 — Authentification admin
- **État** : ✅ Complet
- **Backend** : `src/auth_admin/auth_admin.controller.ts` — endpoints séparés admin
- **Backend** : `src/auth_admin/jwt_admin.strategy.ts` — stratégie JWT admin distincte
- **Admin** : `admin/src/app/login/page.tsx`
- **Reste à faire** : —
- **Erreurs/Bugs** : `any` dans `jwt_admin.strategy.ts:validate`
- **Optimisations** : —

### 1.3 — Protection brute-force
- **État** : ✅ Complet
- **Backend** : `src/auth/auth.controller.ts:48` — `@Throttle` 10 tentatives / 15 min par IP (login), 20 / 15 min (auto-login)
- **Reste à faire** : —
- **Erreurs/Bugs** : —

### 1.4 — Restriction géographique (Geo-Access)
- **État** : ✅ Complet
- **Backend** : `src/geo-access/geo_access.controller.ts` — CRUD zones géographiques (admin)
- **Backend** : `src/auth/auth.controller.ts:56-67` — vérification position à la connexion
- **Admin** : `admin/src/app/ui/GeoAccessView.tsx`
- **Reste à faire** : —
- **Erreurs/Bugs** : Si zones configurées, les coordonnées GPS sont obligatoires côté frontend (le frontend doit toujours les envoyer)
- **Optimisations** : —

### 1.5 — RBAC (Rôles et permissions)
- **État** : ✅ Complet (backend), 🔄 Partiel (frontend — non appliqué dynamiquement sur l'UI)
- **Backend** : `src/rbac/rbac.controller.ts` — CRUD rôles + assignation par commercial
- **Admin** : `admin/src/app/modules/rbac/components/RolesView.tsx`
- **Reste à faire** : Appliquer les permissions RBAC dans l'UI front pour affichage conditionnel
- **Optimisations** : Cache Redis sur `getPermissions` (actuellement en BDD à chaque appel)

### 1.6 — Journal des connexions (Login Logs)
- **État** : ✅ Complet
- **Backend** : `src/auth/login-log.controller.ts` + `src/auth/login-log.service.ts` — enregistre IP, device, poste à chaque connexion
- **Admin** : `admin/src/app/ui/LoginLogsView.tsx`
- **Reste à faire** : —

### 1.7 — Sessions commerciales
- **État** : ✅ Complet
- **Backend** : `src/commercial-session/commercial_session.controller.ts` — ouverture/fermeture session à login/logout
- **Admin** : `admin/src/app/ui/SessionsView.tsx`
- **Reste à faire** : —

### 1.8 — Contrôle d'accès IP
- **État** : ✅ Complet (backend), 🔄 Partiel (appliqué uniquement au login, pas sur chaque requête)
- **Backend** : `src/geo-access/` — liste des zones autorisées
- **Admin** : `admin/src/app/ui/IpAccessView.tsx`
- **Reste à faire** : Middleware IP sur chaque requête API (actuellement seulement au login)

---

## [2] Messagerie & Conversations

### 2.1 — Réception de messages entrants (Webhooks)
- **État** : ✅ Complet
- **Backend** : `src/webhooks/` — normalisation Whapi + Meta + Messenger, idempotence Redis, pipeline ingress
- **Backend** : `src/ingress/` — événements de domaine pour routage vers le dispatcher
- **Backend** : Vérification signature HMAC `WHAPI_WEBHOOK_SECRET_HEADER/VALUE`
- **Reste à faire** : —
- **Erreurs/Bugs** : —
- **Optimisations** : —

### 2.2 — Envoi de messages texte
- **État** : ✅ Complet
- **Backend** : `src/whatsapp_message/whatsapp_message.controller.ts:69` — `POST /messages` (AdminGuard)
- **Backend** : `src/communication_whapi/` — providers Whapi, Meta, Messenger via `OutboundRouterService`
- **Frontend** : `front/src/components/chat/ChatInput.tsx` — saisie message commercial
- **Admin** : `admin/src/app/ui/OutboundMessageModal.tsx`
- **Reste à faire** : —
- **Erreurs/Bugs** : `any` sur le payload dans `communication_whapi.service.ts`

### 2.3 — Envoi de médias (image, vidéo, audio, document)
- **État** : ✅ Complet
- **Backend** : `src/whatsapp_message/whatsapp_message.controller.ts:206` — `POST /messages/media` (JWT commercial)
- **Backend** : `src/whatsapp_message/whatsapp_message.controller.ts:157` — `POST /messages/media/admin` (AdminGuard)
- **Frontend** : `front/src/components/chat/ChatInput.tsx` — upload fichier commercial
- **Reste à faire** : —
- **Erreurs/Bugs** : —

### 2.4 — Streaming médias reçus (proxy)
- **État** : ✅ Complet
- **Backend** : `GET /messages/media/meta/:providerMediaId` — proxy avec refresh URL expirée
- **Backend** : `GET /messages/media/whapi/:messageId` — proxy Whapi
- **Backend** : `GET /messages/media/messenger/:messageId` — proxy Messenger avec streaming vidéo Range
- **Frontend** : `front/src/components/helper/mediaBubble.tsx`
- **Reste à faire** : —
- **Optimisations** : Cache 5 min (Cache-Control: private, max-age=300)

### 2.5 — Vue conversation (liste + chat)
- **État** : ✅ Complet
- **Frontend** : `front/src/components/layout/ConversationSidebar.tsx` — sidebar avec filtres
- **Frontend** : `front/src/components/sidebar/ConversationList.tsx` + `ConversationItem.tsx`
- **Frontend** : `front/src/components/chat/ChatMainArea.tsx` + `ChatMessages.tsx` + `ChatHeader.tsx`
- **Frontend** : `front/src/app/whatsapp/page.tsx` — page principale agent
- **Reste à faire** : —
- **Optimisations** : —

### 2.6 — Filtres et recherche conversations
- **État** : ✅ Complet
- **Backend** : `GET /chats?status=&unread_only=true&poste_id=&commercial_id=` — filtres multi-critères
- **Frontend** : `front/src/components/sidebar/ConversationFilters.tsx` — badges filtres toggle
- **Frontend** : `front/src/hooks/useConversationSearch.ts` + `useConversationFilters.ts`
- **Reste à faire** : —

### 2.7 — Persistance filtres / vue dans l'URL
- **État** : ✅ Complet
- **Frontend** : `front/src/app/whatsapp/page.tsx` — `?view=` et `?filter=` persistés dans l'URL
- **Admin** : `admin/src/app/dashboard/commercial/page.tsx` — `?view=` persisté

### 2.8 — Statut de lecture et compteur non-lus
- **État** : ✅ Complet
- **Backend** : Migration `AddMessageReadTracking1748822400001` — tracking read/unread par message
- **Backend** : `src/dispatcher/` — `incrementUnreadCount()` met à jour `last_client_message_at`
- **Frontend** : `front/src/modules/conversations/services/unread-counter.service.ts`
- **Erreurs/Bugs** : Voir note mémoire sur `unread_count` désynchronisé si message lu depuis un autre appareil

### 2.9 — Citation de message (reply)
- **État** : ✅ Complet
- **Backend** : Migration `20260302_add_quoted_message_id.ts` — `quoted_message_id` sur `whatsapp_message`
- **Frontend** : `front/src/components/chat/ChatMessage.tsx`

### 2.10 — Statut des messages (envoyé, délivré, lu)
- **État** : ✅ Complet
- **Backend** : `src/whatsapp_message/entities/whatsapp_message.entity.ts` — champ `status`
- **Frontend** : `front/src/components/chat/ChatMessage.tsx` — icônes double check

### 2.11 — Messages automatiques (auto-message / relance auto)
- **État** : ✅ Complet
- **Backend** : `src/queue/` — jobs auto-message (type SEND_AUTO_MESSAGE)
- **Backend** : Migration `AddMediaToAutoMessage1749168000001` — support media dans auto-messages
- **Backend** : `src/platform-settings/platform-settings.controller.ts` — feature flag `auto_relance_enabled`
- **Admin** : `admin/src/app/ui/RelanceConfigView.tsx`
- **Reste à faire** : —

### 2.12 — Indicateur de frappe (typing)
- **État** : ✅ Complet
- **Frontend** : `front/src/components/helper/TypingBadge.tsx`
- **Frontend** : `front/src/components/ui/typingIndicator.tsx`
- **Backend** : événements Socket.io depuis les webhooks

### 2.13 — Fermeture de conversation
- **État** : ✅ Complet avec blocage conditionnel
- **Backend** : `src/conversation-closure/conversation-closure.controller.ts` — `POST /conversations/:chatId/close` + vérification conditions métier
- **Frontend** : `front/src/components/chat/ConversationClosureModal.tsx`
- **Erreurs/Bugs** : Rapport GICOP requis avant fermeture si `FF_GICOP_REPORT_REQUIRED` activé

### 2.14 — Historique des messages (admin)
- **État** : ✅ Complet
- **Backend** : `GET /messages/:chat_id` + `GET /messages?limit=&offset=&periode=`
- **Admin** : `admin/src/app/ui/MessagesView.tsx`

---

## [3] Dispatch & Affectation des conversations

### 3.1 — File d'attente (Queue)
- **État** : ✅ Complet
- **Backend** : `src/dispatcher/dispatcher.controller.ts` — `GET /queue`, reset, block/unblock postes
- **Backend** : `src/dispatcher/services/queue.service.ts` — gestion positions
- **Admin** : `admin/src/app/modules/dispatch/components/QueueView.tsx`
- **Reste à faire** : —

### 3.2 — Moteur de dispatch automatique
- **État** : ✅ Complet
- **Backend** : `src/dispatcher/dispatcher.service.ts` — attribution conversations → commerciaux
- **Backend** : `src/dispatcher/application/redispatch-waiting.use-case.ts` — redispatch manuel
- **Backend** : `src/dispatcher/application/reset-stuck-active.use-case.ts` — reset conversations bloquées
- **Admin** : `admin/src/app/modules/dispatch/components/DispatchView.tsx`
- **Reste à faire** : —
- **Erreurs/Bugs** : Voir note mémoire — `offline-reinjection` + `orphan-checker` incluent maintenant FERME

### 3.3 — Mode dédié canal/poste
- **État** : ✅ Complet
- **Backend** : `WhapiChannel.poste_id IS NOT NULL` → mode dédié exclusif (rate limit, cooldown, idle désactivés)
- **Backend** : `src/channel/channel.controller.ts` — gestion canal ↔ poste
- **Admin** : `admin/src/app/ui/DedicatedChannelsView.tsx`

### 3.4 — Paramètres dispatch
- **État** : ✅ Complet
- **Backend** : `src/dispatcher/services/dispatch-settings.service.ts` — settings + audit trail
- **Backend** : `GET /queue/dispatch/settings` + `POST /queue/dispatch/settings` + reset + audit paginé
- **Admin** : `admin/src/app/modules/dispatch/components/DispatchView.tsx`

### 3.5 — Affinité d'assignation
- **État** : ✅ Complet
- **Backend** : `src/dispatcher/domain/assignment-affinity.service.ts`
- **Backend** : `GET /queue/affinity/:posteId` + `GET /queue/affinity-stats`
- **Admin** : `admin/src/app/modules/dispatch/components/CapacityAffinityView.tsx`

### 3.6 — Capacité commerciale
- **État** : ✅ Complet
- **Backend** : `src/conversation-capacity/conversation-capacity.controller.ts`
- **Admin** : `admin/src/app/ui/CapacityView.tsx`

### 3.7 — Mode dispatch (global vs dédié)
- **État** : ✅ Complet
- **Backend** : Migration `DispatchModeColumn1747267200001` — colonne `dispatch_mode` sur les chats
- **Reste à faire** : —

---

## [4] SLA & Délais

### 4.1 — Règles SLA
- **État** : ✅ Complet
- **Backend** : `src/sla/sla.controller.ts` — CRUD règles SLA + évaluation + rapport violations
- **Admin** : `admin/src/app/modules/sla/components/SlaView.tsx`
- **Reste à faire** : —
- **Erreurs/Bugs** : `any` dans `sla.service.ts` pour les `where` clause

### 4.2 — Checker SLA automatique
- **État** : ✅ Complet (intentionnel : vérifie uniquement les conversations `unread_count > 0`)
- **Backend** : `src/queue/jobs/` — job SLA checker
- **Note** : AM#1 intentionnel — les conversations lues sans réponse sont ignorées par le SLA

### 4.3 — Suivi cooldown et avertissements
- **État** : ✅ Complet
- **Backend** : Migration `AddCooldownAndWarningSettings1748908800002`
- **Frontend** : `front/src/components/ReadCooldownModal.tsx`
- **Reste à faire** : —

### 4.4 — Idle disconnect
- **État** : ✅ Complet
- **Backend** : Migration `AddIdleDisconnectSettings1748822400002` — désactivé pour canaux dédiés
- **Frontend** : `front/src/hooks/useIdleTimer.ts` + `front/src/components/IdleWarningModal.tsx`
- **Frontend** : `front/src/components/IdleAndCooldownWrapper.tsx`
- **Reste à faire** : —

---

## [5] FlowBot & Automatisation

### 5.1 — Éditeur de flows (CRUD)
- **État** : ✅ Complet
- **Backend** : `src/flowbot/flowbot.controller.ts` — CRUD flows, nœuds, arêtes, triggers
- **Admin** : `admin/src/app/modules/flowbot/components/FlowListView.tsx` + `FlowBuilderView.tsx`
- **Reste à faire** : —

### 5.2 — Types de nœuds supportés
- **État** : ✅ Complet
- **Backend** : `src/flowbot/services/` — DELAY, HTTP_REQUEST, SEND_TEMPLATE (HSM), ASSIGN_LABEL
- **Backend** : `src/flowbot/events/` — triggers : MESSAGE_RECEIVED, LABEL_ADDED, SLA_BREACH
- **Reste à faire** : —

### 5.3 — Exécution des flows (worker BullMQ)
- **État** : ✅ Complet
- **Backend** : `src/flowbot/workers/` + `src/flowbot/jobs/` — exécution asynchrone via BullMQ
- **Reste à faire** : —

### 5.4 — Monitoring sessions FlowBot
- **État** : ✅ Complet
- **Backend** : `GET /flowbot/flows/:flowId/sessions` + sessions actives + logs session + annulation
- **Admin** : `admin/src/app/modules/flowbot/components/FlowBuilderView.tsx`

### 5.5 — Analytics FlowBot
- **État** : ✅ Complet
- **Backend** : `src/flowbot/services/flow-analytics.service.ts` — `GET /flowbot/flows/:flowId/analytics`
- **Reste à faire** : UI admin d'analytics FlowBot non visible dans les vues listées

### 5.6 — Contextes FlowBot (CTX-D3)
- **État** : ✅ Complet
- **Backend** : `src/context/context.controller.ts` — CRUD contextes + bindings + vue par poste
- **Admin** : `admin/src/app/modules/contexts/components/ContextsView.tsx`

### 5.7 — Bannière statut IA dans FlowBot
- **État** : ✅ Complet
- **Admin** : `admin/src/app/modules/flowbot/components/FlowbotAiStatusBanner.tsx`

---

## [6] Broadcasts & Templates HSM

### 6.1 — Broadcasts BullMQ
- **État** : ✅ Complet
- **Backend** : `src/broadcast/broadcast.controller.ts` — CRUD broadcasts + recipients + launch/pause/cancel + stats
- **Backend** : `src/broadcast/workers/` — envoi asynchrone via BullMQ
- **Admin** : `admin/src/app/modules/broadcasts/components/BroadcastsView.tsx`
- **Reste à faire** : —

### 6.2 — Templates HSM (nouveau module `whatsapp-template`)
- **État** : ✅ Complet (backend), 🔄 Partiel (feature flag désactivé dans `whatsapp_message.controller.ts`)
- **Backend** : `src/whatsapp-template/whatsapp-template.controller.ts` — CRUD + soumission Meta + modèles de base
- **Backend** : `src/whatsapp_template/whatsapp_template.controller.ts` — ancien module (legacy)
- **Frontend** : `front/src/components/chat/TemplateSelectorModal.tsx`
- **Admin** : `admin/src/app/ui/templates/TemplatesView.tsx`
- **Reste à faire** : Activer `HSM_TEMPLATES_ENABLED = false` (ligne 54 de `whatsapp_message.controller.ts`)
- **Erreurs/Bugs** : Duplication de deux modules templates (`whatsapp_template/` et `whatsapp-template/`)

### 6.3 — Outbound HSM (envoi proactif template)
- **État** : ✅ Complet
- **Backend** : Migrations `20260430_outbound_hsm_v1.ts` + `OutboundHsmV2_1746000000002.ts`
- **Admin** : `admin/src/app/ui/DiffusionsTabsView.tsx`

### 6.4 — Sélecteur template pour relances (follow-up)
- **État** : ✅ Complet
- **Backend** : `src/follow-up/follow_up.controller.ts` — mappings template par type de relance
- **Frontend** : `front/src/components/chat/TemplateSelectorModal.tsx`
- **Reste à faire** : —

---

## [7] Médias & Stockage

### 7.1 — Stockage local des médias reçus
- **État** : ✅ Complet
- **Backend** : `src/media-storage/` — MediaStorageService, MediaDownloadService, MediaBackfillService (3 crons)
- **Backend** : Migration `AddLocalMediaStorage1749427200001` — colonnes `local_url`, `local_path`, `provider_url_expired`, `downloaded_at` sur `whatsapp_media`
- **Backend** : Téléchargement asynchrone via `setImmediate` dans `saveMedia()` — ne bloque pas le webhook
- **Backend** : Serveur statique `/uploads/media/` via `useStaticAssets`
- **Admin** : `admin/src/app/dashboard/galerie-media/page.tsx` + `GalerieMediaView.tsx`
- **Reste à faire** : —

### 7.2 — Galerie médias (vue admin des médias reçus)
- **État** : ✅ Complet
- **Backend** : `src/media-storage/galerie-media.controller.ts` — `GET /media-storage/gallery` avec filtres
- **Admin** : `admin/src/app/ui/GalerieMediaView.tsx`

### 7.3 — Médiathèque (assets uploadés par admin)
- **État** : ✅ Complet
- **Backend** : `src/media-asset/media-asset.controller.ts` — upload + CRUD assets (image/vidéo/audio/pdf), max 16 MB
- **Backend** : Preview HTML avec OpenGraph + redirect `GET /media/preview/:id`
- **Admin** : `admin/src/app/ui/MediathequeView.tsx` + `MediaPickerModal.tsx`
- **Reste à faire** : —

### 7.4 — Panel media (accès rapide commerciaux)
- **État** : ✅ Complet
- **Backend** : Migration `AddMediaPanelToPoste1749513600001` — config media panel par poste
- **Frontend** : `front/src/components/panel/MediaPanel.tsx`
- **Admin** : `admin/src/app/ui/PosteMediaPanelModal.tsx`

### 7.5 — Catalogue informationnel (assets structurés)
- **État** : ✅ Complet
- **Backend** : `src/catalog/catalog.controller.ts` — CRUD par catégorie, activation/désactivation
- **Frontend** : `front/src/components/chat/CatalogModal.tsx`
- **Admin** : `admin/src/app/modules/catalog/components/CatalogManager.tsx`

---

## [8] Analytics & Métriques

### 8.1 — Dashboard métriques globales
- **État** : ✅ Complet
- **Backend** : `src/metriques/metriques.controller.ts` — `GET /api/metriques/globales|commerciaux|channels|performance-temporelle|overview|queue`
- **Backend** : `src/metriques/analytics-snapshot.service.ts` — snapshots TTL par période (today/week/month/year)
- **Admin** : `admin/src/app/ui/OverviewView.tsx`

### 8.2 — Trafic messages (diagramme 24h)
- **État** : ✅ Complet
- **Backend** : `GET /api/metriques/trafic-horaire?granularite=heure|jour` — colonnes virtuelles + index covering
- **Backend** : `GET /api/metriques/trafic-conversations` — trafic conversations
- **Admin** : `admin/src/app/ui/ConversationsTrafficTab.tsx` — toggle granularité heure/jour + 8 KPIs + auto-refresh 90s
- **Backend** : Migration `AddTrafficGroupingIndexes1748995200001`

### 8.3 — Performance temporelle
- **État** : ✅ Complet
- **Backend** : `GET /api/metriques/performance-temporelle?jours=N`
- **Admin** : `admin/src/app/ui/PerformanceView.tsx`

### 8.4 — Analytics par canal
- **État** : ✅ Complet
- **Backend** : `GET /api/metriques/channels/:channelId/stats` — stats détaillées par canal
- **Admin** : `admin/src/app/ui/ChannelStatsView.tsx`
- **Backend** : Migration `AddChannelStatsIndexes1782086400001`

### 8.5 — Analytics commerciaux (P5.2)
- **État** : ✅ Complet
- **Backend** : `src/analytics/analytics.controller.ts` — summary, volume conversations, agents, channels, ranking
- **Admin** : `admin/src/app/ui/AnalyticsView.tsx`

### 8.6 — Classement commerciaux (ranking)
- **État** : ✅ Complet
- **Backend** : `src/targets/targets.controller.ts` — `GET /targets/ranking?period=today|week|month` + formule pondérée
- **Admin** : `admin/src/app/ui/RankingView.tsx`
- **Frontend** : `front/src/components/chat/RankingPositionWidget.tsx`

### 8.7 — KPIs Meta Ads (CTWA)
- **État** : ✅ Complet
- **Backend** : `GET /api/metriques/campagnes-meta?dateFrom=&dateTo=` — KPI par campagne
- **Admin** : `admin/src/app/ui/MetaCampaignsView.tsx`

### 8.8 — Stats business metrics (flux critiques 24h)
- **État** : ✅ Complet
- **Backend** : `src/business-metrics/business-metrics.controller.ts` — `GET /admin/business-metrics`
- **Admin** : intégré dans la supervision

### 8.9 — Chats lus sans réponse
- **État** : ✅ Complet
- **Backend** : `GET /api/metriques/commerciaux/:commercialId/chats-lus-sans-reponse`
- **Admin** : `admin/src/app/ui/CommerciauxView.tsx`

### 8.10 — Snapshots d'analytics (TTL)
- **État** : ✅ Complet
- **Backend** : `POST /api/metriques/refresh-snapshots` + `GET /api/metriques/snapshot-status`
- **Admin** : `admin/src/app/ui/OverviewView.tsx`
- **Erreurs/Bugs** : `any` dans `metriques.controller.ts:116` sur `snap.data as any`

---

## [9] Intégration ERP / DB2 (E-GICOP)

### 9.1 — Connexion DB2 null-safe
- **État** : ✅ Complet
- **Backend** : `src/order-db/` — `ORDER_DB_DATA_SOURCE` injectable, null si `ORDER_DB_HOST` absent
- **Reste à faire** : —

### 9.2 — Synchronisation appels (OrderCallSync)
- **État** : ✅ Complet
- **Backend** : `src/order-call-sync/` — sync depuis DB2, journal cursor
- **Backend** : `src/order-call-sync/__tests__/` — 4 erreurs TS pré-existantes (ignorées)
- **Admin** : `admin/src/app/ui/IntegrationView.tsx`

### 9.3 — Lecture commandes (order-read)
- **État** : ✅ Complet
- **Backend** : `src/order-read/entities/` + services — lecture seule tables natives DB2
- **Règle** : jamais d'écriture dans tables natives DB2

### 9.4 — Écriture miroir commandes (order-write)
- **État** : ✅ Complet
- **Backend** : `src/order-write/` — écriture dans tables miroir `messaging_*` uniquement

### 9.5 — Journal de synchronisation (IntegrationSyncLog)
- **État** : ✅ Complet
- **Backend** : `src/integration-sync/` — journal sync local, migration `20260424_integration_sync_log.ts`
- **Admin** : `admin/src/app/ui/OutboxSyncView.tsx`

### 9.6 — Outbox d'intégration
- **État** : ✅ Complet
- **Backend** : `src/integration-outbox/outbox-admin.controller.ts` — stats + failed entries + retry
- **Admin** : `admin/src/app/ui/OutboxSyncView.tsx`

### 9.7 — ERP client sync
- **État** : 🔄 Partiel
- **Backend** : `src/erp-client-sync/` — dossier présent mais peu développé
- **Reste à faire** : Implémentation sync retour vers ERP

---

## [10] Supervision Admin

### 10.1 — Vue d'ensemble dashboard
- **État** : ✅ Complet
- **Admin** : `admin/src/app/ui/OverviewView.tsx` — KPIs, graphiques, alertes
- **Admin** : `admin/src/app/dashboard/commercial/page.tsx` — routing de toutes les vues (~45 vues)

### 10.2 — Gestion des postes
- **État** : ✅ Complet
- **Backend** : `src/whatsapp_poste/whatsapp_poste.controller.ts`
- **Admin** : `admin/src/app/modules/channels/components/PostesView.tsx`

### 10.3 — Gestion des canaux (Whapi/Meta/Messenger)
- **État** : ✅ Complet
- **Backend** : `src/channel/channel.controller.ts` — CRUD canaux + health check + webhook re-souscription
- **Admin** : `admin/src/app/modules/channels/components/ChannelsView.tsx`
- **Admin** : `admin/src/app/lib/api/channels.api.ts`

### 10.4 — Gestion des commerciaux
- **État** : ✅ Complet
- **Backend** : `src/whatsapp_commercial/whatsapp_commercial.controller.ts`
- **Admin** : `admin/src/app/ui/CommerciauxView.tsx`

### 10.5 — Groupes de commerciaux
- **État** : ✅ Complet
- **Backend** : `src/commercial-group/commercial-group.controller.ts` — CRUD groupes + membres + planning auto
- **Admin** : `admin/src/app/ui/CommercialGroupsView.tsx`
- **Admin** : `admin/src/app/ui/groups/` — calendrier, présences, planning, audits

### 10.6 — Présence commerciaux
- **État** : ✅ Complet
- **Backend** : `is_working_today` sur `WhatsappCommercial`
- **Admin** : `admin/src/app/ui/PresenceView.tsx`
- **Admin** : `admin/src/app/commercial-groups/presence/page.tsx`

### 10.7 — Applications Meta (MessagingApplication)
- **État** : ✅ Complet
- **Backend** : `src/application/application.controller.ts` — CRUD + liste canaux associés
- **Admin** : `admin/src/app/ui/ApplicationsView.tsx`
- **Migrations** : BackfillMessagingApplications + AssociateChannels + DropLegacyCredentials + AddApplicationFK

### 10.8 — Vue GICOP supervision
- **État** : ✅ Complet
- **Admin** : `admin/src/app/ui/GicopSupervisionView.tsx`

### 10.9 — Observabilité (Go/No-Go)
- **État** : ✅ Complet
- **Admin** : `admin/src/app/modules/observability/components/GoNoGoView.tsx` — matrice crons/flags
- **Admin** : `admin/src/app/modules/observability/components/ObservabiliteView.tsx`

---

## [11] Notifications Temps Réel (Socket.io)

### 11.1 — Serveur WebSocket (Socket.io + Redis adapter)
- **État** : ✅ Complet
- **Backend** : `src/realtime/` — `RealtimeServerService` + adaptateur Redis multi-instance
- **Backend** : `src/realtime/publishers/` — QueuePublisher, événements métier
- **Frontend** : `front/src/contexts/SocketProvider.tsx` + `front/src/lib/socket/socket-events.constants.ts`

### 11.2 — Événements temps réel frontend
- **État** : ✅ Complet
- **Frontend** : `front/src/components/WebSocketEvents.tsx` — routage événements entrants
- **Frontend** : `front/src/modules/realtime/services/socket-event-router.ts`
- **Événements** : `queue:updated`, nouveaux messages, statuts, typing, session changes

### 11.3 — Notifications admin (in-app)
- **État** : ✅ Complet
- **Backend** : `src/notification/notification.controller.ts` + `src/system-alert/system-alert.controller.ts`
- **Admin** : `admin/src/app/modules/notifications/components/NotificationsView.tsx`
- **Admin** : `admin/src/app/hooks/useNotifications.ts`

### 11.4 — Alerte config (seuils)
- **État** : ✅ Complet
- **Admin** : `admin/src/app/modules/notifications/components/AlertConfigView.tsx`
- **Backend** : `src/system-alert/system-alert.controller.ts`

---

## [12] Audit & Traçabilité

### 12.1 — Audit trail des actions admin
- **État** : ✅ Complet
- **Backend** : `src/audit/audit.controller.ts` — historique paginé avec filtres
- **Admin** : `admin/src/app/modules/audit/components/AuditView.tsx`

### 12.2 — Audit dispatch settings
- **État** : ✅ Complet
- **Backend** : `GET /queue/dispatch/settings/audit` + version paginée `/audit/page`
- **Admin** : dans `DispatchView`

### 12.3 — Audit planning commercial
- **État** : ✅ Complet
- **Backend** : Migration `AddPlanningAudit1779321600001`
- **Admin** : `admin/src/app/ui/groups/PlanningAuditView.tsx`

---

## [13] Fenêtre Glissante de Validation

### 13.1 — Moteur de validation (critères)
- **État** : ✅ Complet
- **Backend** : `src/window/services/validation-engine.service.ts` — évaluation critères par conversation
- **Backend** : `GET /window/criteria` + `PATCH /window/criteria/:id` + `GET /window/validation-state`
- **Frontend** : `front/src/components/sidebar/BlockProgressBar.tsx` — barre progression du bloc
- **Migrations** : `Phase9SlidingWindow1745424000001`

### 13.2 — Rotation de fenêtre
- **État** : ✅ Complet
- **Backend** : `src/window/services/window-rotation.service.ts`
- **Backend** : `POST /window/rotate/:posteId` + `POST /window/rotate-check/:posteId` + `POST /window/rebuild/:posteId`
- **Backend** : `GET /window/debug/:posteId` — diagnostic lecture seule
- **Backend** : `POST /window/auto-check-all`

### 13.3 — Progression du bloc
- **État** : ✅ Complet
- **Backend** : `GET /window/progress/:posteId`
- **Frontend** : `front/src/components/sidebar/BlockProgressBar.tsx`

### 13.4 — Rappels fenêtre (cron)
- **État** : ✅ Complet
- **Backend** : Migrations `AddWindowReminderSection1780531200001` + `AddWindowReminderCronFields1780531200002`
- **Backend** : Migration `AddWindowExpiresAtToChat1781522555000` + `BackfillWindowExpiresAt1781654400001`

---

## [14] Gestion des Appels

### 14.1 — Obligations d'appels (batches + tâches)
- **État** : ✅ Complet
- **Backend** : `src/call-obligations/call-obligation.controller.ts` — statut batch par poste, init-all, quality-check, tâches
- **Backend** : `src/call-obligations/call-task-admin.controller.ts`
- **Frontend** : `front/src/components/sidebar/ObligationProgressBar.tsx`
- **Admin** : `admin/src/app/modules/dispatch/components/CallObligationsView.tsx`

### 14.2 — Suivi appels (call-log)
- **État** : ✅ Complet
- **Backend** : `src/call-log/call_log.controller.ts`
- **Frontend** : `front/src/components/contacts/CallLogHistory.tsx`

### 14.3 — Attribution d'appels depuis groupes
- **État** : ✅ Complet
- **Backend** : `src/commercial-group/` — pipeline cascade pool/groupe
- **Migrations** : `AddCommercialGroup1747094400002` + `AddWorkingTodayToCommercial1747094400001`

### 14.4 — Appels manqués (missed-calls)
- **État** : ✅ Complet
- **Backend** : `src/missed-calls/missed-call.controller.ts` — liste paginée, métriques SLA, fermeture manuelle, backfill
- **Admin** : `admin/src/app/ui/MissedCallsView.tsx`

### 14.5 — Dispositifs d'appel (call-device)
- **État** : ✅ Complet
- **Backend** : `src/call-device/call-device.controller.ts`
- **Admin** : `admin/src/app/ui/CallDevicesView.tsx`

### 14.6 — Événements d'appels (fenêtre glissante)
- **État** : ✅ Complet
- **Backend** : `src/window/controllers/call-event.controller.ts` — historique appels + critères validation
- **Backend** : `src/window/services/call-event.service.ts`

### 14.7 — Qualité d'appel (quality-check)
- **État** : ✅ Complet
- **Backend** : `POST /call-obligations/quality-check/:posteId`

### 14.8 — Matching appel → tâche
- **État** : ✅ Complet
- **Backend** : `src/order-call-sync/` — `tryMatchCallToTask` avec résolution catégorie via DB2 (pont numéro de téléphone)

---

## [15] Catalogue & Liens Campagnes

### 15.1 — Liens de campagne avec tracking
- **État** : ✅ Complet
- **Backend** : `src/campaign-link/campaign-link.controller.ts` — CRUD + tracking clics + analytics + upload média
- **Backend** : `GET /campaign/t/:code` — redirect avec tracking IP/user-agent
- **Backend** : `GET /c/:shortCode` — short links
- **Frontend** : `front/src/app/c/[shortCode]/page.tsx` — page short link
- **Admin** : `admin/src/app/ui/CampaignLinksView.tsx`

### 15.2 — Référence Meta Ad (CTWA)
- **État** : ✅ Complet
- **Backend** : `src/meta-ad-referral/` — extraction attributs ad depuis webhook Meta
- **Backend** : Migrations `AddMetaAdReferral1780272000001` + `AddMetaAdReferral1780272000002` + `FixMetaAdReferralDefaults1780358400001`

---

## [16] Labels, Canned Responses, Transfer, Merge

### 16.1 — Labels (étiquettes conversations)
- **État** : ✅ Complet
- **Backend** : `src/label/label.controller.ts` — CRUD admin + assignation admin/agent
- **Frontend** : `front/src/components/conversation/LabelMenu.tsx`
- **Erreurs/Bugs** : `any` dans `label.service.ts` pour les `where` clause

### 16.2 — Canned Responses (réponses prédéfinies)
- **État** : ✅ Complet
- **Backend** : `src/canned-response/canned-response.controller.ts` — CRUD admin + autocomplétion agent (`/suggest`)
- **Frontend** : `front/src/components/chat/CannedResponseMenu.tsx`
- **Admin** : intégré dans Settings

### 16.3 — Transfert de conversation
- **État** : ✅ Complet
- **Backend** : `src/conversation-transfer/conversation-transfer.controller.ts` — agent JWT + admin
- **Frontend** : `front/src/components/conversation/TransferModal.tsx`

### 16.4 — Fusion de conversations
- **État** : ✅ Complet
- **Backend** : `src/conversation-merge/conversation-merge.controller.ts` — admin + agent JWT
- **Frontend** : `front/src/components/conversation/MergeModal.tsx`

---

## [17] GDPR / Opt-out

### 17.1 — Enregistrement opt-out
- **État** : ✅ Complet
- **Backend** : `src/gdpr-optout/gdpr-optout.controller.ts` — admin (CRUD) + agent JWT (auto-déclaration)
- **Backend** : Anonymisation (`DELETE /admin/gdpr/optout/:phone/anonymize`) + révocation
- **Admin** : intégré dans Settings
- **Erreurs/Bugs** : `any` dans `gdpr-optout.service.ts` pour les `where` clause

### 17.2 — Page suppression données
- **État** : ✅ Complet
- **Frontend** : `front/src/app/data-deletion/page.tsx`
- **Frontend** : `front/src/app/privacy-policy/page.tsx`

---

## [18] Relances (Follow-ups)

### 18.1 — Création et gestion des relances
- **État** : ✅ Complet
- **Backend** : `src/follow-up/follow_up.controller.ts` — create, mine, due-today, complete, cancel, reschedule, by-contact
- **Frontend** : `front/src/components/chat/CreateFollowUpModal.tsx` + `FollowUpPanel.tsx`
- **Frontend** : `front/src/hooks/useDueTodayFollowUps.ts`
- **Frontend** : `front/src/components/chat/FollowUpReminderToast.tsx`
- **Admin** : `admin/src/app/ui/FollowUpsView.tsx` + vue admin avec filtres

### 18.2 — Mappings templates pour relances
- **État** : ✅ Complet
- **Backend** : `GET|PUT|DELETE /follow-ups/admin/follow-up-mappings/:follow_up_type`
- **Admin** : `admin/src/app/ui/RelanceConfigView.tsx`

### 18.3 — Relance automatique
- **État** : ✅ Complet (feature flag `auto_relance_enabled`)
- **Backend** : `src/platform-settings/platform-settings.controller.ts` — toggle admin
- **Admin** : `admin/src/app/ui/RelanceConfigView.tsx`

---

## [19] CRM & Dossier Client

### 19.1 — Champs CRM personnalisés
- **État** : ✅ Complet
- **Backend** : `src/crm/crm.controller.ts` — CRUD définitions + valeurs par contact
- **Admin** : `admin/src/app/modules/crm/components/CrmView.tsx`

### 19.2 — Dossier client complet
- **État** : ✅ Complet
- **Backend** : `src/client-dossier/client-dossier.controller.ts` — recherche, dossier, timeline, by-chat, phones
- **Frontend** : `front/src/components/contacts/ContactDetailView.tsx` + `ContactCard.tsx` + `ContactTimeline.tsx`
- **Admin** : `admin/src/app/ui/ClientsView.tsx` + `ClientsCrmTabsView.tsx`

### 19.3 — Contacts
- **État** : ✅ Complet
- **Backend** : `src/contact/contact.controller.ts` — CRUD contacts + affiliation portefeuille
- **Frontend** : `front/src/app/contacts/page.tsx` + `front/src/components/contacts/`
- **Backend** : Migration `20260511_add_contact_source.ts` — source du contact (WhatsApp, appel, etc.)

### 19.4 — Portfolio commercial (affinité contact)
- **État** : ✅ Complet
- **Backend** : Migration `20260422_contact_assignment_affinity.ts`
- **Backend** : `src/dispatcher/domain/assignment-affinity.service.ts`

---

## [20] Planning & Présence

### 20.1 — Plannings individuels (work-schedule)
- **État** : ✅ Complet
- **Backend** : `src/work-schedule/work-schedule.controller.ts` — CRUD créneaux + planning du jour
- **Frontend** : `front/src/components/sidebar/WorkSchedulePanel.tsx`
- **Admin** : `admin/src/app/ui/WorkScheduleAdminView.tsx`

### 20.2 — Planning de groupe (calendar auto-généré)
- **État** : ✅ Complet
- **Backend** : `src/commercial-group/group-schedule.service.ts` — génération auto calendrier par groupe
- **Backend** : `POST /commercial-groups/:id/schedule/generate` + `POST /commercial-groups/schedule/generate-all`
- **Backend** : Migrations `AddCommercialPlanning1779148800001` + `CreateGroupScheduleDay1779062400002`
- **Admin** : `admin/src/app/ui/groups/GroupsCalendarView.tsx` + `CalendarMonthView.tsx`

### 20.3 — Absences et remplacements
- **État** : ✅ Complet
- **Backend** : `POST /commercial-groups/planning` + `POST /commercial-groups/planning/replacement` + `POST /commercial-groups/planning/absence-range`
- **Admin** : `admin/src/app/ui/groups/AbsenceSummaryTable.tsx`

### 20.4 — Planning audit trail
- **État** : ✅ Complet
- **Backend** : `GET /commercial-groups/planning/audit`
- **Admin** : `admin/src/app/ui/groups/PlanningAuditView.tsx`

### 20.5 — Calendrier de santé (expiration planning)
- **État** : ✅ Complet
- **Backend** : `GET /commercial-groups/planning/calendar-health` — groupes avec calendrier expirant sous 7j

---

## [21] Rapport GICOP

### 21.1 — Rapport de conversation GICOP
- **État** : ✅ Complet
- **Backend** : `src/gicop-report/conversation-report.controller.ts` — upsert (autosave), validation superviseur, soumission, statut, retry admin
- **Frontend** : `front/src/components/chat/GicopReportPanel.tsx`

### 21.2 — Soumission vers plateforme de gestion
- **État** : ✅ Complet
- **Backend** : `src/gicop-report/report-submission.service.ts` — soumission + retry + rapports en échec

---

## [22] IA (Assistant & Gouvernance)

### 22.1 — Suggestions de réponses IA
- **État** : ✅ Complet (désactivable via gouvernance)
- **Backend** : `src/ai-assistant/ai-assistant.controller.ts` — `GET /ai/suggestions/:chat_id` (3 suggestions contextuelles)
- **Backend** : `GET /ai/summary/:chat_id` — résumé conversation
- **Backend** : `POST /ai/rewrite` — correction/amélioration/formalisation texte
- **Backend** : `POST /ai/qualify/:chat_id` — qualification conversation (outcome, intérêt, objection)
- **Backend** : `POST /ai/followup-message` — génération message de relance
- **Backend** : `GET /ai/dossier/:contact_id` — synthèse dossier client
- **Backend** : `POST /ai/quality/:chat_id` — analyse qualité agent (coaching)
- **Reste à faire** : UI frontend pour ces endpoints (non visible dans les composants actuels)
- **Erreurs/Bugs** : Accès JWT uniquement — pas d'UI admin identifiée pour suggestions commerciales

### 22.2 — Gouvernance IA (modules + providers)
- **État** : ✅ Complet
- **Backend** : `src/ai-governance/ai-governance.controller.ts` — CRUD providers + config modules + logs + dashboard
- **Admin** : `admin/src/app/ui/AiGovernanceView.tsx`
- **Backend** : Migrations `20260421_phase7_ai_governance.ts` + `20260421_phase7b_ai_providers.ts`

### 22.3 — Analyse de sentiment
- **État** : ✅ Complet (traitement BullMQ asynchrone)
- **Backend** : `src/sentiment/` — SentimentService + SentimentWorker + SentimentListener
- **Backend** : Colonnes `sentiment_score` + `sentiment_label` sur `whatsapp_message`
- **Reste à faire** : UI d'affichage du sentiment (non trouvée dans les composants frontend)

---

## [23] Webhooks Sortants (Outbound)

### 23.1 — Webhooks sortants avec HMAC + retry
- **État** : ✅ Complet
- **Backend** : `src/outbound-webhook/outbound-webhook.controller.ts` — CRUD + logs + test + retry log
- **Backend** : `src/outbound-webhook/workers/` — worker BullMQ avec HMAC
- **Admin** : `admin/src/app/modules/webhooks/components/WebhooksView.tsx`

---

## [24] Métriques Webhook (Whapi)

### 24.1 — Métriques de santé webhook
- **État** : ✅ Complet
- **Backend** : `src/whapi/webhook-metrics.controller.ts` — `GET /metrics/webhook`
- **Admin** : via `admin/src/app/lib/api/metrics.api.ts:getWebhookMetrics()`

---

## [25] Santé Système

### 25.1 — Health check (DB + Redis + mémoire)
- **État** : ✅ Complet
- **Backend** : `src/system-health/system-health.controller.ts` — `GET /admin/system/health` avec RAM process/container/host + Redis détaillé + MySQL
- **Admin** : `admin/src/app/ui/SystemHealthView.tsx` + `SystemHealthBanner.tsx`
- **Admin** : `admin/src/app/hooks/useSystemHealth.ts`

### 25.2 — Configuration système (system-config)
- **État** : ✅ Complet
- **Backend** : `src/system-config/system-config.controller.ts` — key/value store
- **Admin** : `admin/src/app/ui/SettingsView.tsx`

### 25.3 — Gestion des CRONs (admin)
- **État** : ✅ Complet
- **Backend** : `src/jorbs/cron-config.controller.ts` — list, get, update (re-schedule immédiat), reset, preview, run-now, last-reports
- **Admin** : `admin/src/app/ui/CronConfigView.tsx`

---

## [26] Objectifs Commerciaux (Targets)

### 26.1 — Objectifs par commercial
- **État** : ✅ Complet
- **Backend** : `src/targets/targets.controller.ts` — CRUD objectifs + progression + ranking + snapshot historique
- **Frontend** : `front/src/components/chat/ObjectifsPanel.tsx`
- **Admin** : `admin/src/app/ui/TargetsView.tsx`
- **Erreurs/Bugs** : `any` dans `targets.service.ts`

---

## [27] Quiz Commercial

### 27.1 — Système de quiz (admin + commercial)
- **État** : ✅ Complet
- **Backend** : `src/quiz/quiz-admin.controller.ts` — CRUD catégories, questions, sessions, exemptions, PDFs
- **Backend** : `src/quiz/quiz-commercial.controller.ts` — passage quiz côté commercial
- **Frontend** : `front/src/app/quiz/page.tsx` + `front/src/app/quiz/result/page.tsx`
- **Admin** : `admin/src/app/ui/QuizView.tsx`
- **Backend** : Migration `AddQuizSystem1749686400000`

---

## [28] Réclamations (Complaints)

### 28.1 — Gestion des réclamations
- **État** : ✅ Complet
- **Backend** : `src/complaints/complaints.controller.ts` — création par commercial, gestion admin (assign/start/resolve/reject)
- **Admin** : `admin/src/app/modules/dispatch/components/ComplaintsView.tsx`
- **Backend** : Migration `20260428_e09_complaints.ts`

---

## [29] Restriction de Messages

### 29.1 — Restriction actions commerciales (gate)
- **État** : ✅ Complet
- **Backend** : `src/commercial-action-gate/commercial-action-gate.controller.ts` + guard `CommercialActionGateGuard`
- **Backend** : Limites : max conversations non répondues, longueur minimale réponse, etc.
- **Frontend** : `front/src/components/sidebar/ActionGateBanner.tsx`
- **Admin** : `admin/src/app/ui/LectureSeuleView.tsx`

### 29.2 — Configuration restriction (read-only)
- **État** : ✅ Complet
- **Backend** : `src/conversation-restriction/conversation-restriction.controller.ts` — lecture agent + CRUD admin
- **Backend** : Migration `ConversationRestrictionAccess1748649600001`
- **Admin** : `admin/src/app/ui/LectureSeuleView.tsx`

---

## [30] Sessions Chat & Connexion

### 30.1 — Sessions chat (connection tracking)
- **État** : ✅ Complet
- **Backend** : `src/chat-session/` — entité `ChatSession`
- **Backend** : Migration `AddChatSessionEntity1780531200000`
- **Backend** : Migration `FixActiveSessionIdCollation1780704000000`

### 30.2 — Logs de connexion
- **État** : ✅ Complet
- **Backend** : `src/connection-log/` — nettoyage connexions stale (migration `CleanupStaleConnectionLogs1749081600001`)
- **Backend** : Migration `ConnectionLog1746057600007`
- **Admin** : `admin/src/app/ui/LoginLogsView.tsx`

---

## [31] PWA

### 31.1 — Progressive Web App
- **État** : 🔄 Partiel
- **Frontend** : `front/src/components/PwaRegister.tsx` — enregistrement service worker
- **Reste à faire** : Configuration complète manifest, offline mode non confirmé

---

## [32] Auto-connexion

### 32.1 — Connexion automatique par username
- **État** : ✅ Complet
- **Backend** : `POST /auth/auto-login` — connexion sans mot de passe par username
- **Frontend** : `front/src/app/auto_connexion/page.tsx`

---

## Duplications / réutilisables détectés

- `src/whatsapp_template/` vs `src/whatsapp-template/` — deux modules templates coexistent (ancien et nouveau). Le nouveau (`whatsapp-template`) est désactivé par feature flag dans le controller messages. Recommandation : consolider vers `whatsapp-template` et supprimer l'ancien.
- `admin/src/app/ui/ChannelsView.tsx` vs `admin/src/app/modules/channels/components/ChannelsView.tsx` — deux fichiers de même nom dans des chemins différents (migration vers modules autonomes en cours — le dashboard route vers les modules)
- `admin/src/app/ui/AlertConfigView.tsx` vs `admin/src/app/modules/notifications/components/AlertConfigView.tsx` — idem
- `admin/src/app/ui/AiGovernanceView.tsx` vs `admin/src/app/ui/AiGovernanceView.tsx` — unique mais quelques vues `admin/src/app/ui/` sont dupliquées avec leurs équivalents dans `modules/`
- `any` TypeScript dans plusieurs services (jwt.strategy.ts, communication_whapi.service.ts, label.service.ts, broadcast.service.ts, gdpr-optout.service.ts, targets.service.ts, sla.service.ts, metriques.controller.ts) — points bloquants potentiels en review

---

## Fonctionnalités sans UI frontend identifiée

- `POST /ai/qualify/:chat_id` — qualification IA (backend complet, pas de bouton frontend visible)
- `GET /ai/dossier/:contact_id` — synthèse dossier IA (backend complet)
- `POST /ai/quality/:chat_id` — coaching qualité IA (backend complet)
- `GET /ai/suggestions/:chat_id` + `GET /ai/summary/:chat_id` — suggestions IA (pas de composant frontend clairement identifié dans les composants chat)
- Affichage du `sentiment_score` / `sentiment_label` des messages (stocké en BDD mais non rendu)
- `GET /admin/analytics/summary|conversations|agents|channels` (P5.2) — existe un `AnalyticsView` admin mais les endpoints P5.2 (`/admin/analytics/`) semblent distincts des endpoints métriques

## Endpoints backend sans appelant admin identifié

- `GET /admin/gdpr/optout` — non visible dans les vues admin listées
- `POST /window/force-validate/:chatId` — admin uniquement, pas de bouton admin évident
- `GET /contexts/poste/:posteId/chat-contexts` — endpoint admin mais usage non clairement identifié dans l'UI
