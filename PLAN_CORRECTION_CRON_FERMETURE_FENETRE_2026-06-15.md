# Plan de correction — Cron de fermeture auto + règle fenêtre 24h/72h (CTWA)

Date : 2026-06-15
Bug détecté : conversations dont la fenêtre WhatsApp (24h normal / 72h CTWA) est expirée,
le commercial ne peut plus répondre (input désactivé côté front), mais le `chat`
n'est pas passé en statut `fermé` par le cron. Ces conversations restent comptées
comme "non répondues" et bloquent la modale de restriction (`ConversationRestrictionModal`),
empêchant les commerciaux d'avancer.

---

## 1. Composants impliqués

| Élément | Fichier |
|---|---|
| Cron de fermeture auto | `message_whatsapp/src/jorbs/read-only-enforcement.job.ts` |
| Calcul des fenêtres / fermeture | `message_whatsapp/src/chat-session/chat-session.service.ts` |
| Entité session | `message_whatsapp/src/chat-session/entities/chat-session.entity.ts` |
| Skip canal dédié | `message_whatsapp/src/channel/channel.service.ts:545` (`shouldSkipAutoClose`) |
| TTL ouverture session | `message_whatsapp/src/webhooks/inbound-message.service.ts:130-182` |
| Détection fenêtre côté front | `front/src/components/chat/ChatMainArea.tsx:34-45` |
| Modale "réponse requise" | `front/src/components/ConversationRestrictionModal.tsx` |
| Logique de comptage non-répondu | `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts` |

---

## 1bis. Bug confirmé — `ttlDaysCtwa` (Seuil CTWA) configuré mais jamais utilisé

L'écran admin "Crons" (`CronConfigView.tsx:596-630`) expose deux champs pour
`read-only-enforcement` :
- **Seuil inactivité (heures)** → `ttlDays` (défaut 24)
- **Seuil CTWA (heures)** → `ttlDaysCtwa` (défaut 72, colonne `cron_config.ttl_days_ctwa`,
  migration `AddWindowReminderCronFields1780531200002`)

Mais côté backend, **`ttlDaysCtwa` n'est lu nulle part** :
- `inbound-message.service.ts:134` → `const ttlCtwa = 72;` (codé en dur)
- `chat-session.service.ts:147` (`onClientMessage`, upgrade CTWA) → `const ttlCtwaHours = 72;` (codé en dur)

Conséquence : si un admin modifie "Seuil inactivité" à 24h (ou autre valeur) en
pensant ajuster le délai pour TOUTES les conversations, les conversations CTWA
(pub Meta) gardent toujours 72h en dur — **et inversement, si l'admin modifie le
champ "Seuil CTWA", ce changement n'a strictement aucun effet**, ce qui est
trompeur (champ mort dans l'UI).

### Fix
- Lire `config.ttlDaysCtwa` (fallback 72 si `null`) dans `inbound-message.service.ts`
  (à côté de `ttlNormal`, ligne 130-134) et le transmettre à `openSession()` / `onClientMessage()`.
- `chat-session.service.ts` : `onClientMessage()` doit recevoir `ttlCtwaHours` en
  paramètre (comme `openSession()`) au lieu de le coder en dur ligne 147.
- Voir aussi point E (single source of truth 24h/72h) — `ttlDaysCtwa` doit alimenter
  la même constante/valeur que `TTL_CTWA_HOURS`.

---

## 2. Hypothèses de cause racine (à valider en premier — étape A)

1. **`active_session_id` désynchronisé** : le job ne ferme que les sessions où
   `c.active_session_id = s.id` (`read-only-enforcement.job.ts:54`). Si une conversation
   a une session expirée (`auto_close_at < now`, `ended_at IS NULL`) mais que
   `whatsapp_chat.active_session_id` ne pointe plus vers cette session (ou est NULL),
   elle n'est **jamais sélectionnée** par `findExpiredSessions()` et reste bloquée
   indéfiniment.
2. **`shouldSkipAutoClose` trop permissif** : si `no_close=true` ou `poste_id` est
   renseigné par erreur sur le canal de ces conversations, elles sont exclues du
   cron (`channel.service.ts:545-552`) — alors qu'elles ne sont pas réellement en
   "mode canal dédié".
3. **Cron désactivé / en échec silencieux** : vérifier dans la table de config crons
   que `read-only-enforcement` est `enabled=true` et que la dernière exécution
   (`enforce()`) n'est pas en erreur (collation, FK, etc. — un bug de ce type a déjà
   eu lieu, cf. `FixActiveSessionIdCollation1780704000000`).
4. **`auto_close_at` non recalculé après réouverture** : si un chat repasse de
   `fermé`/`en attente` à `actif` sans repasser par `openSession()`/`onClientMessage()`
   (ex: réassignation manuelle, transfert), `auto_close_at` peut rester sur une
   ancienne valeur passée mais la session reste `ended_at = NULL` → devrait en théorie
   être éligible, donc peu probable d'être la cause du non-traitement, mais à vérifier
   pour les cas de transfert/réouverture.

### Requêtes de diagnostic à exécuter en premier (lecture seule)

```sql
-- Sessions expirées non fermées (ce que le cron DEVRAIT traiter)
SELECT s.id, s.whatsapp_chat_id, c.chat_id, c.status, c.active_session_id,
       s.auto_close_at, s.ended_at, c.read_only, c.channel_id, c.last_msg_client_channel_id
FROM chat_session s
JOIN whatsapp_chat c ON c.id = s.whatsapp_chat_id
WHERE s.ended_at IS NULL
  AND s.auto_close_at < NOW()
  AND c.status != 'fermé';

-- Parmi celles-ci, combien NE sont PAS la session active du chat (hypothèse 1)
... AND c.active_session_id != s.id OR c.active_session_id IS NULL;

-- Vérifier shouldSkipAutoClose (hypothèse 2)
SELECT channel_id, no_close, poste_id FROM whapi_channels
WHERE channel_id IN (<channel_ids des conversations bloquées>);
```

---

## 3. Plan d'action

### A. Diagnostic (avant tout fix) — `tester`
- Exécuter les requêtes ci-dessus en environnement de prod (lecture seule) pour
  confirmer laquelle des hypothèses 1/2/3 explique les conversations bloquées
  signalées ce matin.
- Vérifier les logs `READ_ONLY_ENFORCE candidates=...` (log ligne `read-only-enforcement.job.ts:90`)
  sur les dernières exécutions : si `candidates=0` alors que la requête diagnostic
  ci-dessus retourne des lignes → confirme hypothèse 1 (mismatch `active_session_id`).

### B. Hotfix immédiat — débloquer les conversations bloquées aujourd'hui — `backend-dev`
- Script ponctuel (exécuté une fois, hors migration) qui :
  1. Re-synchronise `whatsapp_chat.active_session_id` avec la session ouverte
     (`ended_at IS NULL`) la plus récente, pour tous les chats non fermés.
  2. Relance manuellement `ReadOnlyEnforcementJob.enforce()` (endpoint admin / cron
     "exécuter maintenant" si disponible dans `cron-config.service.ts`) pour fermer
     immédiatement les conversations déjà expirées.

### C. Correction pérenne du cron — `backend-dev`
- `findExpiredSessions()` (`read-only-enforcement.job.ts:49-58`) : ne plus dépendre
  uniquement de `c.active_session_id = s.id`. Élargir la condition à :
  `(c.active_session_id = s.id OR c.active_session_id IS NULL OR c.active_session_id != s.id)`
  en sélectionnant la **dernière session ouverte** (`ended_at IS NULL`) par chat,
  indépendamment de la valeur de `active_session_id`, puis dans `closeExpiredSessionAndChat`
  forcer la remise à `NULL` de `active_session_id` (déjà fait ligne 245) — ce qui
  corrige aussi la désync pour la suite.
- Ajouter un log d'alerte si `candidates > 0` mais que `enforce()` ferme 0 conversation
  pendant plusieurs cycles consécutifs (signal de régression silencieuse).

### D. Garde-fou côté restriction — casser le deadlock même si le cron est en retard — `backend-dev`
Indépendamment de la cause du cron, ajouter une **double sécurité** dans
`conversation-restriction.service.ts` pour qu'une conversation dont la fenêtre est
expirée (donc le commercial ne PEUT PAS répondre) ne bloque jamais la modale :

- `recordAccess()` (ligne 48-89) et le filtre `candidateAccesses` de `checkRestriction()`
  (ligne 150-161) : exclure aussi les chats dont `auto_close_at` (session active) est
  dans le passé — pas seulement `read_only` / `status === FERME`. Nécessite un join
  vers `chat_session` (session active du chat) ou l'ajout d'un champ dénormalisé
  `whatsapp_chat.window_expires_at` mis à jour par `chat-session.service.ts` à chaque
  `computeWindows()` (recommandé — évite un join supplémentaire et permet aussi de
  réutiliser cette valeur côté front au lieu de la recalculer).

### E. Harmonisation de la règle 24h / 72h (single source of truth) — `backend-dev` + `frontend-dev`
Constat actuel :
- Backend `computeWindows()` (`chat-session.service.ts:28-52`) : 24h normal / 72h CTWA — ✅ correct.
- `onClientMessage()` (ligne 147) : `ttlCtwaHours = 72` codé en dur — cohérent mais dupliqué.
- `inbound-message.service.ts:134` : `ttlCtwa = 72` codé en dur — 3e occurrence du même nombre.
- Front `ChatMainArea.tsx:38-40` : **23h** pour le cas normal (au lieu de 24h) et 72h
  pour CTWA — incohérence avec le backend → le front affiche "fenêtre expirée"
  **1h avant** que le backend ne considère réellement la fenêtre comme expirée.

Actions :
1. Centraliser `TTL_NORMAL_HOURS = 24` et `TTL_CTWA_HOURS = 72` dans une seule
   constante backend (ex: `chat-session/constants.ts`), réutilisée dans
   `computeWindows`, `onClientMessage`, et `inbound-message.service.ts`.
2. Exposer `auto_close_at` (ou `window_expires_at` si ajouté en D) dans le DTO de
   conversation retourné au front, et faire calculer `windowExpired` côté front à
   partir de cette valeur plutôt que de recalculer 23h/72h localement
   (`ChatMainArea.tsx:34-45`). Supprime la divergence 23h/24h définitivement.

### F. Tests — `tester`
- Test unitaire `read-only-enforcement.job.spec.ts` : cas où `active_session_id`
  ne correspond pas à la session expirée → doit tout de même être fermée.
- Test `chat-session.service.spec.ts` : `computeWindows` avec les constantes
  centralisées (24h / 72h), vérifier `autoCloseAt` pour CTWA vs normal.
- Test `conversation-restriction.service.spec.ts` : un chat avec fenêtre expirée
  (mais statut encore `actif`) ne doit pas apparaître dans `unrespondedConversations`.
- Test front : `windowExpired` calculé à partir de `auto_close_at` reçu de l'API,
  pas recalculé localement.

### G. Déploiement
- Si ajout de colonne `window_expires_at` (option D) → migration TypeORM avec
  backfill (`UPDATE whatsapp_chat ... = chat_session.auto_close_at` pour la session active).
- Ordre de déploiement : B (hotfix manuel) en premier pour débloquer les commerciaux
  dès aujourd'hui, puis C/D/E/F dans une PR groupée.

---

## 4. Récapitulatif fichiers à modifier

- `message_whatsapp/src/jorbs/read-only-enforcement.job.ts`
- `message_whatsapp/src/chat-session/chat-session.service.ts`
- `message_whatsapp/src/chat-session/entities/chat-session.entity.ts` (si colonne dénormalisée)
- `message_whatsapp/src/webhooks/inbound-message.service.ts`
- `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts`
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts` (si colonne dénormalisée)
- `front/src/components/chat/ChatMainArea.tsx`
- Nouvelle migration TypeORM (si colonne dénormalisée)
- Tests associés (`*.spec.ts`)
