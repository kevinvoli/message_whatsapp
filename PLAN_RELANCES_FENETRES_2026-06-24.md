# Plan d'implémentation — Relances avant fermeture des fenêtres de messagerie WhatsApp

> Date : 2026-06-24 — Auteur : architecte
> Périmètre : `message_whatsapp/` (backend), `front/` (commercial), `admin/` (panel admin)

---

## Résumé exécutif

Le backend de **relance unique avant expiration** (Trigger J) est **déjà entièrement implémenté et robuste** : cron `window-reminder-auto-message` dans `auto-message-master.job.ts:491`, source de vérité `ChatSession`, idempotence atomique via `markWindowReminderSent()`, config admin (délais normal/CTWA + variantes `with_replies`/`no_replies`), différenciation CTWA déjà présente. Les **vrais manques** sont : (1) aucune alerte visuelle temps réel côté commercial avant expiration, (2) aucune supervision admin des fenêtres à risque, (3) le système est **mono-relance** (`lastWindowReminderSentAt IS NULL`) — il ne supporte pas plusieurs paliers (J-2h puis J-30min), (4) aucun historique des relances envoyées. La différenciation CTWA (Phase 5 du brief) est **déjà acquise** et ne nécessite qu'un complément marginal. Ce plan se concentre donc sur P0 (visibilité commercial + supervision admin) puis P1 (multi-paliers + historique), en **réutilisant au maximum** l'infrastructure existante (socket `chat:event`, `ChatSession`, `cron_config`, `metriques.controller`).

---

## État de l'existant (audit du code réel)

| Élément | Emplacement réel | Statut |
|---|---|---|
| Calcul fenêtre (24h/72h CTWA) | `chat-session.service.ts:29` `computeWindows()` | ✅ source de vérité = `ChatSession.autoCloseAt` |
| Dénormalisation sur le chat | `whatsapp_chat.entity.ts:323` `windowExpiresAt` | ✅ exposé au front via `window_expires_at` |
| Cron relance unique (Trigger J) | `auto-message-master.job.ts:491` `runWindowReminder()` | ✅ délais normal/CTWA configurables |
| Idempotence relance | `chat-session.service.ts:281` `markWindowReminderSent()` | ✅ UPDATE atomique `IS NULL` |
| Config admin trigger J | `cron_config` + migration `AddWindowReminderCronFields1780531200002` | ✅ 5 colonnes délais + min_replies |
| Variantes message (répondu / pas répondu) | `messages_predefinis.window_reminder_target` | ✅ `with_replies` / `no_replies` |
| Fermeture fenêtre expirée | `read-only-enforcement.job.ts` | ✅ ferme ACTIF/EN_ATTENTE expirés |
| Bannière "fenêtre expirée" front | `ChatInput.tsx:419` | ✅ bannière orange + input bloqué |
| Event socket conversation | `whatsapp_message.gateway.ts` `chat:event` → `poste:${posteId}` | ✅ pattern `{ type, payload }` |
| Supervision admin fenêtres | — | ❌ **manquant** |
| Alerte visuelle "expire dans X min" | — | ❌ **manquant** |
| Multi-paliers (J-2h, J-30min) | — | ❌ **manquant** (mono-relance) |
| Historique relances | — | ❌ **manquant** |

> ⚠️ **Divergence avec le brief** : le brief évoque `WhatsappChat.reminderSentAt`/`reminderCount` comme colonnes existantes. Dans le code réel, la source de vérité est **`ChatSession.lastWindowReminderSentAt`** (datetime unique), avec un cache miroir `WhatsappChat.last_window_reminder_sent_at`. Il n'existe **pas** de `reminderCount`. Le plan respecte l'architecture réelle (ChatSession faisant autorité).

---

## Éléments réutilisables identifiés (factorisation)

- **`ChatSessionService`** (`chat-session.service.ts`) — source de vérité fenêtre + `markWindowReminderSent()` atomique. À **étendre** pour le multi-paliers, ne pas dupliquer la logique de fenêtre.
- **`AutoMessageMasterJob.runWindowReminder()`** (`auto-message-master.job.ts:491`) — boucle batch (100), résolution template scope-aware, anti-concurrence. À **généraliser** pour itérer sur plusieurs paliers plutôt que dupliquer le cron.
- **`MessageAutoService`** (`message-auto.service.ts`) — `getTemplateForTrigger()`, `hasWindowReminderTemplate()`, `sendWindowReminderWithTemplate()`. Réutilisables tels quels pour chaque palier.
- **`WhatsappMessageGateway`** — pattern `chat:event` `{ type, payload }` vers `poste:${posteId}`. Le nouvel event d'alerte fenêtre **doit** réutiliser ce canal, pas créer un nouveau namespace socket.
- **`mapConversation()`** (`gateway:1835`) — expose déjà `window_expires_at` + `is_ctwa`. Le front peut calculer le compte à rebours **sans backend supplémentaire** pour l'affichage passif (badge). Le socket sert uniquement au déclenchement actif (toast/son).
- **`metriques.controller.ts`** (`/api/metriques`, AdminGuard) — hub des KPIs admin. Ajouter l'endpoint supervision ici, pas un nouveau controller.
- **`MessageTrafficView.tsx`** (admin) — modèle de vue KPI + auto-refresh + barres. À **copier comme gabarit** pour la vue supervision fenêtres.
- **`ConversationItem.tsx`** (front) — déjà consommateur de `window_expires_at`/`is_ctwa`. À étendre pour le badge compte à rebours (pas de nouveau composant liste).
- **`cron_config` entity** — déjà porteuse des délais reminder. Le multi-paliers réutilise cette table (ajout de colonnes paliers), pas une nouvelle table de config.

## Risques de duplication (à éviter)

- **Recalcul de la fenêtre côté front** : ne PAS réimplémenter la logique 24h/72h dans React — consommer `window_expires_at` (déjà calculé serveur). Sinon désync garantie avec `read-only-enforcement`.
- **Nouveau cron multi-paliers** : ne PAS créer un second cron parallèle à `runWindowReminder()` — étendre la méthode existante. Deux crons concurrents sur les mêmes sessions = doubles envois malgré l'idempotence par palier.
- **Nouvel event socket dédié** : ne PAS créer `window:alert` comme event de premier niveau — passer par `chat:event` avec un nouveau `type` discriminant (cohérence avec `WebSocketEvents.tsx`).
- **Table d'historique vs colonne** : le multi-paliers impose de passer de `lastWindowReminderSentAt` (datetime unique) à un **log par palier**. Mutualiser dès le départ la table `window_reminder_log` qui sert AUSSI la Phase 4 (historique). Ne pas créer une structure pour le multi-paliers puis une autre pour l'historique.

---

## Vue d'ensemble des phases et dépendances

```
Phase 1 (P0)  Alertes visuelles commercial  ──┐
                                               │ indépendantes
Phase 2 (P0)  Supervision admin fenêtres  ─────┘ (parallélisables)

Phase 3 (P1)  Multi-relances backend  ─────────► Phase 4 (P1)  Historique relances
   (refonte ChatSession → window_reminder_log)      (réutilise window_reminder_log)
   │
   └─► impacte Phase 2 (la supervision affiche le palier atteint)

Phase 5 (P2)  Différenciation CTWA  ──► quasi-acquise, complément config par palier
              (dépend de Phase 3 pour les paliers CTWA distincts)
```

Dépendances dures :
- **Phase 4 dépend de Phase 3** (la table `window_reminder_log` est créée en Phase 3).
- **Phase 5 dépend de Phase 3** (config paliers CTWA distincts des paliers normaux).
- **Phases 1 et 2 sont indépendantes** entre elles et du reste → à attaquer en premier.
- **Tâche 0 (contrat d'interface)** précède toute parallélisation.

---

## Contrat d'interface (Tâche 0 — obligatoire avant parallélisation)

### Event socket (Phase 1) — réutilise `chat:event`
```
type WindowReminderAlertPayload = {
  chat_id: string;                 // chat_id Whapi
  window_expires_at: string;       // ISO
  minutes_remaining: number;       // entier, recalculé serveur
  is_ctwa: boolean;
  severity: 'warning' | 'critical';// warning = palier lointain, critical = imminent
}
// Émis : server.to(`poste:${posteId}`).emit('chat:event', { type: 'WINDOW_EXPIRY_WARNING', payload })
```

### Endpoint supervision admin (Phase 2)
```
GET /api/metriques/fenetres-a-risque?within_hours=2&filter=expiring|expired|ctwa
[AdminGuard]
→ WindowsAtRiskResponse {
    kpis: {
      atRisk: number;              // fenêtres expirant dans < within_hours
      expiredToday: number;        // fermées par read-only-enforcement aujourd'hui
      ctwaAtRisk: number;
      remindersSentToday: number;  // (Phase 4 : alimenté par window_reminder_log)
    };
    conversations: WindowAtRiskRow[];
  }
WindowAtRiskRow {
  chatId: string; name: string; posteId: string | null; posteName: string | null;
  windowExpiresAt: string; minutesRemaining: number; isCtwa: boolean;
  lastReminderTier: number | null;   // Phase 3+ : dernier palier envoyé
  status: 'actif' | 'attente';
}
```

### Schéma DB multi-paliers (Phase 3)
```
Table window_reminder_log (nouvelle) :
  id              CHAR(36) PK
  whatsapp_chat_id CHAR(36)  (FK logique → whatsapp_chat.id)
  chat_session_id  CHAR(36)  (FK logique → chat_session.id)
  tier             INT        -- index du palier (0 = J-2h, 1 = J-30min, ...)
  sent_at          DATETIME
  is_ctwa          TINYINT
  template_id      CHAR(36) NULL
  poste_id         VARCHAR(100) NULL
  variant          ENUM('with_replies','no_replies') NULL
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  UNIQUE (chat_session_id, tier)   -- idempotence par palier

Table cron_config (colonnes ajoutées) :
  window_reminder_tiers_json  TEXT NULL  -- JSON: [{ minutesBefore: 120 }, { minutesBefore: 30 }] par mode
```

---

## Phase 1 — P0 : Alertes visuelles imminentes côté commercial

**Objectif** : prévenir visuellement le commercial qu'une fenêtre va se fermer, avant qu'elle n'expire — badge compte à rebours passif (calculé front depuis `window_expires_at`) + alerte active (toast/son) déclenchée par le backend quand le seuil est franchi.

| # | Tâche | Fichier | Type | Complexité | Dépend |
|---|---|---|---|---|---|
| 1.1 | Définir le type `WindowReminderAlertPayload` et le discriminant `WINDOW_EXPIRY_WARNING` | `front/src/types/chat.ts` | nouveau type | S | Tâche 0 |
| 1.2 | Émettre `chat:event { type:'WINDOW_EXPIRY_WARNING' }` quand une session passe sous le seuil d'alerte (réutilise `runWindowReminder` qui itère déjà sur les sessions à fenêtre proche) | `message_whatsapp/src/jorbs/auto-message-master.job.ts` | extension méthode | M | Tâche 0 |
| 1.3 | Ajouter la méthode `emitWindowExpiryWarning(chat, minutesRemaining, severity)` | `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | nouvelle méthode (pattern `mapConversation`) | S | 1.1 |
| 1.4 | Hook `useWindowCountdown(windowExpiresAt, channelDedicated)` — calcul passif minutes restantes + niveau (ok/warning/critical), tick 30s | `front/src/hooks/useWindowCountdown.ts` | nouveau hook | S | 1.1 |
| 1.5 | Badge compte à rebours dans la liste des conversations (vert > 6h, orange < 2h, rouge < 30min) — étendre l'item existant | `front/src/components/sidebar/ConversationItem.tsx` | extension composant | M | 1.4 |
| 1.6 | Bandeau d'alerte "expire dans X min" en haut de la conversation ouverte (au-dessus de `ChatMessages`, distinct de la bannière "expirée") | `front/src/components/chat/ChatMainArea.tsx` | extension JSX | M | 1.4 |
| 1.7 | Composant `WindowCountdownBadge` réutilisé par 1.5 et 1.6 (évite duplication du rendu badge) | `front/src/components/chat/WindowCountdownBadge.tsx` | nouveau composant partagé | S | 1.4 |
| 1.8 | Handler du nouveau `type` dans le switch socket : toast + son optionnel | `front/src/components/WebSocketEvents.tsx` | nouveau `case` | S | 1.1, 1.3 |
| 1.9 | Seuils d'alerte configurables (réutiliser les colonnes `window_reminder_*_start/end_min` de `cron_config` déjà présentes) | `message_whatsapp/src/jorbs/auto-message-master.job.ts` | lecture config | S | 1.2 |

**Note de factorisation 1.2** : `runWindowReminder()` charge déjà les sessions dont `autoCloseAt` est dans la fenêtre `[now+min, now+max]`. L'émission de l'alerte se greffe **dans la même boucle** que l'envoi du message de relance — pas de requête supplémentaire ni de second cron. L'alerte socket part même si aucun template J n'est configuré (le fast-exit `if (!hasJ1 && !hasJ2) return` doit être déplacé pour ne pas court-circuiter l'alerte visuelle).

---

## Phase 2 — P0 : Supervision admin des fenêtres

**Objectif** : donner à l'admin une vue temps réel des conversations dont la fenêtre est à risque, avec filtres et KPIs.

| # | Tâche | Fichier | Type | Complexité | Dépend |
|---|---|---|---|---|---|
| 2.1 | Service de supervision : `getWindowsAtRisk(withinHours, filter)` — requête sur `ChatSession` (jointure `WhatsappChat` pour nom/poste/statut), zéro N+1 (`innerJoinAndSelect`) | `message_whatsapp/src/metriques/metriques.service.ts` | nouvelle méthode | M | Tâche 0 |
| 2.2 | Endpoint `GET /api/metriques/fenetres-a-risque` | `message_whatsapp/src/metriques/metriques.controller.ts` | nouvel endpoint `@Get` | S | 2.1 |
| 2.3 | DTO réponse `WindowsAtRiskDto` + `WindowAtRiskRowDto` | `message_whatsapp/src/metriques/dto/windows-at-risk.dto.ts` | nouveau DTO | S | Tâche 0 |
| 2.4 | KPI "expirées aujourd'hui" : compter les chats fermés par `read-only-enforcement` sur la journée (via `ChatSession.endedAt` du jour + statut FERME, ou compteur dédié) | `message_whatsapp/src/metriques/metriques.service.ts` | méthode KPI | M | 2.1 |
| 2.5 | Fonction API admin `getWindowsAtRisk(withinHours, filter)` | `admin/src/app/lib/api.ts` | nouvelle fonction HTTP | S | 2.2 |
| 2.6 | Types `WindowsAtRisk`, `WindowAtRiskRow` | `admin/src/app/lib/definitions.ts` | nouveaux types | S | Tâche 0 |
| 2.7 | Vue `FenetresView.tsx` : 4 cartes KPI + table filtrable (expire bientôt / expirée / CTWA) + auto-refresh 60s (gabarit = `MessageTrafficView.tsx`) | `admin/src/app/ui/FenetresView.tsx` | nouvelle vue | L | 2.5, 2.6 |
| 2.8 | Enregistrer l'onglet dans la navigation admin | `admin/src/app/dashboard/commercial/page.tsx` (ou registre d'onglets) | extension nav | S | 2.7 |
| 2.9 | Badge compte à rebours réutilisable admin (couleur par urgence) — dupliquer depuis le front en signalant la source (composants front/admin non partageables, cf. CLAUDE.md) | `admin/src/app/ui/components/WindowCountdownBadge.tsx` | nouveau composant (copie signalée) | S | 2.7 |

**Note de factorisation 2.1** : la requête réutilise exactement le `innerJoinAndSelect('s.chat','c')` de `runWindowReminder()` (`auto-message-master.job.ts:516`). Extraire un `QueryBuilder` commun « sessions à fenêtre proche » dans `ChatSessionService` (ex. `findSessionsExpiringWithin(minutes)`) consommé par **le cron ET la supervision** évite que les deux divergent.

---

## Phase 3 — P1 : Multi-relances backend

**Objectif** : passer de la relance unique à N paliers (ex. J-2h puis J-30min), avec idempotence par palier et différenciation normal/CTWA.

| # | Tâche | Fichier | Type | Complexité | Dépend |
|---|---|---|---|---|---|
| 3.1 | Entité `WindowReminderLog` (table `window_reminder_log`) — camelCase + `name` snake_case, `@Index` sur `(chatSessionId, tier)` unique | `message_whatsapp/src/chat-session/entities/window-reminder-log.entity.ts` | nouvelle entité | S | Tâche 0 |
| 3.2 | Migration `AddWindowReminderLog{timestamp13}` : table `window_reminder_log` + colonne `cron_config.window_reminder_tiers_json` (guards `columnExists`/`indexExists` comme migrations existantes) | `message_whatsapp/src/database/migrations/AddWindowReminderLog<TS>.ts` | nouvelle migration | M | 3.1 |
| 3.3 | Colonnes entity `cron_config` : `windowReminderTiersJson` (TEXT) | `message_whatsapp/src/jorbs/entities/cron-config.entity.ts` | nouvelle colonne | S | 3.2 |
| 3.4 | `ChatSessionService.markReminderTierSent(sessionId, chatId, tier, meta)` — INSERT idempotent dans `window_reminder_log` (catch duplicate `UNIQUE(session, tier)` → false), remplace `markWindowReminderSent()` | `message_whatsapp/src/chat-session/chat-session.service.ts` | nouvelle méthode | M | 3.1 |
| 3.5 | `ChatSessionService.getSentTiers(sessionId)` — set des paliers déjà envoyés (anti-doublon avant envoi) | `message_whatsapp/src/chat-session/chat-session.service.ts` | nouvelle méthode | S | 3.1 |
| 3.6 | Refonte `runWindowReminder()` : itérer sur les paliers configurés (`window_reminder_tiers_json`), pour chaque palier sélectionner les sessions dont `autoCloseAt ∈ [now+tier-ε, now+tier]` et `tier ∉ getSentTiers`, envoyer + `markReminderTierSent` | `message_whatsapp/src/jorbs/auto-message-master.job.ts` | refonte méthode | L | 3.4, 3.5 |
| 3.7 | Conserver la rétrocompat : si `window_reminder_tiers_json` est NULL, dériver un palier unique depuis les colonnes `start/end_min` existantes (pas de breaking change config) | `message_whatsapp/src/jorbs/auto-message-master.job.ts` | logique fallback | M | 3.6 |
| 3.8 | Déprécier (ne pas supprimer) `ChatSession.lastWindowReminderSentAt` + cache `WhatsappChat.last_window_reminder_sent_at` — laisser alimenté pour rétrocompat lecture, marquer `@deprecated` | `chat-session.entity.ts`, `whatsapp_chat.entity.ts` | annotation | S | 3.6 |
| 3.9 | Config admin paliers : éditeur de paliers (liste minutesBefore + template par palier) dans la vue trigger J existante | `admin/src/app/ui/MessageAutoView.tsx` | extension UI | L | 3.2 |
| 3.10 | Tests : idempotence par palier (deux exécutions concurrentes → un seul INSERT/palier), fallback NULL, frontières de fenêtre | `message_whatsapp/src/jorbs/auto-message-master.job.spec.ts` | tests | M | 3.6 |

**Note d'idempotence 3.4** : la contrainte `UNIQUE(chat_session_id, tier)` est la garantie anti-doublon (équivalent du `IS NULL` atomique actuel mais par palier). L'INSERT en doublon lève une erreur SQL `ER_DUP_ENTRY` → catcher et retourner `false`, exactement comme `markWindowReminderSent()` retourne `false` quand `affected === 0`.

---

## Phase 4 — P1 : Historique des relances

**Objectif** : journaliser et consulter chaque relance envoyée (quand, quel palier, quel template, quel poste).

| # | Tâche | Fichier | Type | Complexité | Dépend |
|---|---|---|---|---|---|
| 4.1 | (Acquis en Phase 3) `window_reminder_log` contient déjà sent_at/tier/template_id/poste_id/variant — aucune table supplémentaire | — | réutilisation | — | Phase 3 |
| 4.2 | Service `getReminderHistory({ chatId?, from?, to?, page })` — pagination, jointure nom poste, zéro N+1 | `message_whatsapp/src/metriques/metriques.service.ts` | nouvelle méthode | M | 3.1 |
| 4.3 | Endpoint `GET /api/metriques/relances-historique` | `message_whatsapp/src/metriques/metriques.controller.ts` | nouvel endpoint | S | 4.2 |
| 4.4 | KPI `remindersSentToday` branché sur `window_reminder_log` (complète la carte de Phase 2.4) | `message_whatsapp/src/metriques/metriques.service.ts` | méthode KPI | S | 4.2 |
| 4.5 | Fonction API admin `getReminderHistory(...)` + types | `admin/src/app/lib/api.ts`, `admin/src/app/lib/definitions.ts` | fonction + types | S | 4.3 |
| 4.6 | Onglet/section "Historique des relances" dans `FenetresView` (table paginée) | `admin/src/app/ui/FenetresView.tsx` | extension vue | M | 4.5 |
| 4.7 | Lien historique par conversation (filtre `chatId`) accessible depuis la table supervision | `admin/src/app/ui/FenetresView.tsx` | extension UI | S | 4.6 |

---

## Phase 5 — P2 : Différenciation CTWA

**Objectif** : messages et paliers de relance distincts pour CTWA (72h) vs normal (24h). **Déjà partiellement acquis** : `runWindowReminder()` distingue déjà `isCtwa` avec des bornes séparées, et `cron_config` porte `window_reminder_ctwa_start/end_min`.

| # | Tâche | Fichier | Type | Complexité | Dépend |
|---|---|---|---|---|---|
| 5.1 | Étendre `window_reminder_tiers_json` pour porter des paliers distincts par mode : `{ normal: [...], ctwa: [...] }` | `message_whatsapp/src/jorbs/entities/cron-config.entity.ts` (format JSON) | format config | S | 3.3 |
| 5.2 | `runWindowReminder()` : sélectionner le set de paliers selon `session.isCtwa` | `message_whatsapp/src/jorbs/auto-message-master.job.ts` | logique branchement | S | 3.6, 5.1 |
| 5.3 | Template de relance par mode : réutiliser le scope template existant (`getTemplateForTrigger`) — ajouter un discriminant CTWA si besoin de messages distincts (sinon le `window_reminder_target` suffit) | `message_whatsapp/src/message-auto/message-auto.service.ts` | extension optionnelle | M | 5.2 |
| 5.4 | Config admin : section paliers CTWA séparée de la section normal dans `MessageAutoView` | `admin/src/app/ui/MessageAutoView.tsx` | extension UI | M | 3.9, 5.1 |
| 5.5 | Badge "CTWA 72h" dans la supervision et l'alerte front (réutiliser `is_ctwa` déjà exposé) | `admin/src/app/ui/FenetresView.tsx`, `front/src/components/chat/WindowCountdownBadge.tsx` | extension affichage | S | 1.7, 2.7 |

---

## Fichiers impactés (synthèse)

### Backend (`message_whatsapp/src/`)
- `whatsapp_message/whatsapp_message.gateway.ts` — nouvelle méthode `emitWindowExpiryWarning` (Phase 1)
- `jorbs/auto-message-master.job.ts` — extension puis refonte `runWindowReminder` (Phases 1, 3, 5)
- `chat-session/chat-session.service.ts` — `markReminderTierSent`, `getSentTiers`, `findSessionsExpiringWithin` (Phases 2, 3)
- `chat-session/entities/window-reminder-log.entity.ts` — **nouveau** (Phase 3)
- `chat-session/entities/chat-session.entity.ts` — `@deprecated` sur `lastWindowReminderSentAt` (Phase 3)
- `jorbs/entities/cron-config.entity.ts` — `windowReminderTiersJson` (Phase 3)
- `database/migrations/AddWindowReminderLog<TS>.ts` — **nouveau** (Phase 3)
- `metriques/metriques.service.ts` — `getWindowsAtRisk`, KPIs, `getReminderHistory` (Phases 2, 4)
- `metriques/metriques.controller.ts` — `/fenetres-a-risque`, `/relances-historique` (Phases 2, 4)
- `metriques/dto/windows-at-risk.dto.ts` — **nouveau** (Phase 2)

### Frontend commercial (`front/src/`)
- `types/chat.ts` — type `WindowReminderAlertPayload` + discriminant (Phase 1)
- `hooks/useWindowCountdown.ts` — **nouveau** (Phase 1)
- `components/chat/WindowCountdownBadge.tsx` — **nouveau** (Phase 1)
- `components/sidebar/ConversationItem.tsx` — badge compte à rebours (Phase 1)
- `components/chat/ChatMainArea.tsx` — bandeau alerte imminente (Phase 1)
- `components/WebSocketEvents.tsx` — `case 'WINDOW_EXPIRY_WARNING'` (Phase 1)

### Admin (`admin/src/`)
- `app/lib/api.ts` — `getWindowsAtRisk`, `getReminderHistory` (Phases 2, 4)
- `app/lib/definitions.ts` — types supervision + historique (Phases 2, 4)
- `app/ui/FenetresView.tsx` — **nouveau** (Phases 2, 4)
- `app/ui/components/WindowCountdownBadge.tsx` — **nouveau** (copie signalée du front) (Phase 2)
- `app/ui/MessageAutoView.tsx` — éditeur de paliers + section CTWA (Phases 3, 5)
- `app/dashboard/commercial/page.tsx` — enregistrement onglet (Phase 2)

---

## Contraintes techniques (à respecter dans chaque tâche)

- **TypeORM camelCase + `name` snake_case** : propriétés en camelCase (`sentAt`, `chatSessionId`), colonnes via `@Column({ name: 'sent_at' })`. QueryBuilder avec property names (`s.autoCloseAt`), jamais column names.
- **Soft-delete** : filtrer `deletedAt IS NULL` / `IsNull()` sur toute requête `WhatsappChat`. `ChatSession` n'a pas de soft-delete (filtrer `endedAt IS NULL` pour les sessions actives).
- **Zéro `any`** : DTOs et payloads socket typés explicitement (point bloquant review).
- **Zéro N+1** : supervision et historique via `innerJoinAndSelect`/`leftJoinAndSelect` ou `IN (:...ids)` — jamais de requête dans une boucle. La boucle d'envoi du cron reste séquentielle (effet de bord WhatsApp) mais charge ses données en amont.
- **Migration naming** : nom de classe finissant par un **timestamp JS 13 chiffres** (ex. `AddWindowReminderLog1781740800000`), sinon échec déploiement. Guards `columnExists`/`indexExists` idempotents comme les migrations existantes.
- **Migrations auto au déploiement** : ne pas proposer de `migration:run` manuel — la migration s'applique automatiquement au déploiement.
- **Idempotence** : tout palier de relance déduplicationné par `UNIQUE(chat_session_id, tier)` avant envoi (équivalent du `IS NULL` atomique actuel).
- **`sanitizeChannel()`** : si un canal est retourné dans un payload de supervision (provider, etc.), appliquer `sanitizeChannel()` au niveau contrôleur — ne jamais exposer `token`/`webhook_secret`/`meta_app_secret`. La supervision n'a besoin que de `is_ctwa`/`channel_dedicated`, pas des credentials.
- **Logs** : jamais de token/secret loggé, même en debug. Utiliser `AppLogger`/`this.logger`, pas `console.log`.
- **Canaux dédiés** : exclure les conversations sur canal dédié (`channel.poste_id IS NOT NULL`) des alertes et de la fermeture — cohérent avec `ChatMainArea` (`!channel_dedicated`) et `read-only-enforcement`. Le front reçoit `channel_dedicated` dans `mapConversation`.
- **Front/admin non partageables** : `WindowCountdownBadge` doit être dupliqué entre `front/` et `admin/` (projets séparés) en signalant la source en commentaire.

---

## Ordre d'implémentation recommandé

1. **Tâche 0 — Contrat d'interface** (event socket, endpoints, schéma `window_reminder_log`). Débloque la parallélisation backend/frontend. *Justification : sans contrat figé, Phase 1 (front) et Phase 2 (back+admin) divergent.*

2. **Phase 1 (P0) — Alertes commercial** et **Phase 2 (P0) — Supervision admin** en **parallèle**. *Justification : indépendantes, plus haute valeur métier immédiate (visibilité), aucune migration lourde, s'appuient sur l'existant (`window_expires_at` déjà exposé, `runWindowReminder` déjà en place). La Phase 1 ne nécessite même pas de changement de schéma.*

3. **Phase 3 (P1) — Multi-relances** : créer `window_reminder_log` + refonte `runWindowReminder`. *Justification : c'est le socle de la Phase 4 et de la Phase 5. À faire avant elles. La rétrocompat (3.7) garantit qu'aucune relance existante ne casse pendant la transition mono→multi paliers. Mettre à jour la supervision (Phase 2) pour afficher `lastReminderTier` une fois la table créée.*

4. **Phase 4 (P1) — Historique** : pur ajout de lecture sur la table déjà créée en Phase 3. *Justification : faible risque, alimente les KPIs de la Phase 2 (`remindersSentToday`).*

5. **Phase 5 (P2) — CTWA** : complément marginal (la distinction `isCtwa` existe déjà dans le cron et la config). *Justification : faible effort résiduel, dépend des paliers de la Phase 3 pour des paliers CTWA réellement distincts.*

### Points d'attention transverses
- **Transition mono→multi paliers (Phase 3)** : pendant le déploiement, `lastWindowReminderSentAt` (ancien) et `window_reminder_log` (nouveau) coexistent. Garder l'écriture de l'ancien champ tant que la Phase 3 n'est pas validée en prod (rollback possible).
- **Charge du cron** : la refonte multi-paliers multiplie le nombre de sélections de sessions (une par palier). Conserver le `LIMIT 100` par palier et le fast-exit. L'index `IDX_chat_window_reminder` existant couvre déjà `(is_ctwa, last_client_message_at, last_window_reminder_sent_at)` — prévoir un index `(chat_session_id, tier)` sur `window_reminder_log` (couvert par la contrainte UNIQUE).
- **Désync cache** : `read-only-enforcement` s'appuie sur `windowExpiresAt`. Ne pas modifier la sémantique de ce champ — les paliers de relance ne doivent **jamais** toucher `autoCloseAt`/`windowExpiresAt`, uniquement journaliser.
- **Seuil d'alerte vs palier de relance** : distinguer l'**alerte visuelle** (Phase 1, purement informative, peut se déclencher plusieurs fois sans message) du **message de relance** (Phase 3, envoyé une fois par palier au client). Ne pas coupler les deux seuils.
```
