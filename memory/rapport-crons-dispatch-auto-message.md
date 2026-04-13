# Rapport d'analyse — Crons, Redispatch & Messages Automatiques

> **Date :** 2026-04-13  
> **Branche analysée :** `production`  
> **Périmètre :** Backend NestJS (`message_whatsapp/src/`)

---

## Table des matières

1. [Architecture globale](#1-architecture-globale)
2. [Inventaire complet des crons](#2-inventaire-complet-des-crons)
3. [Processus de redispatch en détail](#3-processus-de-redispatch-en-détail)
4. [Système de messages automatiques](#4-système-de-messages-automatiques)
5. [Scénario : activation simultanée de tous les processus](#5-scénario--activation-simultanée-de-tous-les-processus)
6. [Processus obsolètes / inutiles](#6-processus-obsolètes--inutiles)
7. [Processus combinables](#7-processus-combinables)
8. [Résumé des risques et recommandations](#8-résumé-des-risques-et-recommandations)

---

## 1. Architecture globale

Tous les crons passent par un **orchestrateur centralisé** : `CronConfigService` (`jorbs/cron-config.service.ts`).

**Principe :**
- Chaque job service s'enregistre via `registerHandler(clé, fn)` dans son `onModuleInit()`.
- `CronConfigService` lit la table `cron_config` en BDD et schedule dynamiquement chaque cron.
- La configuration (activation, intervalle, expression cron) est modifiable depuis le panel admin **sans redémarrage**.
- Un double-check BDD est effectué avant chaque exécution (protection contre désactivation concurrente).

**Types de schedule :**
| Type | Description |
|------|-------------|
| `interval` | `setInterval` — toutes les N minutes |
| `cron` | Expression cron classique (ex: `0 9 * * *`) |
| `event` | Déclenché par un webhook entrant (pas de scheduling) |
| `config` | Configuration pure — jamais schedulée directement |

---

## 2. Inventaire complet des crons

### 2.1 Crons actifs par défaut (`enabled: true`)

#### `sla-checker` — Vérificateur SLA
- **Fichier :** `jorbs/first-response-timeout.job.ts`
- **Type :** `interval` — toutes les **121 minutes minimum** (configurable, min forcé > 120)
- **Plage active :** 5h–21h uniquement (skip silencieux hors plage)
- **Ce qu'il fait :**
  1. Récupère toutes les conversations avec `unread_count > 0` ET `last_client_message_at < cutoff`
  2. Filtre : statuts ACTIF ou EN_ATTENTE uniquement
  3. Limite : 50 conversations par cycle
  4. Pour chacune : appelle `dispatcher.jobRunnerAllPostes(thresholdMinutes)` → `reinjectConversation()`
- **Garde-fou :** Flag `isSlaRunning` (skip si déjà en exécution)
- **Déclenchement supplémentaire :** À la **connexion d'un agent** (`startAgentSlaMonitor(posteId)`) → check immédiat pour ce poste uniquement

---

#### `read-only-enforcement` — Fermeture automatique
- **Fichier :** `jorbs/read-only-enforcement.job.ts`
- **Type :** `interval` — toutes les **60 minutes**
- **Ce qu'il fait :**
  1. Cherche toutes les conversations non fermées avec `last_activity_at < seuil` (défaut : 24h, configurable via `ttlDays`)
  2. Les passe en statut `FERME`, `read_only = false`
  3. Émet `emitConversationClosed()` via WebSocket pour chaque conversation fermée
- **Aucune limite** sur le nombre de conversations fermées par cycle → **risque de burst**

---

#### `offline-reinject` — Réinjection agents hors ligne
- **Fichier :** `jorbs/offline-reinjection.job.ts`
- **Type :** `cron` — **tous les jours à 9h** (`0 9 * * *`)
- **Ce qu'il fait (2 phases) :**
  1. **Phase 1 — Postes offline :** Conversations ACTIF dont le poste associé n'est pas actif (`!poste.is_active`) → `dispatcher.reinjectConversation()` — limite 50
  2. **Phase 2 — Orphelines :** Conversations `poste_id = NULL`, statut ACTIF ou EN_ATTENTE, non read_only → `dispatcher.dispatchOrphanConversation()` — limite 20
- **Chevauchement :** La Phase 2 fait exactement la même chose que `orphan-checker` (voir §7)

---

#### `webhook-purge` — Purge idempotency log
- **Fichier :** `whapi/webhook-idempotency-purge.service.ts`
- **Type :** `cron` — **tous les jours à 3h** (`0 3 * * *`)
- **Ce qu'il fait :**
  - Supprime les entrées `webhook_event_log` plus vieilles que TTL (défaut : 14 jours)
  - Suppression par **lots de 500** avec pause 50ms entre chaque lot
- **Impact :** Purement de maintenance, aucun impact fonctionnel

---

#### `orphan-checker` — Rattrapage orphelins
- **Fichier :** `jorbs/orphan-checker.job.ts`
- **Type :** `interval` — toutes les **15 minutes**
- **Plage active :** 5h–21h uniquement
- **Ce qu'il fait :**
  - Cherche conversations `poste_id = NULL`, statut ACTIF ou EN_ATTENTE, `read_only = false`
  - Limite : 20 par cycle
  - Pour chacune : `dispatcher.dispatchOrphanConversation()`
- **Rôle :** Filet de sécurité si le dispatch initial a échoué

---

### 2.2 Crons désactivés par défaut (`enabled: false`)

#### `auto-message-master` — Job maître messages auto
- **Fichier :** `jorbs/auto-message-master.job.ts`
- **Type :** `interval` — toutes les **5 minutes**
- **Plage active :** 5h–21h (configurable)
- **Ce qu'il fait :**
  1. Charge toutes les configs de triggers (8 triggers A-I)
  2. Détecte si l'orchestrateur événementiel (`auto-message`) est aussi actif → garde-fou
  3. Exécute séquentiellement les triggers A, C, D, E, F, G, H, I en try/catch isolé
  4. Log un warning si l'exécution dépasse 30 secondes

| Trigger | Condition | Action |
|---------|-----------|--------|
| **A — No response** | Client sans réponse depuis N min (défaut 60min) | Envoie message "sans réponse" |
| **C — Out of hours** | Client écrit hors horaires + flag non envoyé | Envoie message "hors horaires" |
| **D — Reopened** | Conversation réouverte (`reopened_at` récent) | Envoie message "bienvenue retour" |
| **E — Queue wait** | Client EN_ATTENTE sans poste depuis N min (défaut 30min) | Envoie message "vous êtes en attente" |
| **F — Keyword** | Dernier message client contient un mot-clé | Envoie réponse associée au mot-clé |
| **G — Client type** | Nouveau ou client connu (flag non envoyé) | Message personnalisé selon type |
| **H — Inactivity** | Aucune activité depuis N min (défaut 120min) | Envoie message de relance |
| **I — On assign** | Agent assigné (champ `assigned_at` récent) | Message d'accueil post-assignation |

---

#### `auto-message` — Orchestrateur séquence (mode événementiel legacy)
- **Fichier :** `message-auto/auto-message-orchestrator.service.ts`
- **Type :** `event` (jamais schedulé — déclenché par webhook)
- **Ce qu'il fait :**
  - Appelé par `InboundMessageService` à chaque message client entrant
  - Pose un **verrou mémoire** (`locks Set`) + `read_only = true` en BDD
  - Schedule un `setTimeout` (délai 300–540s par défaut) puis envoie le prochain message de séquence
  - Respecte la fenêtre 23h WhatsApp
  - Safety timeout de 10 min pour libérer le verrou si freeze
- **Mode :** Séquence numérotée (positions 1, 2, 3…) — système **legacy**

---

#### Clés `config` uniquement (jamais schedulées)
Ces 8 clés sont de la **configuration pure** lue par `auto-message-master` :
`no-response-auto-message`, `out-of-hours-auto-message`, `reopened-auto-message`, `queue-wait-auto-message`, `keyword-auto-message`, `client-type-auto-message`, `inactivity-auto-message`, `on-assign-auto-message`

---

### 2.3 Service fantôme — `tasks.service.ts`
- **Fichier :** `jorbs/tasks.service.ts`
- Contient uniquement du code **entièrement commenté**
- N'enregistre aucun handler, ne fait rien
- Reliquat d'une première implémentation avec `@Cron()` décorateurs NestJS

---

## 3. Processus de redispatch en détail

### 3.1 `dispatcher.reinjectConversation(chat)`
Appelé par : `sla-checker`, `offline-reinject` (phase 1)

**Logique :**
1. Ignore si `read_only = true`
2. Ignore si le channel du chat a un poste dédié (`getDedicatedPosteId()`)
3. Ignore s'il n'y a qu'un seul poste dans la queue (réassigner vers soi-même = inutile)
4. **Atomicité :** Trouve le nouveau poste via `QueueService.getNextInQueue()` AVANT de libérer l'ancien
5. Met à jour `poste_id`, ajoute une deadline `+30 min` (évite que le SLA checker le reprenne immédiatement)
6. Émet `CONVERSATION_ASSIGNED` via WebSocket

### 3.2 `dispatcher.dispatchOrphanConversation(chat)`
Appelé par : `orphan-checker`, `offline-reinject` (phase 2)

**Logique :**
1. Récupère le prochain poste via `QueueService.getNextInQueue()` (algorithme least-loaded)
2. Assigne le poste à la conversation
3. Émet `CONVERSATION_ASSIGNED`
4. Si aucun poste disponible → conversation reste orpheline

### 3.3 `dispatcher.jobRunnerAllPostes(thresholdMinutes)`
Utilisé par : `sla-checker`

**Logique :**
1. Mutex léger `isSlaRunning` (skip si déjà en cours)
2. Requête BDD : `unread_count > 0 AND last_client_message_at < cutoff AND status IN (EN_ATTENTE, ACTIF)`
3. Pour chaque conversation (max 50) : `reinjectConversation()`
4. Notifie via `NotificationService`

### 3.4 `QueueService` — Algorithme d'assignation
- **Stratégie :** Least-loaded (poste avec le moins de chats actifs + en attente)
- **Exclusion :** Les postes qui ont des canaux dédiés sont exclus de la queue globale
- **Thread-safety :** Mutex `queueLock`
- **Init :** À chaque démarrage du serveur, remplit la queue avec tous les postes actifs

---

## 4. Système de messages automatiques

### 4.1 Deux modes en parallèle (attention !)

```
Mode 1 — SÉQUENCE (Legacy)                Mode 2 — TRIGGERS MULTI (Nouveau)
─────────────────────────────────          ──────────────────────────────────────
auto-message (event-driven)                auto-message-master (polling 5min)
  └─ AutoMessageOrchestrator                  └─ Triggers A, C, D, E, F, G, H, I
      └─ sendAutoMessage(step)                     └─ sendAutoMessageForTrigger(trigger, step)
      [positions 1, 2, 3...]                       [tracking par trigger distinct]
```

Ces deux modes peuvent **coexister simultanément** si les deux sont activés.
Le garde-fou existe mais n'est **pas parfait** (voir §5).

### 4.2 Tracking des états dans `WhatsappChat`

Chaque conversation possède **19 champs de tracking** pour les auto-messages :

| Champ | Mode | Usage |
|-------|------|-------|
| `auto_message_step` | Séquence | Étape courante (0 = pas démarré) |
| `waiting_client_reply` | Séquence | `true` = conversation verrouillée |
| `last_auto_message_sent_at` | Séquence | Timestamp dernier envoi |
| `no_response_auto_step` | Trigger A | Étape envoyée |
| `last_no_response_auto_sent_at` | Trigger A | Timestamp |
| `out_of_hours_auto_sent` | Trigger C | Flag booléen |
| `reopened_at` / `reopened_auto_sent` | Trigger D | Timestamp + flag |
| `queue_wait_auto_step` | Trigger E | Étape envoyée |
| `last_queue_wait_auto_sent_at` | Trigger E | Timestamp |
| `keyword_auto_sent_at` | Trigger F | Timestamp |
| `client_type_auto_sent` | Trigger G | Flag booléen |
| `is_known_client` | Trigger G | true/false/null |
| `inactivity_auto_step` | Trigger H | Étape envoyée |
| `last_inactivity_auto_sent_at` | Trigger H | Timestamp |
| `on_assign_auto_sent` | Trigger I | Flag booléen |

### 4.3 Idempotence et verrous

- **Verrou mémoire** : `Set<string>` de chatIds dans l'orchestrateur (double-check race condition)
- **Verrou BDD** : `read_only = true` pendant le délai d'attente
- **Safety timeout** : 10 min → libération forcée si freeze
- **Tracking AVANT envoi** : les champs de suivi sont mis à jour avant l'envoi effectif pour éviter le double envoi

---

## 5. Scénario : activation simultanée de tous les processus

> **⚠️ AVERTISSEMENT CRITIQUE :** N'activez jamais tous les processus simultanément en production sans comprendre les interactions ci-dessous.

### 5.1 Risque CRITIQUE — Double message auto

**Quand :** `auto-message` (séquence) + `auto-message-master` + triggers A et/ou H actifs  
**Scénario :**
1. Client envoie un message → `InboundMessageService` appelle `AutoMessageOrchestrator.handleClientMessage()`
2. L'orchestrateur pose `read_only = true` + schedule un `setTimeout(5min)`
3. **5 minutes plus tard**, `auto-message-master` tourne → trigger A cherche les conversations sans réponse
4. Le garde-fou vérifie `auto_message_step = 0 AND waiting_client_reply = false`
5. **Bug :** Si l'orchestrateur a envoyé son message mais n'a pas encore mis à jour `waiting_client_reply` (fenêtre de quelques ms), le trigger A passe le garde-fou → **2 messages envoyés**

**Probabilité :** Faible mais réelle (race condition sur la BDD)

---

### 5.2 Risque ÉLEVÉ — Overlap Trigger A + Trigger H

**Trigger A :** Client sans réponse depuis 60 min  
**Trigger H :** Aucune activité depuis 120 min  
**Problème :** Une conversation ACTIF sans activité depuis 120 min satisfait les **deux triggers simultanément**. Deux messages sont envoyés dans le même cycle de 5 min.

**Cas concret :**
- 9h00 : Client envoie un message, agent ne répond pas
- 11h00 : Trigger A s'exécute → envoie "Nous n'avons pas oublié votre demande"
- 11h00 : Trigger H s'exécute dans le même cycle → envoie "Êtes-vous toujours là ?"
→ Client reçoit 2 messages automatiques en quelques secondes

---

### 5.3 Risque ÉLEVÉ — Overlap Trigger A + Trigger E

**Trigger A :** Client sans réponse, conversation ACTIF ou EN_ATTENTE  
**Trigger E :** Client EN_ATTENTE sans poste depuis 30 min  
**Problème :** Une conversation EN_ATTENTE (sans poste) + sans réponse depuis 60 min satisfait **A ET E**.

---

### 5.4 Risque ÉLEVÉ — Race condition dispatch

**Quand :** `sla-checker` (toutes les 121 min) + `orphan-checker` (toutes les 15 min) actifs simultanément  
**Scénario :**
1. Conversation orpheline (poste_id = NULL)
2. `orphan-checker` commence à la dispatcher → `dispatchOrphanConversation()`
3. En parallèle, `sla-checker` la détecte et appelle `reinjectConversation()`
4. La conversation peut se retrouver assignée à **deux postes différents** dans la même seconde

**Note :** Le mutex `isSlaRunning` ne protège que contre les exécutions multiples du SLA checker lui-même, pas contre la concurrence avec orphan-checker.

---

### 5.5 Risque MODÉRÉ — Fermeture intempestive

**Quand :** `read-only-enforcement` + `sla-checker` + `auto-message-master` actifs  
**Scénario :**
1. Conversation inactive depuis 23h (sous le seuil de 24h de fermeture)
2. `sla-checker` réinjecte la conversation (nouveau poste assigné)
3. 60 min plus tard, `read-only-enforcement` s'exécute → ferme la conversation car `last_activity_at` est toujours ancien
4. La réinjection était inutile, le client perd sa conversation

---

### 5.6 Risque MODÉRÉ — Surcharge base de données

**Crons actifs en parallèle potentiel :**
- `orphan-checker` : requête `whatsapp_chat` toutes les 15 min
- `auto-message-master` : 8 requêtes `whatsapp_chat` toutes les 5 min
- `sla-checker` : 1 grande requête `whatsapp_chat` toutes les 121 min
- `read-only-enforcement` : 1 requête `whatsapp_chat` toutes les 60 min
- `offline-reinject` : 2 requêtes + relations à 9h

**Total théorique :** Jusqu'à **~11 requêtes simultanées** sur `whatsapp_chat` si tout s'exécute en même temps (notamment à 9h où `offline-reinject` démarre pendant qu'`orphan-checker` et `auto-message-master` tournent aussi).

Le `auto-message-master` lui-même avertit si son exécution dépasse 30 secondes — signe de surcharge DB.

---

### 5.7 Risque FAIBLE — Trigger F (mots-clés) redondant

Le trigger F lit le dernier message client via `findLastInboundMessageBychat_id()` pour chaque conversation de la fenêtre. Si 30 conversations sont analysées × 8 triggers = **30+ requêtes supplémentaires** par cycle.

---

### 5.8 Tableau récapitulatif des risques

| Scénario | Niveau | Impact |
|----------|--------|--------|
| Double message (séquence + master + trigger A) | 🔴 CRITIQUE | Client reçoit 2 messages identiques |
| Overlap A + H (no-response + inactivity) | 🟠 ÉLEVÉ | 2 messages différents en même temps |
| Overlap A + E (no-response + queue-wait) | 🟠 ÉLEVÉ | 2 messages pour même conversation |
| Race condition orphan-checker + sla-checker | 🟠 ÉLEVÉ | Double assignation de poste |
| Fermeture pendant réinjection | 🟡 MODÉRÉ | Conversation perdue |
| Surcharge DB à 9h | 🟡 MODÉRÉ | Lenteurs, timeouts possibles |
| Trigger F — requêtes excessives | 🟢 FAIBLE | Performance dégradée |

---

## 6. Processus obsolètes / inutiles

### 6.1 `tasks.service.ts` — FICHIER MORT

- **Fichier :** `jorbs/tasks.service.ts`
- **État :** 100% commenté, aucune fonctionnalité active
- **Verdict :** Ce fichier peut être **supprimé sans aucun impact**. Il s'agit d'un vestige de la première implémentation du système de crons avec les décorateurs `@Cron()` de NestJS, remplacé depuis par l'architecture dynamique `CronConfigService`.

---

### 6.2 `auto-message` (séquence legacy) — DÉPRÉCIÉ FONCTIONNELLEMENT

- **Clé :** `auto-message` (scheduleType = `event`)
- **État :** Désactivé par défaut
- **Problème :** Le nouveau système `auto-message-master` avec ses 8 triggers (A-I) remplace **complètement** ce mode séquence numéroté. La cohabitation des deux modes est dangereuse (voir §5.1).
- **Impact si conservé :** Source de confusion, garde-fous partiels, risque de double message
- **Verdict :** Si vous n'avez plus de templates `trigger_type = SEQUENCE` actifs en BDD, le mode événementiel (`AutoMessageOrchestrator`) peut être **retiré du flux** en supprimant l'appel à `handleClientMessage()` dans `InboundMessageService`.

---

### 6.3 `syncFromDispatchSettings` / `getDispatchCompatSettings` — BACKWARD COMPAT MORTE

- **Fichier :** `jorbs/cron-config.service.ts` lignes 615–698
- **Rôle :** Synchronisation entre l'ancienne table `dispatch_settings` et la nouvelle table `cron_config`
- **État :** Méthodes de rétro-compatibilité maintenues pour ne pas casser l'API `GET /queue/dispatch/settings`
- **Verdict :** Si l'ancienne table `dispatch_settings` a été migrée et l'API mise à jour, ces méthodes sont **inutiles**. À confirmer avant suppression.

---

### 6.4 Phase 2 de `offline-reinject` — REDONDANTE

- **Ce qu'elle fait :** Dispatche les conversations orphelines (poste_id = NULL)
- **Conflit :** C'est **exactement ce que fait `orphan-checker`** toutes les 15 min
- **Verdict :** La Phase 2 de `offline-reinject` est redondante. Elle tourne seulement une fois par jour à 9h, alors qu'`orphan-checker` couvre déjà ce cas toutes les 15 min (96× par jour).
- **Recommandation :** Supprimer la Phase 2 de `offlineReinject()` et garder uniquement la Phase 1 (postes offline).

---

## 7. Processus combinables

### 7.1 `orphan-checker` + Phase 2 de `offline-reinject` → FUSIONNER

**Situation actuelle :**
- `orphan-checker` : dispatche les orphelins toutes les 15 min
- `offline-reinject` Phase 2 : dispatche les orphelins une fois par jour à 9h

**Solution :** Supprimer la Phase 2 de `offline-reinject`. L'`orphan-checker` couvre déjà ce besoin de manière bien plus fréquente.

---

### 7.2 Trigger A + Trigger H → PARAMÉTRAGE MUTUELLEMENT EXCLUSIF

**Problème :** Les triggers A (no-response) et H (inactivity) se chevauchent fortement.
- Trigger A : cible les conversations où le **client** attend une réponse agent
- Trigger H : cible les conversations sans **aucune** activité (des deux côtés)

**Cas d'overlap :** Une conversation ACTIF où personne n'a écrit depuis 2h → satisfait A (si 60min) ET H (si 120min).

**Solution sans fusionner le code :** Ajouter dans la config de Trigger H une condition `c.last_poste_message_at IS NOT NULL OR c.no_response_auto_step > 0` pour ne cibler que les conversations **déjà prises en charge** par un agent (côté client actif, côté agent silencieux depuis longtemps).

---

### 7.3 `sla-checker` + `orphan-checker` → Un seul "Health Check Job"

**Situation actuelle :** Deux jobs distincts qui interrogent la même table `whatsapp_chat` avec des critères différents.

**Proposition de fusion :**
```
HealthCheckJob (toutes les 15 min, 5h-21h)
  ├─ Phase 1 : Orphelins → dispatchOrphanConversation() [actuel orphan-checker]
  └─ Phase 2 : SLA expired → reinjectConversation() [actuel sla-checker, seuil > 121min]
```

**Avantages :**
- Une seule requête DB pour les deux
- Moins de scheduling à gérer
- Élimination de la race condition §5.4

**Inconvénient :** Le sla-checker doit rester à 121 min minimum → le health check tournerait toutes les 15 min mais n'exécuterait la Phase 2 que si le délai SLA est atteint (tracking `lastSlaRunAt`).

---

### 7.4 Triggers C, D, G, I → "One-shot triggers" (déjà bien conçus)

Ces triggers ont des flags booléens (`out_of_hours_auto_sent`, `reopened_auto_sent`, `client_type_auto_sent`, `on_assign_auto_sent`) qui garantissent qu'ils ne s'exécutent qu'une seule fois par conversation. Ils sont bien conçus et n'ont pas besoin de modification.

---

## 8. Résumé des risques et recommandations

### Ce qu'il faut faire IMMÉDIATEMENT

| Priorité | Action |
|----------|--------|
| 🔴 P0 | **Ne pas activer** `auto-message` (séquence) ET `auto-message-master` en même temps |
| 🔴 P0 | **Ne pas activer** Trigger A ET Trigger H simultanément sans garde-fou supplémentaire |
| 🔴 P0 | **Ne pas activer** Trigger A ET Trigger E pour les mêmes conversations |
| 🟠 P1 | Supprimer `tasks.service.ts` (fichier mort) |
| 🟠 P1 | Supprimer la Phase 2 de `offline-reinject` (redondante avec orphan-checker) |
| 🟡 P2 | Ajouter un mutex partagé entre `sla-checker` et `orphan-checker` |
| 🟡 P2 | Clarifier l'état de `syncFromDispatchSettings` — supprimer si dispatch_settings est migré |
| 🟢 P3 | Envisager la fusion `sla-checker` + `orphan-checker` en un seul health-check job |

### Configuration recommandée pour une activation progressive

1. **Phase 1 — Socle stable** (tout activer)  
   ✅ `sla-checker` + `orphan-checker` + `offline-reinject` + `webhook-purge` + `read-only-enforcement`

2. **Phase 2 — Messages auto (choisir UN seul mode)**  
   - Mode polling : `auto-message-master` + triggers C, D, G, I uniquement (one-shot, sûrs)
   - Ne PAS activer A, E, H simultanément → les activer un par un en testant

3. **Phase 3 — Triggers timing (ajouter avec précaution)**  
   - Activer A OU E OU H (jamais deux à la fois sans garde-fou mutuellement exclusif)

4. **À ne JAMAIS faire**  
   ❌ `auto-message` (séquence) + `auto-message-master` en même temps  
   ❌ Trigger A + H + E tous actifs sans configuration des seuils qui les rendent mutuellement exclusifs

---

## Annexe — Fichiers clés

| Fichier | Rôle |
|---------|------|
| `jorbs/cron-config.service.ts` | Orchestrateur centralisé de tous les crons |
| `jorbs/first-response-timeout.job.ts` | SLA checker (réinjection non-répondus) |
| `jorbs/offline-reinjection.job.ts` | Réinjection agents offline (+ orphelins redondant) |
| `jorbs/orphan-checker.job.ts` | Rattrapage conversations sans poste |
| `jorbs/read-only-enforcement.job.ts` | Fermeture automatique conversations inactives |
| `jorbs/auto-message-master.job.ts` | Job maître — 8 triggers messages auto |
| `jorbs/tasks.service.ts` | **Fichier mort — 100% commenté** |
| `message-auto/auto-message-orchestrator.service.ts` | Orchestrateur séquence legacy (événementiel) |
| `message-auto/message-auto.service.ts` | Sélection et envoi des templates |
| `dispatcher/dispatcher.service.ts` | Logique d'assignation et réinjection |
| `dispatcher/services/queue.service.ts` | File d'attente least-loaded des postes |
| `whapi/webhook-idempotency-purge.service.ts` | Purge log idempotency webhook |
