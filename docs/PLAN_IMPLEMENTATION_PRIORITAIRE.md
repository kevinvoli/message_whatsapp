# Plan D'Implementation Prioritaire (Whapi + Meta)

Date: 2026-02-14

## 1) Ordre d'implementation exact (jour par jour)

Hypothese: migration progressive, zero downtime, sans queue immediate.

### Jour 1 - Branching et garde-fous
1. Ajouter des feature flags:
- `FF_UNIFIED_WEBHOOK_ROUTER=false`
- `FF_PROVIDER_META_ENABLED=false`
- `FF_ENFORCE_TENANT_DB_RESOLUTION=false`
2. Ajouter instrumentation minimale:
- Compteurs par provider (`webhook_received_total`, `webhook_failed_total`, `webhook_duplicate_total`)
- Latence p95 webhook.
3. Merge en premier:
- PR `infra/feature-flags-and-metrics` (sans impact fonctionnel).

### Jour 2 - Schema DB additive uniquement
1. Migration SQL additive (pas de rename/drop):
- `channels`: ajouter `provider`, `tenant_id`, `external_id`.
- `whatsapp_message`: ajouter `tenant_id`, `provider`, `provider_message_id`.
- `whatsapp_chat`: ajouter `tenant_id`, `provider`.
- `whatsapp_media`: ajouter `tenant_id`, `provider`, `provider_media_id`.
- `webhook_event_log`: ajouter `tenant_id`, `provider_message_id`, `payload_hash`.
2. Ajouter index non bloquants:
- `IDX_msg_tenant_chat (tenant_id, chat_id)`
- `IDX_msg_tenant_provider_msgid (tenant_id, provider, provider_message_id)`
- `IDX_webhook_tenant_provider_key (tenant_id, provider, event_key)`
3. Deploy:
- deploy DB migration seule.
4. Merge:
- PR `db/additive-multi-provider-columns`.

### Jour 3 - Unified model + adapters (sans bascule)
1. Creer:
- `UnifiedMessage`, `UnifiedStatus`
- `WhapiAdapter`, `MetaAdapter`
- `WebhookRouterService`
2. Ne pas remplacer le flux existant.
3. Ajouter tests unitaires adapters.
4. Merge:
- PR `webhook/unified-model-and-adapters`.
5. Deploy:
- code deploy avec flags OFF.

### Jour 4 - InboundMessageService (double path)
1. Extraire logique de `handleIncomingMessage()` vers `InboundMessageService`.
2. Garder ancien chemin actif.
3. Ajouter mode shadow:
- Router traite payload, appelle unified pipeline en "dry-run" (sans write) et compare resultats logs.
4. Merge:
- PR `domain/inbound-message-service-shadow-mode`.
5. Deploy:
- flags OFF + shadow ON en staging uniquement.

### Jour 5 - Backfill + validations tenant
1. Script backfill:
- remplir `tenant_id/provider/provider_message_id/provider_media_id` depuis donnees existantes.
2. Ajouter validation stricte:
- resolution tenant uniquement via DB (`provider + channel external id`).
3. Merge:
- PR `security/tenant-resolution-hardening`.
4. Deploy:
- prod deploy avec `FF_ENFORCE_TENANT_DB_RESOLUTION=true`.

### Jour 6 - Bascule progressive Whapi
1. Activer `FF_UNIFIED_WEBHOOK_ROUTER=true` pour 5% trafic Whapi.
2. Observer 2-4h:
- taux erreur, latence, duplicates, ecarts de persistance.
3. Monter 25% -> 50% -> 100% si stable.
4. Merge:
- PR `rollout/unified-router-whapi`.

### Jour 7 - Activation Meta en production
1. Pre-check:
- signature Meta stricte active
- token verify valide
- mapping channel -> tenant complet en DB
2. Activer `FF_PROVIDER_META_ENABLED=true` sur un petit tenant pilote.
3. Observer 24h.
4. Etendre a tous les tenants.
5. Merge:
- PR `rollout/meta-provider-prod`.

## 2) Ordre de merge recommande
1. `infra/feature-flags-and-metrics`
2. `db/additive-multi-provider-columns`
3. `webhook/unified-model-and-adapters`
4. `domain/inbound-message-service-shadow-mode`
5. `security/tenant-resolution-hardening`
6. `rollout/unified-router-whapi`
7. `rollout/meta-provider-prod`

## 3) Quand deployer
1. Apres chaque PR, mais avec flags OFF tant que le risque est fonctionnel.
2. DB deploy avant code qui depend des nouvelles colonnes.
3. Bascule fonctionnelle uniquement apres phase shadow + metriques saines.

## 4) Quand migrer la DB
1. Migration additive au debut (Jour 2).
2. Backfill avant activation stricte tenant (Jour 5).
3. Contraintes fortes (NOT NULL / uniques finales) seulement apres stabilisation prod (1-2 semaines).

## 5) Quand activer Meta en prod
1. Seulement apres:
- unified router stable a 100% sur Whapi
- tenant resolution DB-only active
- tests signature/replay valides
2. Activation par tenant pilote, puis progressive.

## 6) Migration progressive (dette technique controllee)
1. Accepter temporairement double schema (anciennes + nouvelles colonnes).
2. Accepter temporairement double pipeline (legacy + unified shadow).
3. Interdire nouveaux couplages Whapi-specific pendant la migration.
4. Definir date de suppression du legacy (max 4 semaines apres stabilisation).

