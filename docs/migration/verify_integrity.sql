-- ============================================================
-- Dry-run integrity checks — Master V2
-- Lancer sur la DB cible après migration:run
-- Critères Go/NoGo dans les commentaires de chaque check
-- ============================================================

-- ── 1. Comptes de référence ──────────────────────────────────

SELECT 'COUNT_COMMERCIAL'       AS check_name, COUNT(*) AS value FROM whatsapp_commercial;
SELECT 'COUNT_MESSAGE'          AS check_name, COUNT(*) AS value FROM whatsapp_message;
SELECT 'COUNT_CHAT'             AS check_name, COUNT(*) AS value FROM whatsapp_chat;
SELECT 'COUNT_CHANNEL'          AS check_name, COUNT(*) AS value FROM whapi_channels;
SELECT 'COUNT_POSTE'            AS check_name, COUNT(*) AS value FROM whatsapp_poste;
SELECT 'COUNT_TEMPLATE'         AS check_name, COUNT(*) AS value FROM whatsapp_template;
SELECT 'COUNT_MIGRATION'        AS check_name, COUNT(*) AS value FROM migrations;

-- ── 2. Orphelins FK ──────────────────────────────────────────

-- ORPHAN_MSG_CHAT : messages sans conversation — attendu 0
SELECT 'ORPHAN_MSG_CHAT' AS check_name, COUNT(*) AS value
FROM whatsapp_message m
LEFT JOIN whatsapp_chat c ON m.chat_id = c.id
WHERE c.id IS NULL;

-- ORPHAN_CHAT_POSTE : conversations avec poste_id invalide — attendu 0
SELECT 'ORPHAN_CHAT_POSTE' AS check_name, COUNT(*) AS value
FROM whatsapp_chat c
LEFT JOIN whatsapp_poste p ON c.poste_id = p.id
WHERE c.poste_id IS NOT NULL AND p.id IS NULL;

-- ORPHAN_CAMPAIGN_CLICK : clics sans campagne — attendu 0
SELECT 'ORPHAN_CAMPAIGN_CLICK' AS check_name, COUNT(*) AS value
FROM campaign_link_click clk
LEFT JOIN campaign_link lnk ON clk.campaign_link_id = lnk.id
WHERE lnk.id IS NULL;

-- ORPHAN_CHANNEL_APP : canaux Meta avec application_id invalide — attendu 0
SELECT 'ORPHAN_CHANNEL_APP' AS check_name, COUNT(*) AS value
FROM whapi_channels ch
LEFT JOIN messaging_applications app ON ch.application_id = app.id
WHERE ch.application_id IS NOT NULL AND app.id IS NULL;

-- ── 3. Colonnes de convergence ────────────────────────────────

-- DISPATCH_MODE_NULL : dispatch_settings sans dispatch_mode — attendu 0
SELECT 'DISPATCH_MODE_NULL' AS check_name, COUNT(*) AS value
FROM dispatch_settings WHERE dispatch_mode IS NULL;

-- OUTBOUND_MSG_COUNT_SYNC : vérif copie poste_message_count → outbound_message_count
-- Attendu 0 (toutes les lignes avec ancien champ ont été copiées)
SELECT 'OUTBOUND_MSG_COUNT_SYNC' AS check_name, COUNT(*) AS value
FROM whatsapp_chat
WHERE poste_message_count_since_last_client > 0
  AND outbound_message_count = 0;

-- ── 4. Fenêtre glissante ─────────────────────────────────────

-- WINDOW_EXPIRES_AT_NULL_ACTIVE : conversations actives sans window_expires_at — attendu 0
-- (ces conversations ont window_expires_at = NULL parce qu'elles antédatent le système de sessions)
SELECT 'WINDOW_EXPIRES_AT_NULL_ACTIVE' AS check_name, COUNT(*) AS value
FROM whatsapp_chat
WHERE statut IN ('actif','en_attente')
  AND window_expires_at IS NULL
  AND last_client_message_at IS NOT NULL
  AND last_client_message_at > DATE_SUB(NOW(), INTERVAL 25 HOUR);

-- ── 5. Templates ─────────────────────────────────────────────

-- TEMPLATE_CATEGORY_INVALID : templates avec catégorie hors ENUM V2 — attendu 0
SELECT 'TEMPLATE_CATEGORY_INVALID' AS check_name, COUNT(*) AS value
FROM whatsapp_template
WHERE category NOT IN ('MARKETING','UTILITY','AUTHENTICATION');

-- TEMPLATE_TENANT_NULL : templates sans tenant_id — attendu 0 si table non vide
SELECT 'TEMPLATE_TENANT_NULL' AS check_name, COUNT(*) AS value
FROM whatsapp_template
WHERE tenant_id IS NULL OR tenant_id = '' OR tenant_id = 'default';

-- ── 6. Canaux Meta sans application ──────────────────────────

-- DRY-04 : canaux Meta/Messenger avec credentials legacy non migrés — attendu 0
SELECT 'CHANNEL_META_NO_APP' AS check_name, COUNT(*) AS value
FROM whapi_channels
WHERE provider IN ('meta','messenger','instagram')
  AND application_id IS NULL
  AND meta_app_secret IS NOT NULL
  AND meta_app_secret != '';

-- ── 7. Index couvrants trafic ────────────────────────────────

-- INDEX_TRAFIC_PRESENT : index covering sur whatsapp_message — attendu 3
SELECT 'INDEX_TRAFIC_PRESENT' AS check_name, COUNT(*) AS value
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'whatsapp_message'
  AND INDEX_NAME IN (
    'IDX_msg_trafic_covering','IDX_msg_trafic_hour','IDX_msg_trafic_dow'
  );

-- ── 8. Tables V2 créées ──────────────────────────────────────

SELECT 'TABLES_V2_PRESENT' AS check_name, COUNT(*) AS value
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'messaging_connection_log','media_asset','campaign_link','campaign_link_click',
    'chat_session','meta_ad_referral','commercial_conversation_access',
    'quiz_category','quiz_question','quiz_answer','quiz_session'
  );
-- Attendu : 11

-- ── 9. Business hours (sanity) ───────────────────────────────

SELECT 'BIZ_HOURS_DAYS_COUNT' AS check_name, COUNT(DISTINCT day_of_week) AS value
FROM business_hours_config;
-- Attendu : 7 (lundi→dimanche configuré)

-- ── 10. Config système ───────────────────────────────────────  

SELECT 'LOGIN_HOUR_SEEDED' AS check_name, COUNT(*) AS value
FROM system_configs
WHERE config_key IN ('LOGIN_HOUR_START','LOGIN_HOUR_END');
-- Attendu : 2
