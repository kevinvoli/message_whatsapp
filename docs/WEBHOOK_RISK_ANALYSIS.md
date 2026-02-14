# Analyse technique – Migration multi‑provider (Whapi + Meta)

Date: 2026-02-14

Ce document répond point par point aux 10 questions demandées. Il se base sur l’état actuel du code et du schéma TypeORM.

## 1) Est‑ce que ma base de données actuelle va poser problème ?

### Tables trop couplées à Whapi
- `whapi_channels` (`WhapiChannel`) : nom, colonnes et relations centrés sur Whapi. Couplage fort au provider.
- `whapi_user` (`WhapiUser`) : table dédiée Whapi.
- `whatsapp_media.whapi_media_id` : nom et sémantique Whapi‑specific.
- `whatsapp_message.channel_id` + relation vers `WhapiChannel` via `channel_id` : empêche la coexistence multi‑provider.
- `whatsapp_chat.channel_id` + relation vers `WhapiChannel` : même problème.
- `whatsapp_message.source` : valeurs actuelles (ex: `whapi`, `whatsapp_business`) non normalisées.

### Migrations SQL nécessaires (schéma cible multi‑provider)
1. **Créer une table `channels` générique** (ou renommer `whapi_channels`):
   - Ajouter colonnes `provider`, `tenant_id`, `external_id`, `waba_id` (optionnel), `phone_number_id` (optionnel).
   - Contraintes uniques: `(provider, external_id)` et `(tenant_id, provider, external_id)`.
2. **Ajouter `tenant_id` sur les tables métier** :
   - `whatsapp_message`, `whatsapp_chat`, `whatsapp_media`, `contact`, `whatsapp_message_content`, `whatsapp_contact`.
3. **Normaliser `whapi_media_id`** :
   - Renommer en `provider_media_id` (ou ajouter et backfill).
4. **Dédoublonner les `chat_id`** :
   - Les `chat_id` sont uniques globalement. En multi‑tenant, passer à `(tenant_id, chat_id)`.

### Risque de perte de données
- **Risque faible** si migration additive + backfill.
- **Risque élevé** si renommer/droper des colonnes avant backfill ou si contraintes uniques changent sans double‑écriture.

### Plan de migration sans downtime
1. **Phase 0 – Préparation**
   - Ajouter colonnes `tenant_id`, `provider`, `external_id`, `provider_media_id` en `NULL`.
   - Ajouter index non‑uniques sur `tenant_id`.
2. **Phase 1 – Backfill**
   - Remplir `tenant_id` via mapping `channel_id -> tenant`.
   - Remplir `provider = 'whapi'` pour données existantes.
   - Copier `whapi_media_id` vers `provider_media_id`.
3. **Phase 2 – Double écriture**
   - Application écrit les nouvelles colonnes en plus des anciennes.
4. **Phase 3 – Bascule de lecture**
   - Lire via `(tenant_id, provider, external_id)`.
5. **Phase 4 – Nettoyage**
   - Mettre contraintes uniques finales.
   - Déprécier colonnes Whapi‑specific.

## 2) Où sont les risques de régression si je déplace `handleIncomingMessage()` ?

### Risques majeurs
- Changement d’ordre des effets secondaires (assignation → sauvegarde → media → gateway).
- Perte de la logique `ignore self message` (`from_me`).
- Modification des `traceId` ou logs (debugging impacté).
- Perte de la déduplication (si `isReplayEvent` n’est pas exécuté au même moment).
- Duplication d’événements si l’adapter change la structure des IDs.

### Effets secondaires possibles
- Messages enregistrés sans conversation assignée.
- Chats créés avec mauvais `channel_id`.
- Double notification gateway.
- Médias orphelins.

### Tests à écrire avant migration
- **Unitaires** sur:
  - `DispatcherService.assignConversation()` (chat existant, agent offline, read_only, etc.).
  - `WhatsappMessageService.saveIncomingFromWhapi()` (déduplication, channel existant, contact).
- **Intégration**:
  - Flux webhook complet (message entrant + status update).
- **Idempotency**:
  - Même message envoyé deux fois -> 1 insert.
- **Gateway**:
  - Vérifier `notifyNewMessage` est appelé une seule fois.

## 3) Idempotency solide ?

### État actuel
- Table `webhook_event_log` dédupe via `event_key` + `provider`.
- `event_key` est construit avec `provider + channel_id + event.type + message.id` ou `status.id`.

### Limites actuelles
- Si un provider ne fournit pas `message.id`, fallback sur hash du payload -> fragile.
- Les collisions de `event_key` sont possibles si `channel_id` est réutilisé entre tenants.
- Pas de déduplication cross‑event (ex: message + status dans des payloads différents).

### Stratégie robuste (multi‑provider)
- Clé idempotency composée: `tenant_id + provider + provider_message_id + event_type + direction`.
- Stocker aussi `payload_hash` et `provider_event_id` si disponible.
- Ajouter un TTL (ex: 7–14 jours) pour éviter croissance infinie.
- En cas d’absence d’ID, déduper sur `(hash(payload), timestamp_bucket)`.

## 4) Suis‑je vraiment protégé côté Meta ?

### Analyse de la signature actuelle
- `x-hub-signature-256` est vérifiée via HMAC SHA‑256.
- Utilise `rawBody` si disponible, fallback `JSON.stringify(payload)`.

### Failles possibles
- Si `WHATSAPP_APP_SECRET` est absent, la vérification est désactivée.
- Si `rawBody` est mal configuré, `JSON.stringify` peut altérer l’ordre JSON -> signature invalide.
- Pas de validation de timestamp/replay.

### Recommandations
- En production, exiger `WHATSAPP_APP_SECRET` (fail‑closed).
- Vérifier la présence de `rawBody` avant traitement.
- Logguer les tentatives invalides avec rate‑limit.
- Optionnel: inclure validation du `phone_number_id` par tenant.

## 5) Attaques possibles en SaaS multi‑tenant

- **Replay attack**: ré‑envoi d’anciens webhooks.
- **Flood**: surcharger le endpoint avec 10k+ req/s.
- **Fake tenant resolution**: injection d’un `channel_id` appartenant à un autre tenant.
- **Injection**: contenu malformé dans champs texte.
- **Brute‑force signature**: si secrets faibles ou pas de rate‑limit.

## 6) Capacité à 10k messages/min

### Bottlenecks probables
- Accès DB multiples par message (assignConversation + save message + save media + update chat + fetch relations).
- Gateway WebSocket pour chaque message.
- Déduplication `webhook_event_log` (write + unique check).

### Recommandations
- Introduire une queue (BullMQ/RabbitMQ) pour traiter async.
- Acknowledge le webhook rapidement (200 OK) puis traiter en worker.
- Batch d’écriture media + messages si possible.
- Index DB sur `(tenant_id, chat_id)`, `(tenant_id, channel_id)`, `(message_id)`.

## 7) Faut‑il passer event‑driven ?

### Oui, pour la scalabilité
- Introduire un `EventBus` après normalisation (ex: `InboundMessageReceived`).
- Découpler:
  - Dispatching
  - Persistence
  - Media processing
  - Notification gateway

### Où introduire EventBus
- Dans `InboundMessageService` juste après normalisation.
- Utiliser un broker externe pour la résilience (RabbitMQ, Kafka).

## 8) Mon système tenant est‑il safe ?

### Constats
- `resolveTenant()` n’existe pas dans le code actuel.
- `channel_id` est utilisé directement sans vérification tenant.

### Risques
- Spoofing: si un payload externe fournit un `channel_id` valide d’un autre tenant.

### Recommandations
- Résoudre `tenant_id` uniquement via DB (`channel_id` + `provider`).
- Rejeter si `channel_id` inconnu ou ne correspond pas au tenant attendu.
- Ajouter un secret/verify_token par tenant pour Whapi.

## 9) Isolation forte des données

- Ajouter `tenant_id` à toutes les tables principales.
- Faire toutes les requêtes avec `tenant_id` en condition.
- Ajouter contraintes uniques `(tenant_id, chat_id)` et `(tenant_id, message_id)`.
- Pour isolation forte: DB par tenant ou schema par tenant + RLS.

## 10) Plan de test avant migration

- **Unit tests**: adapters Whapi/Meta -> UnifiedMessage.
- **Integration tests**: webhook -> DB + gateway.
- **Idempotency tests**: même payload deux fois -> 1 insert.
- **Load tests**: 10k msg/min avec métriques latence + DB.
- **Security tests**: signature invalides, replay, flood.

## CTO: 5 plus grandes inquiétudes (production 1000 SaaS clients)

1. **Isolation multi‑tenant** insuffisante (risque fuite de données).
2. **Scalabilité DB** (trop d’écritures sync par message).
3. **Idempotency** fragile face aux replays/floods.
4. **Absence de queue** (risque de timeouts ou retards).
5. **Observabilité limitée** (pas de tracing par tenant/provider).

## Si je recommence sans dette technique (architecture idéale)

- Micro‑service “Webhook Ingestion” (stateless, rate‑limit, signature check).
- Pipeline event‑driven (Kafka/RabbitMQ) avec topics par provider.
- Service “Message Normalization” -> UnifiedMessage.
- Service “Conversation Dispatcher”.
- Service “Persistence + Media”.
- DB multi‑tenant avec isolation stricte (RLS ou DB par tenant).
- Tracing distribué (OpenTelemetry) + logs structurés.

---

Fichier cible: `docs/WEBHOOK_RISK_ANALYSIS.md`
