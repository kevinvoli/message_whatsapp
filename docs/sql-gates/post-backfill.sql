-- SQL Gate - Post-backfill checks (Phase A P1)
-- Date: 2026-02-14

-- 1) tenant_id filled for channels
SELECT COUNT(*) AS channels_without_tenant
FROM whapi_channels
WHERE tenant_id IS NULL OR tenant_id = '';

-- 2) tenant_id filled for chats
SELECT COUNT(*) AS chats_without_tenant
FROM whatsapp_chat
WHERE tenant_id IS NULL OR tenant_id = '';

-- 3) tenant_id filled for messages
SELECT COUNT(*) AS messages_without_tenant
FROM whatsapp_message
WHERE tenant_id IS NULL OR tenant_id = '';

-- 4) tenant_id filled for media
SELECT COUNT(*) AS medias_without_tenant
FROM whatsapp_media
WHERE tenant_id IS NULL OR tenant_id = '';

-- 5) tenant_id filled for event log (best-effort)
SELECT COUNT(*) AS eventlog_without_tenant
FROM webhook_event_log
WHERE tenant_id IS NULL OR tenant_id = '';

-- 6) tenant/chat collisions
SELECT tenant_id, chat_id, COUNT(*) c
FROM whatsapp_chat
GROUP BY tenant_id, chat_id
HAVING c > 1;

-- 7) tenant/provider/message_id/direction collisions
SELECT tenant_id, provider, provider_message_id, direction, COUNT(*) c
FROM whatsapp_message
GROUP BY tenant_id, provider, provider_message_id, direction
HAVING c > 1;
