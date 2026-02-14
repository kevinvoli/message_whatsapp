-- SQL Gate - Pre-migration checks (Phase A P1)
-- Date: 2026-02-14

-- 1) Channels duplicates
SELECT channel_id, COUNT(*) c
FROM whapi_channels
GROUP BY channel_id
HAVING c > 1;

-- 2) Channels uniqueness (provider, external_id)
SELECT provider, external_id, COUNT(*) c
FROM whapi_channels
GROUP BY provider, external_id
HAVING c > 1;

-- 3) Messages duplicates (legacy)
SELECT message_id, COUNT(*) c
FROM whatsapp_message
GROUP BY message_id
HAVING c > 1;

-- 4) Webhook event keys duplicates (legacy)
SELECT event_key, COUNT(*) c
FROM webhook_event_log
GROUP BY event_key
HAVING c > 1;
