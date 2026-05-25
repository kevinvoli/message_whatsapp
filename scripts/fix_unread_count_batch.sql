-- Script one-time : corriger les unread_count gonflés avant redémarrage du backend
-- Exécuter AVANT le redémarrage du backend après déploiement de US-B1

-- 1. Forcer unread_count = 0 pour toutes les conversations fermées
UPDATE whatsapp_chat
SET unread_count = 0
WHERE status = 'fermé';

-- 2. Recalculer unread_count pour toutes les conversations actives
--    (aligne la colonne DB sur la même logique que US-B1)
UPDATE whatsapp_chat c
SET c.unread_count = (
  SELECT COUNT(*)
  FROM whatsapp_message m
  WHERE m.chat_id = c.chat_id
    AND m.from_me = 0
    AND m.status IN ('sent', 'delivered')
    AND m.deleted_at IS NULL
)
WHERE c.status != 'fermé'
  AND c.deleted_at IS NULL;

-- Validation : doit retourner 0
-- SELECT SUM(unread_count) FROM whatsapp_chat WHERE status = 'fermé';
