-- =====================================================================
-- SEED DE DÉVELOPPEMENT — Base de données whatsappflow
-- Fournit les données minimales pour tester les 5 providers
-- Idempotent : peut être relancé sans risque (ON DUPLICATE KEY UPDATE)
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── UUIDs fixes (reproductibles) ────────────────────────────────────
SET @tenant_id     = '00000000-0000-0000-0000-000000000001';
SET @poste_id      = '00000000-0000-0000-0000-000000000010';
SET @commercial_id = '00000000-0000-0000-0000-000000000020';
SET @dispatch_id   = '00000000-0000-0000-0000-000000000099';

-- whapi_channels (WhapiChannel) — un par provider
SET @ch_whapi_id     = '00000000-0000-0000-0000-000000000100';
SET @ch_meta_id      = '00000000-0000-0000-0000-000000000101';
SET @ch_messenger_id = '00000000-0000-0000-0000-000000000102';
SET @ch_instagram_id = '00000000-0000-0000-0000-000000000103';
SET @ch_telegram_id  = '00000000-0000-0000-0000-000000000104';

-- channels (ProviderChannel) — mapping tenant <-> provider+external_id
SET @pc_whapi_id     = '00000000-0000-0000-0000-000000000200';
SET @pc_meta_id      = '00000000-0000-0000-0000-000000000201';
SET @pc_messenger_id = '00000000-0000-0000-0000-000000000202';
SET @pc_instagram_id = '00000000-0000-0000-0000-000000000203';
SET @pc_telegram_id  = '00000000-0000-0000-0000-000000000204';


-- =====================================================================
-- 1. POSTE (station de travail)
--    Requis : les chats et messages y sont rattachés
-- =====================================================================
INSERT INTO whatsapp_poste
  (id, code, name, is_active, is_queue_enabled, created_at, updated_at)
VALUES
  (@poste_id, 'SC-TEST', 'Service Client Test', true, true, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  updated_at = NOW();


-- =====================================================================
-- 2. COMMERCIAL / AGENT
--    Mot de passe placeholder (bcrypt) — suffisant pour les tests
-- =====================================================================
INSERT INTO whatsapp_commercial
  (id, email, name, password, salt, poste_id, isConnected, created_at, updated_at)
VALUES (
  @commercial_id,
  'agent@test.com',
  'Agent Test',
  '$2b$10$dev.placeholder.hash.for.testing.only',
  'dev-salt',
  @poste_id,
  false,
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  name       = VALUES(name),
  updated_at = NOW();


-- =====================================================================
-- 3. DISPATCH SETTINGS (singleton de configuration)
--    Nécessaire pour que le dispatcher ne plante pas
-- =====================================================================
INSERT INTO dispatch_settings (
  id,
  no_reply_reinject_interval_minutes,
  read_only_check_interval_minutes,
  offline_reinject_cron,
  auto_message_enabled,
  auto_message_delay_min_seconds,
  auto_message_delay_max_seconds,
  auto_message_max_steps,
  created_at, updated_at
)
VALUES (
  @dispatch_id,
  5, 10, '0 9 * * *', false, 20, 45, 3,
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE id = id;


-- =====================================================================
-- 4. WHAPI_CHANNELS (WhapiChannel)
--    Table principale des canaux (config, token, metadata)
--    Chaque provider a sa propre ligne identifiée par channel_id
--
--    Champs Whapi-spécifiques (start_at, uptime, device_id, ip, etc.)
--    sont mis à 0 / valeurs neutres pour les providers non-Whapi
-- =====================================================================

-- ── Whapi ─────────────────────────────────────────────────────────────
INSERT INTO whapi_channels (
  id, tenant_id, label, provider, external_id, channel_id,
  token, token_expires_at,
  start_at, uptime, version, device_id, ip, is_business,
  api_version, core_version,
  createdAt, updatedAt
) VALUES (
  @ch_whapi_id, @tenant_id,
  '[TEST] WhatsApp — Whapi', 'whapi', 'BATMAN-P8CHE', 'BATMAN-P8CHE',
  'e2e-whapi-token-dev', NULL,
  0, 0, '1.0', 0, '127.0.0.1', false,
  '2.33.0', '2.33.0',
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  label = VALUES(label), updatedAt = NOW();

-- ── Meta WhatsApp Cloud API ───────────────────────────────────────────
INSERT INTO whapi_channels (
  id, tenant_id, label, provider, external_id, channel_id,
  token, token_expires_at,
  start_at, uptime, version, device_id, ip, is_business,
  api_version, core_version,
  createdAt, updatedAt
) VALUES (
  @ch_meta_id, @tenant_id,
  '[TEST] WhatsApp — Meta Cloud', 'meta', 'e2e-shadow-channel', 'e2e-shadow-channel',
  'e2e-meta-token-dev', NULL,
  0, 0, '1.0', 0, '127.0.0.1', true,
  'v22.0', '1.0',
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  label = VALUES(label), updatedAt = NOW();

-- ── Facebook Messenger ────────────────────────────────────────────────
--    external_id = channel_id = page_id (entry[0].id dans le payload)
INSERT INTO whapi_channels (
  id, tenant_id, label, provider, external_id, channel_id,
  token, token_expires_at,
  start_at, uptime, version, device_id, ip, is_business,
  api_version, core_version,
  createdAt, updatedAt
) VALUES (
  @ch_messenger_id, @tenant_id,
  '[TEST] Facebook Messenger', 'messenger', 'test-page-id', 'test-page-id',
  'e2e-messenger-token-dev', NULL,
  0, 0, '1.0', 0, '127.0.0.1', true,
  'v22.0', '1.0',
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  label = VALUES(label), updatedAt = NOW();

-- ── Instagram Direct ──────────────────────────────────────────────────
--    external_id = channel_id = ig_account_id (entry[0].id dans le payload)
INSERT INTO whapi_channels (
  id, tenant_id, label, provider, external_id, channel_id,
  token, token_expires_at,
  start_at, uptime, version, device_id, ip, is_business,
  api_version, core_version,
  createdAt, updatedAt
) VALUES (
  @ch_instagram_id, @tenant_id,
  '[TEST] Instagram Direct', 'instagram', 'test-ig-account-id', 'test-ig-account-id',
  'e2e-instagram-token-dev', NULL,
  0, 0, '1.0', 0, '127.0.0.1', true,
  'v22.0', '1.0',
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  label = VALUES(label), updatedAt = NOW();

-- ── Telegram ──────────────────────────────────────────────────────────
--    external_id = channel_id = bot_id (paramètre :botId dans l'URL)
INSERT INTO whapi_channels (
  id, tenant_id, label, provider, external_id, channel_id,
  token, token_expires_at,
  start_at, uptime, version, device_id, ip, is_business,
  api_version, core_version,
  createdAt, updatedAt
) VALUES (
  @ch_telegram_id, @tenant_id,
  '[TEST] Telegram Bot', 'telegram', 'test-bot-id', 'test-bot-id',
  'e2e-telegram-token-dev', NULL,
  0, 0, '1.0', 0, '127.0.0.1', false,
  '1.0', '1.0',
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  label = VALUES(label), updatedAt = NOW();


-- =====================================================================
-- 5. CHANNELS (ProviderChannel)
--    Table de mapping tenant_id <-> (provider, external_id)
--    Utilisée par resolveTenantOrReject() dans le webhook controller
--
--    external_id doit correspondre exactement à ce que le webhook extrait :
--      whapi     → payload.channel_id
--      meta      → metadata.phone_number_id
--      messenger → entry[0].id (page_id)
--      instagram → entry[0].id (ig_account_id)
--      telegram  → :botId (paramètre URL)
-- =====================================================================

INSERT INTO channels
  (id, tenant_id, provider, external_id, channel_id, status, created_at, updated_at)
VALUES
  (@pc_whapi_id,     @tenant_id, 'whapi',     'BATMAN-P8CHE',        'BATMAN-P8CHE',        'active', NOW(), NOW()),
  (@pc_meta_id,      @tenant_id, 'meta',      'e2e-shadow-channel',  'e2e-shadow-channel',  'active', NOW(), NOW()),
  (@pc_messenger_id, @tenant_id, 'messenger', 'test-page-id',        'test-page-id',        'active', NOW(), NOW()),
  (@pc_instagram_id, @tenant_id, 'instagram', 'test-ig-account-id',  'test-ig-account-id',  'active', NOW(), NOW()),
  (@pc_telegram_id,  @tenant_id, 'telegram',  'test-bot-id',         'test-bot-id',         'active', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  updated_at = NOW();


SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- VÉRIFICATION — À exécuter après le seed pour valider
-- =====================================================================
SELECT
  'whapi_channels' AS `table`,
  COUNT(*) AS `total`,
  GROUP_CONCAT(CONCAT(provider, ':', channel_id) ORDER BY provider SEPARATOR ' | ') AS `canaux`
FROM whapi_channels
WHERE channel_id IN ('BATMAN-P8CHE','e2e-shadow-channel','test-page-id','test-ig-account-id','test-bot-id')

UNION ALL

SELECT
  'channels (ProviderChannel)',
  COUNT(*),
  GROUP_CONCAT(CONCAT(provider, ':', external_id) ORDER BY provider SEPARATOR ' | ')
FROM channels
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'

UNION ALL

SELECT 'whatsapp_poste', COUNT(*), GROUP_CONCAT(CONCAT(code, ':', name))
FROM whatsapp_poste WHERE id = '00000000-0000-0000-0000-000000000010';
