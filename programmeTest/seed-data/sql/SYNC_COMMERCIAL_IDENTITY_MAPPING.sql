-- ══════════════════════════════════════════════════════════════════════════════
-- SYNC — commercial_identity_mapping (DB1 ← DB2)
--
-- Problème : commercial_identity_mapping n'est pas alimenté automatiquement.
-- Ce script fait la liaison entre :
--   DB1 whatsapp_commercial.phone  ←→  DB2 users.phone (type=1, id_poste IS NOT NULL)
--
-- ⚠ AVANT D'EXÉCUTER :
--   1. Remplacer 'DB1_NAME' par le vrai nom de la base messagerie  (ex: whatsappflow)
--   2. Remplacer 'DB2_NAME' par le vrai nom de la base commandes   (ex: gicop_commandes)
--   3. S'assurer que FIX_DB2_USERS_TYPE.sql a déjà été exécuté sur DB2
--   4. Exécuter depuis phpMyAdmin avec un compte MySQL ayant accès aux deux bases
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Étape 0 : Diagnostic — état avant sync ───────────────────────────────────

-- Commerciaux dans DB1 sans entrée dans commercial_identity_mapping
SELECT
    c.id       AS commercial_id_db1,
    c.name     AS nom,
    c.phone    AS telephone,
    m.external_id AS id_db2_actuel
FROM DB1_NAME.whatsapp_commercial c
LEFT JOIN DB1_NAME.commercial_identity_mapping m ON m.commercial_id = c.id
WHERE c.deleted_at IS NULL
ORDER BY m.external_id IS NULL DESC, c.name;

-- ── Étape 1 : Vérifier que DB2 a bien les bons types (après FIX) ─────────────

SELECT
    u.id,
    u.nom,
    u.prenoms,
    u.phone,
    u.type,
    u.id_poste
FROM DB2_NAME.users u
WHERE u.type = 1
  AND u.id_poste IS NOT NULL
  AND u.valid = 1
ORDER BY u.id;

-- ── Étape 2 : Sync — INSERT ou UPDATE si déjà existant ───────────────────────
-- La jointure se fait sur le numéro de téléphone (même format dans les deux bases)

INSERT INTO DB1_NAME.commercial_identity_mapping
    (id, commercial_id, external_id, commercial_name, created_at, updated_at)
SELECT
    UUID()      AS id,
    c.id        AS commercial_id,
    u.id        AS external_id,
    c.name      AS commercial_name,
    NOW()       AS created_at,
    NOW()       AS updated_at
FROM DB1_NAME.whatsapp_commercial c
JOIN DB2_NAME.users u
    ON  u.phone         = c.phone
    AND u.type          = 1
    AND u.id_poste      IS NOT NULL
    AND u.valid         = 1
WHERE c.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
    external_id      = VALUES(external_id),
    commercial_name  = VALUES(commercial_name),
    updated_at       = NOW();

-- ── Étape 3 : Vérification finale ────────────────────────────────────────────

SELECT
    c.name                 AS commercial,
    c.phone                AS telephone_db1,
    u.phone                AS telephone_db2,
    m.external_id          AS id_db2,
    m.updated_at           AS sync_at
FROM DB1_NAME.commercial_identity_mapping m
JOIN DB1_NAME.whatsapp_commercial c ON c.id = m.commercial_id
JOIN DB2_NAME.users u               ON u.id = m.external_id
ORDER BY c.name;
