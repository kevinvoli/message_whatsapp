# Bilan complet du backend

## Architecture Globale

Le backend est un serveur **NestJS** de gestion de conversations WhatsApp multi-provider (WhAPI + Meta Cloud API). Il gère l'ingestion de webhooks, le dispatch aux agents commerciaux, la persistance, et la communication temps réel via Socket.IO.

```
Webhook → Idempotency → Adapter → Format Unifié → Dispatcher (Queue)
→ Persistence BD → Gateway Socket.IO → Frontend
```

---

## SERVICES ACTIFS

### 1. Pipeline d'ingestion webhook

| Service | Fichier | Role |
|---------|---------|------|
| **WhapiService** | `whapi/whapi.service.ts` | Point d'entrée webhook WhAPI. Résout le tenant, vérifie l'idempotence, délègue au routeur unifié |
| **UnifiedIngressService** | `webhooks/unified-ingress.service.ts` | Normalise les payloads WhAPI/Meta en format `UnifiedMessage`/`UnifiedStatus` via les adapters |
| **InboundMessageService** | `webhooks/inbound-message.service.ts` | Traite les messages normalisés : valide le chat_id, dispatch, persiste, extrait les médias, notifie le frontend |
| **WebhookIdempotencyService** | `webhooks/idempotency/webhook-idempotency.service.ts` | Déduplique les événements webhook (accepted/duplicate/conflict) via DB |
| **WebhookTrafficHealthService** | `whapi/webhook-traffic-health.service.ts` | Circuit breaker : ouvre à 5% d'erreurs, dégrade si P95 >= 800ms |
| **WebhookDegradedQueueService** | `whapi/webhook-degraded-queue.service.ts` | File d'attente quand un provider est dégradé (max 5000, concurrence 5) |
| **WebhookRateLimitService** | `whapi/webhook-rate-limit.service.ts` | Token bucket multi-dimension : global 300 RPS, provider 150, IP 60, tenant 1200 RPM |
| **WebhookMetricsService** | `whapi/webhook-metrics.service.ts` | Compteurs, latences P95/P99, export Prometheus |
| **WebhookIdempotencyPurgeService** | `whapi/webhook-idempotency-purge.service.ts` | Cron 3h AM : purge les événements > 14 jours |

### 2. Dispatch et Queue

| Service | Fichier | Role |
|---------|---------|------|
| **DispatcherService** | `dispatcher/dispatcher.service.ts` | Cerveau du dispatch. 4 cas : conversation existante+agent connecté, réassignation, nouvelle conversation, aucun agent. Deadline SLA 5 min |
| **QueueService** | `dispatcher/services/queue.service.ts` | File FIFO avec stratégie least-loaded. Mutex thread-safe. Gère ajout/retrait/purge/blocage des postes |
| **DispatchSettingsService** | `dispatcher/services/dispatch-settings.service.ts` | Config dynamique du dispatcher + crons : read-only enforcement (10 min), offline reinject (9h), SLA timeout |

### 3. Communication sortante (envoi de messages)

| Service | Fichier | Role |
|---------|---------|------|
| **OutboundRouterService** | `communication_whapi/outbound-router.service.ts` | Routeur intelligent : choisit WhAPI ou Meta selon le channel du chat |
| **CommunicationWhapiService** | `communication_whapi/communication_whapi.service.ts` | Envoi via WhAPI avec retry exponentiel (250ms * 2^attempt, max 2) |
| **CommunicationMetaService** | `communication_whapi/communication_meta.service.ts` | Envoi via Meta Graph API avec retry exponentiel identique |

### 4. Services métier principaux

| Service | Fichier | Role |
|---------|---------|------|
| **WhatsappMessageService** | `whatsapp_message/whatsapp_message.service.ts` | **Service central**. Persistence messages entrants/sortants, mise à jour statuts (sent/delivered/read/failed), gestion erreurs, requêtes paginées |
| **WhatsappChatService** | `whatsapp_chat/whatsapp_chat.service.ts` | CRUD conversations, compteur unread, marquage lu, verrouillage read_only |
| **WhatsappCommercialService** | `whatsapp_commercial/whatsapp_commercial.service.ts` | Gestion agents : CRUD, statut connecté/déconnecté, dashboard productivité, reset password |
| **WhatsappPosteService** | `whatsapp_poste/whatsapp_poste.service.ts` | Gestion postes de travail : activation/désactivation, blocage queue |
| **ChannelService** | `channel/channel.service.ts` | Gestion channels WhatsApp, résolution tenant, mapping provider |
| **ContactService** | `contact/contact.service.ts` | CRUD contacts clients, upsert par téléphone, suivi appels |
| **WhatsappMediaService** | `whatsapp_media/whatsapp_media.service.ts` | Stockage médias (images, vidéos, documents) liés aux messages |

### 5. Messages automatiques

| Service | Fichier | Role |
|---------|---------|------|
| **MessageAutoService** | `message-auto/message-auto.service.ts` | Templates de réponses automatiques avec placeholders (#name#, #numero#) |
| **AutoMessageOrchestrator** | `message-auto/auto-message-orchestrator.service.ts` | Séquences multi-étapes avec délais humains (20-45s), verrous anti-doublon |

### 6. Authentification

| Service | Fichier | Role |
|---------|---------|------|
| **BaseAuthService** | `auth/shared/base-auth.service.ts` | Template abstrait : validate, login (JWT access + refresh) |
| **AuthService** | `auth/auth.service.ts` | Auth commerciaux (token 7j, inclut posteId) |
| **AuthAdminService** | `auth_admin/auth_admin.service.ts` | Auth admin (access 15min, refresh 7j) |

### 7. Monitoring et Analytics

| Service | Fichier | Role |
|---------|---------|------|
| **MetriquesService** | `metriques/metriques.service.ts` | Moteur analytics complet : messages, chats, agents, contacts, postes, channels, performance temporelle, queue |
| **AppService** | `app.service.ts` | Health check + stats globales |
| **AppLogger** | `logging/app-logger.service.ts` | Logging configurable par niveau |

### 8. Socket.IO temps réel

| Service | Fichier | Role |
|---------|---------|------|
| **WhatsappMessageGateway** | `whatsapp_message/whatsapp_message.gateway.ts` | **Gateway principal**. Gère connexion agents, room multi-tenant, émission messages/statuts/typing, envoi messages sortants |
| **SocketThrottleGuard** | `whatsapp_message/guards/socket-throttle.guard.ts` | Rate limit par client:event (token bucket) |

---

## SERVICES STUBS (non implémentés)

Ces services ont uniquement des méthodes CRUD vides sans logique :

| Service | Fichier |
|---------|---------|
| WhatsappButtonService | `whatsapp_button/whatsapp_button.service.ts` |
| WhatsappChatLabelService | `whatsapp_chat_label/whatsapp_chat_label.service.ts` |
| WhatsappContactsService | `whatsapp_contacts/whatsapp_contacts.service.ts` |
| WhatsappCustomerService | `whatsapp_customer/whatsapp_customer.service.ts` |
| WhatsappErrorService | `whatsapp_error/whatsapp_error.service.ts` |
| WhatsappLastMessageService | `whatsapp_last_message/whatsapp_last_message.service.ts` |
| WhatsappMessageContentService | `whatsapp_message_content/whatsapp_message_content.service.ts` |
| CommercialMetricsService | `whatsapp_commercial/commercial_metrics.service.ts` |
| LocksService | `dispatcher/services/locks.service.ts` |
| TasksService | `jorbs/tasks.service.ts` |

---

## ENTITES (Tables BD)

| Entité | Table | Description |
|--------|-------|-------------|
| WhatsappMessage | `whatsapp_message` | Messages (id, external_id, chat_id, direction, status, texte, error_code, error_title) |
| WhatsappChat | `whatsapp_chat` | Conversations (chat_id, poste_id, tenant_id, status, unread_count, read_only) |
| WhatsappCommercial | `whatsapp_commercial` | Agents (email, name, password, salt, poste_id, isConnected) |
| WhatsappPoste | `whatsapp_poste` | Postes de travail (name, code, is_active, is_queue_enabled) |
| WhapiChannel | `whapi_channels` | Channels WhAPI (channel_id, token, api_version) |
| ProviderChannel | `channels` | Channels multi-provider (provider, external_id, tenant_id, channel_id) |
| QueuePosition | `queue_positions` | File d'attente (poste_id, position) |
| Contact | `contact` | Contacts clients (phone, name, chat_id, call_status) |
| WhatsappMedia | `whatsapp_media` | Médias (media_type, url, mime_type, caption) |
| MessageAuto | `message_auto` | Templates auto-réponse (position, body, enabled) |
| Admin | `admin` | Admins (email, name, password) |
| DispatchSettings | `dispatch_settings` | Config dispatcher |
| DispatchSettingsAudit | `dispatch_settings_audit` | Audit modifications config |
| WebhookEventLog | `webhook_event_log` | Log déduplications webhook |

---

## CONTROLLERS (15)

| Controller | Routes principales |
|------------|-------------------|
| AppController | Health check |
| WhatsappChatController | CRUD conversations |
| WhatsappMessageController | CRUD messages |
| WhatsappPosteController | Gestion postes |
| ChannelController | Gestion channels |
| MessageAutoController | Templates auto-réponse |
| CommunicationWhapiController | Ingestion webhooks |
| ContactController | CRUD contacts |
| MetriquesController | Requêtes analytics |
| DispatcherController | Diagnostics dispatcher |
| WhatsappCommercialController | Gestion agents |
| WhapiController | Récepteur webhook WhAPI |
| WebhookMetricsController | Métriques Prometheus |
| AuthController | Login/token commerciaux |
| AuthAdminController | Login/token admin |

---

## GATEWAYS SOCKET.IO

| Gateway | Utilisé | Description |
|---------|---------|-------------|
| **WhatsappMessageGateway** | OUI | Gateway principal : connexion agents, messages, typing, statuts |
| WhatsappChatGateway | NON | Stub vide |
| WhatsappLastMessageGateway | NON | Stub vide |
| WhatsappChatLabelGateway | NON | Stub vide |
| WhatsappContactsGateway | NON | Stub vide |
| WhatsappCustomerGateway | NON | Stub vide |
| WhatsappErrorGateway | NON | Stub vide |
| WhatsappMediaGateway | NON | Stub vide |
| WhatsappMessageContentGateway | NON | Stub vide |
| WhatsappButtonGateway | NON | Stub vide |

---

## CRONS ACTIFS

| Job | Schedule | Action |
|-----|----------|--------|
| Purge idempotency | `0 3 * * *` (3h AM) | Supprime événements webhook > 14 jours |
| Read-only enforcement | Toutes les 10 min | Verrouille conversations sans réponse > 24h |
| Offline reinject | `0 9 * * *` (9h) | Réinjecte conversations assignées à agents offline |
| SLA timeout | Configurable | Réassigne conversations sans première réponse > 5 min |

---

## MODULES (26)

1. AppModule (root)
2. WhatsappMessageModule
3. WhatsappChatModule
4. WhatsappCommercialModule
5. WhatsappPosteModule
6. WhapiModule
7. DispatcherModule
8. CommunicationWhapiModule
9. ChannelModule
10. ContactModule
11. MessageAutoModule
12. MetriquesModule
13. AuthModule
14. AuthAdminModule
15. AdminModule
16. DatabaseModule
17. LoggingModule
18. JorbsModule
19. WhatsappMediaModule
20. WhatsappErrorModule
21. WhatsappChatLabelModule
22. WhatsappButtonModule
23. WhatsappContactsModule
24. WhatsappCustomerModule
25. WhatsappLastMessageModule
26. WhatsappMessageContentModule

---

## CONSTATS

### Points forts
- Pipeline d'ingestion robuste (idempotence, circuit breaker, rate limiting, métriques Prometheus)
- Dispatch thread-safe avec mutex et stratégie least-loaded
- Multi-provider transparent (WhAPI + Meta) avec routage automatique
- Auto-messages avec délais humains réalistes
- Authentification séparée commerciaux/admin avec JWT

### Points faibles
- **10 services stubs** qui ne font rien
- **9 gateways inutiles** (seul WhatsappMessageGateway est utilisé)
- Multi-tenancy ajouté tardivement (tenant_id manquait dans le dispatcher)
- DI fragile : 3 modules redéclarent WhatsappMessageService directement au lieu d'importer le module
- TasksService/JorbsModule entièrement commenté

---

*Généré le 16/02/2026*
