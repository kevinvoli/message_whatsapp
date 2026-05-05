-- ══════════════════════════════════════════════════════════════════════════════
-- GUIDE DE TEST — ROTATION DES CONVERSATIONS ET OBLIGATIONS D'APPEL
-- Date       : 2026-05-04
-- Objectif   : Tester le cycle complet tel qu'une commerciale le vit dans
--              le navigateur. Aucune manipulation SQL côté commercial.
--
-- Connexion (mot de passe : le même pour toutes les commerciales de test)
--   Scénario 1 — aminata.coulibaly@gicop.ci   (Poste ABOBO)
--   Scénario 2 — fatou.diallo@gicop.ci        (Poste COCODY)
--   Scénario 3 — mariame.traore@gicop.ci      (Poste YOPOUGON)
--
-- ⚠ IMPORTANT : Exécuter UN scénario à la fois. Restaurer avant de passer
--   au suivant (bloc RESTAURATION en bas du fichier).
-- ══════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ┌─────────────────────────────────────────────────────────────────────────────
-- │  SCÉNARIO 1 — ROTATION RÉUSSIE
-- │  Commerciale : Aminata Coulibaly  (aminata.coulibaly@gicop.ci)
-- │  Poste       : ABOBO
-- │
-- │  ÉTAT INITIAL APRÈS CE SCRIPT :
-- │    • 10 conversations ACTIVES visibles (slots 1–10)
-- │    • 30 conversations EN ATTENTE cachées (slots 11–40)
-- │    • 15 / 15 appels téléphoniques déjà effectués (GICOP simulé)
-- │    • 0 / 10 rapports soumis ← c'est ce que la commerciale va faire
-- │
-- │  CE QUE LA COMMERCIALE FAIT DANS LE NAVIGATEUR :
-- │    1. Se connecter
-- │    2. Pour chacune des 10 conversations (dans l'ordre) :
-- │         a. Ouvrir la conversation
-- │         b. Envoyer un message au client (ex : "Bonjour Madame, je vous
-- │            contacte suite à notre échange. Merci pour votre confiance.")
-- │            → ce message garantit que c'est la commerciale qui a le
-- │              dernier mot (condition qualité)
-- │         c. Remplir le formulaire rapport GICOP
-- │            (intérêt, commune, action suivante, etc.)
-- │         d. Cliquer sur "Soumettre le rapport"
-- │    3. Après le 10ème rapport → patienter jusqu'à 1 minute
-- │
-- │  RÉSULTAT ATTENDU :
-- │    ✅ Les 10 conversations actuelles disparaissent
-- │    ✅ 10 nouvelles conversations apparaissent (ex-slots 11–20 promus)
-- │    ✅ Le compteur d'appels repart à 0 / 15
-- └─────────────────────────────────────────────────────────────────────────────

-- 1.1 — Fenêtre : 10 ACTIVE (slots 1–10) + 30 LOCKED (slots 11–40)
UPDATE whatsapp_chat SET window_slot = 1,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0001-4000-8000-000000000001';
UPDATE whatsapp_chat SET window_slot = 2,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0002-4000-8000-000000000002';
UPDATE whatsapp_chat SET window_slot = 3,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0003-4000-8000-000000000003';
UPDATE whatsapp_chat SET window_slot = 4,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0004-4000-8000-000000000004';
UPDATE whatsapp_chat SET window_slot = 5,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0005-4000-8000-000000000005';
UPDATE whatsapp_chat SET window_slot = 6,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0006-4000-8000-000000000006';
UPDATE whatsapp_chat SET window_slot = 7,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0007-4000-8000-000000000007';
UPDATE whatsapp_chat SET window_slot = 8,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0008-4000-8000-000000000008';
UPDATE whatsapp_chat SET window_slot = 9,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0009-4000-8000-000000000009';
UPDATE whatsapp_chat SET window_slot = 10, window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0010-4000-8000-000000000010';

UPDATE whatsapp_chat SET window_slot = 11, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0011-4000-8000-000000000011';
UPDATE whatsapp_chat SET window_slot = 12, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0012-4000-8000-000000000012';
UPDATE whatsapp_chat SET window_slot = 13, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0013-4000-8000-000000000013';
UPDATE whatsapp_chat SET window_slot = 14, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0014-4000-8000-000000000014';
UPDATE whatsapp_chat SET window_slot = 15, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0015-4000-8000-000000000015';
UPDATE whatsapp_chat SET window_slot = 16, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0016-4000-8000-000000000016';
UPDATE whatsapp_chat SET window_slot = 17, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0017-4000-8000-000000000017';
UPDATE whatsapp_chat SET window_slot = 18, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0018-4000-8000-000000000018';
UPDATE whatsapp_chat SET window_slot = 19, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0019-4000-8000-000000000019';
UPDATE whatsapp_chat SET window_slot = 20, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0020-4000-8000-000000000020';
UPDATE whatsapp_chat SET window_slot = 21, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0021-4000-8000-000000000021';
UPDATE whatsapp_chat SET window_slot = 22, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0022-4000-8000-000000000022';
UPDATE whatsapp_chat SET window_slot = 23, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0023-4000-8000-000000000023';
UPDATE whatsapp_chat SET window_slot = 24, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0024-4000-8000-000000000024';
UPDATE whatsapp_chat SET window_slot = 25, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0025-4000-8000-000000000025';
UPDATE whatsapp_chat SET window_slot = 26, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0026-4000-8000-000000000026';
UPDATE whatsapp_chat SET window_slot = 27, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0027-4000-8000-000000000027';
UPDATE whatsapp_chat SET window_slot = 28, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0028-4000-8000-000000000028';
UPDATE whatsapp_chat SET window_slot = 29, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0029-4000-8000-000000000029';
UPDATE whatsapp_chat SET window_slot = 30, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0030-4000-8000-000000000030';
UPDATE whatsapp_chat SET window_slot = 31, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0031-4000-8000-000000000031';
UPDATE whatsapp_chat SET window_slot = 32, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0032-4000-8000-000000000032';
UPDATE whatsapp_chat SET window_slot = 33, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0033-4000-8000-000000000033';
UPDATE whatsapp_chat SET window_slot = 34, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0034-4000-8000-000000000034';
UPDATE whatsapp_chat SET window_slot = 35, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0035-4000-8000-000000000035';
UPDATE whatsapp_chat SET window_slot = 36, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0036-4000-8000-000000000036';
UPDATE whatsapp_chat SET window_slot = 37, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0037-4000-8000-000000000037';
UPDATE whatsapp_chat SET window_slot = 38, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0038-4000-8000-000000000038';
UPDATE whatsapp_chat SET window_slot = 39, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0039-4000-8000-000000000039';
UPDATE whatsapp_chat SET window_slot = 40, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0040-4000-8000-000000000040';

-- 1.2 — Supprimer les rapports soumis précédemment (remettre à zéro)
DELETE FROM conversation_report
WHERE chat_id IN (
    '22500000001@c.us', '22500000002@c.us', '22500000003@c.us', '22500000004@c.us',
    '22500000005@c.us', '22500000006@c.us', '22500000007@c.us', '22500000008@c.us',
    '22500000009@c.us', '22500000010@c.us'
);

-- 1.3 — Obligations : simuler 15/15 appels effectués (batch 4 ABOBO)
UPDATE commercial_obligation_batch
SET annulee_done       = 5,
    livree_done        = 5,
    sans_commande_done = 5,
    quality_check_passed = 0,
    status             = 'pending',
    completed_at       = NULL
WHERE id = 'b1000000-0014-4000-8000-000000000014';

-- Marquer les 10 tâches d'appel PENDING du batch 4 ABOBO comme effectuées
UPDATE call_task
SET status           = 'done',
    client_phone     = '+2250700000099',
    duration_seconds = 120,
    completed_at     = NOW()
WHERE id IN (
    'c1000000-0051-4000-8000-000000000051',
    'c1000000-0052-4000-8000-000000000052',
    'c1000000-0053-4000-8000-000000000053',
    'c1000000-0054-4000-8000-000000000054',
    'c1000000-0055-4000-8000-000000000055',
    'c1000000-0056-4000-8000-000000000056',
    'c1000000-0057-4000-8000-000000000057',
    'c1000000-0058-4000-8000-000000000058',
    'c1000000-0059-4000-8000-000000000059',
    'c1000000-0060-4000-8000-000000000060'
);

-- Note 1.4 : les conversations ABOBO ont déjà last_poste_message_at > last_client_message_at
-- dans les seeds. La commerciale ENVOIE elle-même un message dans chaque conversation
-- (étape b du parcours) ce qui confirme la condition de qualité via l'UI.

SELECT '=== SCÉNARIO 1 PRÊT — Connectez-vous en tant que Aminata Coulibaly ===' AS instructions;

-- ┌─────────────────────────────────────────────────────────────────────────────
-- │  SCÉNARIO 2 — ROTATION BLOQUÉE PAR OBLIGATIONS D'APPEL INCOMPLÈTES
-- │  Commerciale : Fatou Diallo  (fatou.diallo@gicop.ci)
-- │  Poste       : COCODY
-- │
-- │  ÉTAT INITIAL APRÈS CE SCRIPT :
-- │    • 10 conversations ACTIVES visibles (slots 1–10)
-- │    • 30 conversations EN ATTENTE cachées (slots 11–40)
-- │    • 4 / 15 appels seulement effectués (annulée ×1, livrée ×2, jamais ×1)
-- │    • 0 / 10 rapports soumis ← c'est ce que la commerciale va faire
-- │
-- │  CE QUE LA COMMERCIALE FAIT DANS LE NAVIGATEUR :
-- │    1. Se connecter
-- │    2. Pour chacune des 10 conversations :
-- │         a. Ouvrir la conversation
-- │         b. Envoyer un message au client
-- │         c. Remplir le formulaire rapport GICOP
-- │         d. Cliquer sur "Soumettre le rapport"
-- │    3. Après le 10ème rapport → observer le message de blocage
-- │
-- │  RÉSULTAT ATTENDU :
-- │    ❌ Message "Rotation bloquée : appels incomplets (4/15)"
-- │    ❌ La fenêtre ne tourne PAS
-- │    ❌ Les 10 conversations restent inchangées
-- │    ℹ La rotation se déclenchera automatiquement dès que le GICOP
-- │      aura enregistré les 11 appels manquants (sans action UI supplémentaire)
-- └─────────────────────────────────────────────────────────────────────────────

-- 2.1 — Fenêtre COCODY : 10 ACTIVE + 30 LOCKED
UPDATE whatsapp_chat SET window_slot = 1,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0041-4000-8000-000000000041';
UPDATE whatsapp_chat SET window_slot = 2,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0042-4000-8000-000000000042';
UPDATE whatsapp_chat SET window_slot = 3,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0043-4000-8000-000000000043';
UPDATE whatsapp_chat SET window_slot = 4,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0044-4000-8000-000000000044';
UPDATE whatsapp_chat SET window_slot = 5,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0045-4000-8000-000000000045';
UPDATE whatsapp_chat SET window_slot = 6,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0046-4000-8000-000000000046';
UPDATE whatsapp_chat SET window_slot = 7,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0047-4000-8000-000000000047';
UPDATE whatsapp_chat SET window_slot = 8,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0048-4000-8000-000000000048';
UPDATE whatsapp_chat SET window_slot = 9,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0049-4000-8000-000000000049';
UPDATE whatsapp_chat SET window_slot = 10, window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0050-4000-8000-000000000050';

UPDATE whatsapp_chat SET window_slot = 11, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0051-4000-8000-000000000051';
UPDATE whatsapp_chat SET window_slot = 12, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0052-4000-8000-000000000052';
UPDATE whatsapp_chat SET window_slot = 13, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0053-4000-8000-000000000053';
UPDATE whatsapp_chat SET window_slot = 14, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0054-4000-8000-000000000054';
UPDATE whatsapp_chat SET window_slot = 15, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0055-4000-8000-000000000055';
UPDATE whatsapp_chat SET window_slot = 16, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0056-4000-8000-000000000056';
UPDATE whatsapp_chat SET window_slot = 17, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0057-4000-8000-000000000057';
UPDATE whatsapp_chat SET window_slot = 18, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0058-4000-8000-000000000058';
UPDATE whatsapp_chat SET window_slot = 19, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0059-4000-8000-000000000059';
UPDATE whatsapp_chat SET window_slot = 20, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0060-4000-8000-000000000060';
UPDATE whatsapp_chat SET window_slot = 21, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0061-4000-8000-000000000061';
UPDATE whatsapp_chat SET window_slot = 22, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0062-4000-8000-000000000062';
UPDATE whatsapp_chat SET window_slot = 23, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0063-4000-8000-000000000063';
UPDATE whatsapp_chat SET window_slot = 24, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0064-4000-8000-000000000064';
UPDATE whatsapp_chat SET window_slot = 25, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0065-4000-8000-000000000065';
UPDATE whatsapp_chat SET window_slot = 26, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0066-4000-8000-000000000066';
UPDATE whatsapp_chat SET window_slot = 27, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0067-4000-8000-000000000067';
UPDATE whatsapp_chat SET window_slot = 28, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0068-4000-8000-000000000068';
UPDATE whatsapp_chat SET window_slot = 29, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0069-4000-8000-000000000069';
UPDATE whatsapp_chat SET window_slot = 30, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0070-4000-8000-000000000070';
UPDATE whatsapp_chat SET window_slot = 31, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0071-4000-8000-000000000071';
UPDATE whatsapp_chat SET window_slot = 32, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0072-4000-8000-000000000072';
UPDATE whatsapp_chat SET window_slot = 33, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0073-4000-8000-000000000073';
UPDATE whatsapp_chat SET window_slot = 34, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0074-4000-8000-000000000074';
UPDATE whatsapp_chat SET window_slot = 35, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0075-4000-8000-000000000075';
UPDATE whatsapp_chat SET window_slot = 36, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0076-4000-8000-000000000076';
UPDATE whatsapp_chat SET window_slot = 37, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0077-4000-8000-000000000077';
UPDATE whatsapp_chat SET window_slot = 38, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0078-4000-8000-000000000078';
UPDATE whatsapp_chat SET window_slot = 39, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0079-4000-8000-000000000079';
UPDATE whatsapp_chat SET window_slot = 40, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0080-4000-8000-000000000080';

-- 2.2 — Supprimer les rapports COCODY (remettre à zéro)
DELETE FROM conversation_report
WHERE chat_id IN (
    '22500000041@c.us', '22500000042@c.us', '22500000043@c.us', '22500000044@c.us',
    '22500000045@c.us', '22500000046@c.us', '22500000047@c.us', '22500000048@c.us',
    '22500000049@c.us', '22500000050@c.us'
);

-- 2.3 — Obligations : forcer à 4/15 (1 annulée + 2 livrées + 1 jamais commandé)
UPDATE commercial_obligation_batch
SET annulee_done       = 1,
    livree_done        = 2,
    sans_commande_done = 1,
    quality_check_passed = 0,
    status             = 'pending',
    completed_at       = NULL
WHERE id = 'b1000000-0024-4000-8000-000000000024';

SELECT '=== SCÉNARIO 2 PRÊT — Connectez-vous en tant que Fatou Diallo ===' AS instructions;

-- ┌─────────────────────────────────────────────────────────────────────────────
-- │  SCÉNARIO 3 — ROTATION BLOQUÉE PAR QUALITÉ KO, PUIS DÉBLOQUÉE
-- │  Commerciale : Mariame Traore  (mariame.traore@gicop.ci)
-- │  Poste       : YOPOUGON
-- │
-- │  ÉTAT INITIAL APRÈS CE SCRIPT :
-- │    • 10 conversations ACTIVES visibles (slots 1–10)
-- │    • 30 conversations EN ATTENTE cachées (slots 11–40)
-- │    • 15 / 15 appels téléphoniques effectués (GICOP simulé)
-- │    • 0 / 10 rapports soumis
-- │    • ⚠ 3 conversations ont le CLIENT comme dernier message (qualité KO) :
-- │        - Conversation slot 3
-- │        - Conversation slot 6
-- │        - Conversation slot 9
-- │
-- │  PARCOURS — PHASE 1 (observer le blocage) :
-- │    1. Se connecter en tant que Mariame Traore
-- │    2. Pour chacune des 10 conversations (SANS envoyer de message dans
-- │       les slots 3, 6 et 9 — laisser le client avoir le dernier mot) :
-- │         a. Ouvrir la conversation
-- │         b. Remplir le formulaire rapport GICOP
-- │         c. Cliquer sur "Soumettre le rapport"
-- │    3. Après le 10ème rapport → observer le blocage
-- │
-- │  RÉSULTAT PHASE 1 :
-- │    ❌ Message "Rotation bloquée : qualité insuffisante"
-- │    ❌ La fenêtre ne tourne pas
-- │
-- │  PARCOURS — PHASE 2 (débloquer en répondant aux clients) :
-- │    4. Ouvrir la conversation slot 3
-- │         → Envoyer un message : "Bonjour, merci pour votre patience."
-- │    5. Ouvrir la conversation slot 6
-- │         → Envoyer un message : "Votre dossier est bien pris en compte."
-- │    6. Ouvrir la conversation slot 9
-- │         → Envoyer un message : "N'hésitez pas si vous avez des questions."
-- │    7. Patienter jusqu'à 1 minute (le cron re-vérifie automatiquement)
-- │
-- │  RÉSULTAT PHASE 2 :
-- │    ✅ La rotation se déclenche automatiquement
-- │    ✅ 10 nouvelles conversations apparaissent dans la fenêtre
-- └─────────────────────────────────────────────────────────────────────────────

-- 3.1 — Fenêtre YOPOUGON : 10 ACTIVE + 30 LOCKED
UPDATE whatsapp_chat SET window_slot = 1,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0081-4000-8000-000000000081';
UPDATE whatsapp_chat SET window_slot = 2,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0082-4000-8000-000000000082';
UPDATE whatsapp_chat SET window_slot = 3,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0083-4000-8000-000000000083';
UPDATE whatsapp_chat SET window_slot = 4,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0084-4000-8000-000000000084';
UPDATE whatsapp_chat SET window_slot = 5,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0085-4000-8000-000000000085';
UPDATE whatsapp_chat SET window_slot = 6,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0086-4000-8000-000000000086';
UPDATE whatsapp_chat SET window_slot = 7,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0087-4000-8000-000000000087';
UPDATE whatsapp_chat SET window_slot = 8,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0088-4000-8000-000000000088';
UPDATE whatsapp_chat SET window_slot = 9,  window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0089-4000-8000-000000000089';
UPDATE whatsapp_chat SET window_slot = 10, window_status = 'active', is_locked = 0 WHERE id = 'e0000001-0090-4000-8000-000000000090';

UPDATE whatsapp_chat SET window_slot = 11, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0091-4000-8000-000000000091';
UPDATE whatsapp_chat SET window_slot = 12, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0092-4000-8000-000000000092';
UPDATE whatsapp_chat SET window_slot = 13, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0093-4000-8000-000000000093';
UPDATE whatsapp_chat SET window_slot = 14, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0094-4000-8000-000000000094';
UPDATE whatsapp_chat SET window_slot = 15, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0095-4000-8000-000000000095';
UPDATE whatsapp_chat SET window_slot = 16, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0096-4000-8000-000000000096';
UPDATE whatsapp_chat SET window_slot = 17, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0097-4000-8000-000000000097';
UPDATE whatsapp_chat SET window_slot = 18, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0098-4000-8000-000000000098';
UPDATE whatsapp_chat SET window_slot = 19, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0099-4000-8000-000000000099';
UPDATE whatsapp_chat SET window_slot = 20, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0100-4000-8000-000000000100';
UPDATE whatsapp_chat SET window_slot = 21, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0101-4000-8000-000000000101';
UPDATE whatsapp_chat SET window_slot = 22, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0102-4000-8000-000000000102';
UPDATE whatsapp_chat SET window_slot = 23, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0103-4000-8000-000000000103';
UPDATE whatsapp_chat SET window_slot = 24, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0104-4000-8000-000000000104';
UPDATE whatsapp_chat SET window_slot = 25, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0105-4000-8000-000000000105';
UPDATE whatsapp_chat SET window_slot = 26, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0106-4000-8000-000000000106';
UPDATE whatsapp_chat SET window_slot = 27, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0107-4000-8000-000000000107';
UPDATE whatsapp_chat SET window_slot = 28, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0108-4000-8000-000000000108';
UPDATE whatsapp_chat SET window_slot = 29, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0109-4000-8000-000000000109';
UPDATE whatsapp_chat SET window_slot = 30, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0110-4000-8000-000000000110';
UPDATE whatsapp_chat SET window_slot = 31, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0111-4000-8000-000000000111';
UPDATE whatsapp_chat SET window_slot = 32, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0112-4000-8000-000000000112';
UPDATE whatsapp_chat SET window_slot = 33, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0113-4000-8000-000000000113';
UPDATE whatsapp_chat SET window_slot = 34, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0114-4000-8000-000000000114';
UPDATE whatsapp_chat SET window_slot = 35, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0115-4000-8000-000000000115';
UPDATE whatsapp_chat SET window_slot = 36, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0116-4000-8000-000000000116';
UPDATE whatsapp_chat SET window_slot = 37, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0117-4000-8000-000000000117';
UPDATE whatsapp_chat SET window_slot = 38, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0118-4000-8000-000000000118';
UPDATE whatsapp_chat SET window_slot = 39, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0119-4000-8000-000000000119';
UPDATE whatsapp_chat SET window_slot = 40, window_status = 'locked', is_locked = 1 WHERE id = 'e0000001-0120-4000-8000-000000000120';

-- 3.2 — Supprimer les rapports YOPOUGON (remettre à zéro)
DELETE FROM conversation_report
WHERE chat_id IN (
    '22500000081@c.us', '22500000082@c.us', '22500000083@c.us', '22500000084@c.us',
    '22500000085@c.us', '22500000086@c.us', '22500000087@c.us', '22500000088@c.us',
    '22500000089@c.us', '22500000090@c.us'
);

-- 3.3 — Obligations : simuler 15/15 appels effectués (batch 4 YOPOUGON)
UPDATE commercial_obligation_batch
SET annulee_done       = 5,
    livree_done        = 5,
    sans_commande_done = 5,
    quality_check_passed = 0,
    status             = 'pending',
    completed_at       = NULL
WHERE id = 'b1000000-0034-4000-8000-000000000034';

-- Marquer toutes les tâches PENDING du batch 4 YOPOUGON comme effectuées
UPDATE call_task
SET status           = 'done',
    client_phone     = '+2250700000099',
    duration_seconds = 120,
    completed_at     = NOW()
WHERE batch_id = 'b1000000-0034-4000-8000-000000000034'
  AND status   = 'pending';

-- 3.4 — Forcer la QUALITÉ KO sur 3 conversations (slots 3, 6 et 9)
--        Le client a envoyé le dernier message → last_client > last_poste
--        La commerciale devra répondre en phase 2 pour débloquer.

UPDATE whatsapp_chat
SET last_client_message_at = '2026-05-04 10:30:00',
    last_poste_message_at  = '2026-05-04 09:00:00'
WHERE id = 'e0000001-0083-4000-8000-000000000083';

UPDATE whatsapp_chat
SET last_client_message_at = '2026-05-04 10:45:00',
    last_poste_message_at  = '2026-05-04 09:15:00'
WHERE id = 'e0000001-0086-4000-8000-000000000086';

UPDATE whatsapp_chat
SET last_client_message_at = '2026-05-04 11:00:00',
    last_poste_message_at  = '2026-05-04 09:30:00'
WHERE id = 'e0000001-0089-4000-8000-000000000089';

-- 3.5 — Activer le compte Mariame Traore si elle apparaît hors-ligne
UPDATE whatsapp_commercial
SET isConnected = 1
WHERE id = 'c0000001-0003-4000-8000-000000000003';

SELECT '=== SCÉNARIO 3 PRÊT — Connectez-vous en tant que Mariame Traore ===' AS instructions;

-- ══════════════════════════════════════════════════════════════════════════════
-- RESTAURATION — À exécuter après les tests pour remettre en état initial
-- Décommenter le bloc du scénario que vous souhaitez restaurer.
-- ══════════════════════════════════════════════════════════════════════════════

/*
-- ── RESTAURATION SCÉNARIO 1 (ABOBO) ──────────────────────────────────────────
UPDATE commercial_obligation_batch
SET annulee_done = 1, livree_done = 2, sans_commande_done = 1,
    quality_check_passed = 0, status = 'pending', completed_at = NULL
WHERE id = 'b1000000-0014-4000-8000-000000000014';

UPDATE call_task
SET status = 'pending', client_phone = NULL, duration_seconds = NULL, completed_at = NULL
WHERE id IN (
    'c1000000-0051-4000-8000-000000000051', 'c1000000-0052-4000-8000-000000000052',
    'c1000000-0053-4000-8000-000000000053', 'c1000000-0054-4000-8000-000000000054',
    'c1000000-0055-4000-8000-000000000055', 'c1000000-0056-4000-8000-000000000056',
    'c1000000-0057-4000-8000-000000000057', 'c1000000-0058-4000-8000-000000000058',
    'c1000000-0059-4000-8000-000000000059', 'c1000000-0060-4000-8000-000000000060'
);
*/

/*
-- ── RESTAURATION SCÉNARIO 2 (COCODY) ─────────────────────────────────────────
-- Aucun changement hors batch (déjà à 1+2+1 dans le seed de base). Si vous
-- avez modifié d'autres valeurs, les remettre ici manuellement.
*/

/*
-- ── RESTAURATION SCÉNARIO 3 (YOPOUGON) ───────────────────────────────────────
UPDATE commercial_obligation_batch
SET annulee_done = 1, livree_done = 2, sans_commande_done = 1,
    quality_check_passed = 0, status = 'pending', completed_at = NULL
WHERE id = 'b1000000-0034-4000-8000-000000000034';

UPDATE call_task
SET status = 'pending', client_phone = NULL, duration_seconds = NULL, completed_at = NULL
WHERE batch_id = 'b1000000-0034-4000-8000-000000000034'
  AND id NOT IN (
      -- adapter selon les 4 tâches initialement 'done' dans le seed YOPOUGON batch 4
      SELECT id FROM call_task WHERE batch_id = 'b1000000-0034-4000-8000-000000000034' LIMIT 4
  );

UPDATE whatsapp_chat
SET last_client_message_at = NULL,
    last_poste_message_at  = NULL
WHERE id IN (
    'e0000001-0083-4000-8000-000000000083',
    'e0000001-0086-4000-8000-000000000086',
    'e0000001-0089-4000-8000-000000000089'
);

UPDATE whatsapp_commercial SET isConnected = 0 WHERE id = 'c0000001-0003-4000-8000-000000000003';
*/

SET FOREIGN_KEY_CHECKS = 1;
