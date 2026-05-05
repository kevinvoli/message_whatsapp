-- ══════════════════════════════════════════════════════════════════════════════
-- CORRECTION — Table users (DB2)
-- Problème : les valeurs du champ `type` étaient inversées dans les seeds.
--
-- Convention réelle DB2 :
--   type = 1  +  id_poste IS NOT NULL  →  commercial
--   type = 0  +  id_poste IS NULL      →  client
--
-- À exécuter dans phpMyAdmin sur la base DB2 (base commandes).
-- ══════════════════════════════════════════════════════════════════════════════

-- Vérifier l'état avant correction
SELECT
    CASE WHEN id_poste IS NOT NULL THEN 'commercial' ELSE 'client' END AS role_attendu,
    type                                                                AS type_actuel,
    COUNT(*)                                                            AS nb
FROM users
GROUP BY role_attendu, type_actuel
ORDER BY role_attendu;

-- ── Correction 1 : Commerciaux (id_poste IS NOT NULL) → type = 1 ─────────────
UPDATE users
SET type = 1
WHERE id_poste IS NOT NULL;

-- ── Correction 2 : Clients (id_poste IS NULL) → type = 0 ────────────────────
UPDATE users
SET type = 0
WHERE id_poste IS NULL;

-- Vérifier l'état après correction
SELECT
    CASE WHEN id_poste IS NOT NULL THEN 'commercial' ELSE 'client' END AS role,
    type,
    COUNT(*) AS nb
FROM users
GROUP BY role, type
ORDER BY role;
