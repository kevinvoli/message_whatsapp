# SQL Gates - Backfill tenant_id (preprod/prod)

Date: 2026-02-14
Scope: migration multi-tenant webhook (Phase A P1)

## Pre-checks (avant backfill)
```sql
-- Channels dupliques (doit etre 0 avant d'appliquer contraintes)
SELECT channel_id, COUNT(*) c
FROM whapi_channels
GROUP BY channel_id
HAVING c > 1;

-- Messages dupliques (legacy)
SELECT message_id, COUNT(*) c
FROM whatsapp_message
GROUP BY message_id
HAVING c > 1;

-- Webhook event keys dupliques (legacy)
SELECT event_key, COUNT(*) c
FROM webhook_event_log
GROUP BY event_key
HAVING c > 1;

-- Unicite contractuelle channels (provider, external_id)
SELECT provider, external_id, COUNT(*) c
FROM whapi_channels
GROUP BY provider, external_id
HAVING c > 1;
```

## Post-backfill checks (bloquants)
```sql
-- 1) tenant_id rempli pour channels
SELECT COUNT(*) AS channels_without_tenant
FROM whapi_channels
WHERE tenant_id IS NULL OR tenant_id = '';

-- 2) tenant_id rempli pour chats
SELECT COUNT(*) AS chats_without_tenant
FROM whatsapp_chat
WHERE tenant_id IS NULL OR tenant_id = '';

-- 3) tenant_id rempli pour messages
SELECT COUNT(*) AS messages_without_tenant
FROM whatsapp_message
WHERE tenant_id IS NULL OR tenant_id = '';

-- 4) tenant_id rempli pour medias
SELECT COUNT(*) AS medias_without_tenant
FROM whatsapp_media
WHERE tenant_id IS NULL OR tenant_id = '';

-- 5) event log tenant_id rempli (best-effort)
SELECT COUNT(*) AS eventlog_without_tenant
FROM webhook_event_log
WHERE tenant_id IS NULL OR tenant_id = '';
```

## Post-backfill checks (collisions a corriger)
```sql
-- Collision potentielle sur future cle whatsapp_chat
SELECT tenant_id, chat_id, COUNT(*) c
FROM whatsapp_chat
GROUP BY tenant_id, chat_id
HAVING c > 1;

-- Collision potentielle sur future cle whatsapp_message
SELECT tenant_id, provider, provider_message_id, direction, COUNT(*) c
FROM whatsapp_message
GROUP BY tenant_id, provider, provider_message_id, direction
HAVING c > 1;
```

## Scripts SQL (fichiers)
- `docs/sql-gates/pre-migration.sql`
- `docs/sql-gates/post-backfill.sql`

## Post-backfill checks (channels uniques)
```sql
-- Unicite contractuelle channels
SELECT provider, external_id, COUNT(*) c
FROM whapi_channels
GROUP BY provider, external_id
HAVING c > 1;
```

## Sampling rapide (manuel)
```sql
-- Channels sans tenant (echantillon)
SELECT id, channel_id, tenant_id
FROM whapi_channels
WHERE tenant_id IS NULL OR tenant_id = ''
LIMIT 20;

-- Chats orphelins tenant
SELECT chat_id, channel_id, tenant_id
FROM whatsapp_chat
WHERE tenant_id IS NULL OR tenant_id = ''
LIMIT 20;

-- Messages orphelins tenant
SELECT id, chat_id, tenant_id
FROM whatsapp_message
WHERE tenant_id IS NULL OR tenant_id = ''
LIMIT 20;

-- Medias orphelins tenant
SELECT id, message_id, tenant_id
FROM whatsapp_media
WHERE tenant_id IS NULL OR tenant_id = ''
LIMIT 20;

-- Event log orphelin (best-effort)
SELECT id, event_key, tenant_id
FROM webhook_event_log
WHERE tenant_id IS NULL OR tenant_id = ''
LIMIT 20;
```
