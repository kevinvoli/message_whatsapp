# Modèle d'état auto-message — `whatsapp_chat`

> **TICKET-07-B** — Référence pour la migration FlowBot  
> Source : `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

---

## Vue d'ensemble

La table `whatsapp_chat` héberge **19 colonnes** dédiées à l'orchestration des messages automatiques.
Ces champs sont gérés par `AutoMessageMasterJob` (via 9 triggers A–I).

**Propriétaire actuel :** `AutoMessageMasterJob` (cron) + `AutoMessageOrchestratorService`  
**Propriétaire cible :** FlowBot (migration à venir — TICKET-07-A)

---

## Groupe 1 — Séquence principale (Trigger B : séquence pas-à-pas)

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `auto_message_id` | varchar(100) | oui | null | ID du `MessageAuto` de la séquence active (config parente) |
| `current_auto_message_id` | varchar(100) | oui | null | ID du `MessageAuto` de l'étape courante dans la séquence |
| `auto_message_status` | varchar(100) | oui | null | Statut de la séquence (`active`, `paused`, `done`, …) |
| `auto_message_step` | int | non | 0 | Numéro de l'étape courant dans la séquence |
| `waiting_client_reply` | boolean | non | false | `true` si la séquence attend une réponse du client avant la prochaine étape |
| `last_auto_message_sent_at` | timestamp | oui | null | Dernier envoi de la séquence principale |

**Cycle de vie :**  
Initié à l'arrivée d'un premier message → reset à `0` / `null` quand le client répond ou que la séquence se termine.

---

## Groupe 2 — Trigger A : Sans réponse commerciale

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `no_response_auto_step` | int | non | 0 | Étape dans la chaîne "pas de réponse commerciale" |
| `last_no_response_auto_sent_at` | timestamp | oui | null | Dernier envoi de ce trigger |

**Déclencheur :** conversation `EN_ATTENTE` sans réponse d'un commercial depuis N minutes.  
**Reset :** dès qu'un commercial envoie un message.

---

## Groupe 3 — Trigger C : Hors horaires d'ouverture

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `out_of_hours_auto_sent` | boolean | non | false | `true` = message "hors horaires" déjà envoyé pour cette session |

**Déclencheur :** message entrant hors `BusinessHoursConfig`.  
**Reset :** à l'ouverture du prochain jour ouvré (ou réouverture manuelle).

---

## Groupe 4 — Trigger D : Réouverture de conversation

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `reopened_at` | timestamp | oui | null | Timestamp du dernier passage `FERME → ACTIF` |
| `reopened_auto_sent` | boolean | non | false | `true` = message de réouverture déjà envoyé |

**Déclencheur :** conversation FERME reçoit un nouveau message entrant.  
**Reset :** à la fermeture suivante.

---

## Groupe 5 — Trigger E : Attente en queue

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `queue_wait_auto_step` | int | non | 0 | Étape dans la chaîne "attente queue" |
| `last_queue_wait_auto_sent_at` | timestamp | oui | null | Dernier envoi de ce trigger |

**Déclencheur :** conversation `EN_ATTENTE` sans poste assigné depuis N minutes.  
**Reset :** à l'assignation d'un poste.

---

## Groupe 6 — Trigger F : Mot-clé

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `keyword_auto_sent_at` | timestamp | oui | null | Timestamp du dernier envoi déclenché par un mot-clé |

**Déclencheur :** message entrant contient un mot-clé configuré dans `AutoMessageKeyword`.  
**Reset :** aucun reset automatique (cooldown géré par timestamp).

---

## Groupe 7 — Trigger G : Type de client

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `client_type_auto_sent` | boolean | non | false | `true` = message "type client" déjà envoyé |
| `is_known_client` | boolean | oui | null | `true` = client connu (contact existant), `false` = inconnu, `null` = pas encore évalué |

**Déclencheur :** premier message du client dans une conversation nouvelle.  
**Reset :** à la fermeture de la conversation.

---

## Groupe 8 — Trigger H : Inactivité totale

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `inactivity_auto_step` | int | non | 0 | Étape dans la chaîne "inactivité totale" |
| `last_inactivity_auto_sent_at` | timestamp | oui | null | Dernier envoi de ce trigger |

**Déclencheur :** aucun message (ni client ni commercial) depuis N heures.  
**Reset :** à tout nouveau message dans la conversation.

---

## Groupe 9 — Trigger I : Après assignation

| Champ | Type | Nullable | Défaut | Rôle |
|-------|------|----------|--------|------|
| `on_assign_auto_sent` | boolean | non | false | `true` = message "après assignation" déjà envoyé |

**Déclencheur :** `poste_id` passe de `null` → valeur (assignation).  
**Reset :** à la désassignation ou fermeture.

---

## Résumé des resets

| Événement | Champs réinitialisés |
|-----------|---------------------|
| Réponse du client | `no_response_auto_step`, `last_no_response_auto_sent_at`, `waiting_client_reply` |
| Réponse d'un commercial | `no_response_auto_step`, `last_no_response_auto_sent_at` |
| Assignation d'un poste | `queue_wait_auto_step`, `last_queue_wait_auto_sent_at` |
| Nouveau message (toute origine) | `inactivity_auto_step`, `last_inactivity_auto_sent_at` |
| Fermeture de conversation | `reopened_auto_sent`, `out_of_hours_auto_sent`, `client_type_auto_sent`, `on_assign_auto_sent` |
| Réouverture | `reopened_at = NOW()`, `reopened_auto_sent = false` |

---

## Notes pour la migration FlowBot

- Ces 19 champs sont **couplés fortement à `whatsapp_chat`** — migration non-triviale.
- La stratégie retenue (TICKET-07-A) : FlowBot maintient son propre état dans `bot_conversation`, et les champs existants restent en place jusqu'à la bascule complète.
- **`is_known_client`** est le seul champ qui a une valeur métier hors auto-messages (utilisé pour le routing du dispatcher).
- Les `*_step` fields sont des compteurs d'étapes; ils référencent implicitement la liste ordonnée de `MessageAuto` pour un trigger donné.
