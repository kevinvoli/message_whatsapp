# Rapport de Bug — Réattribution intempestive de conversation

**Date :** 2026-06-09  
**Sévérité :** Haute (P1)  
**Branche :** `production`  
**Rapporté par :** Utilisateur (observation terrain)

---

## Symptôme observé

Quand un commercial est en train de répondre à une conversation, celle-ci **disparaît de sa liste** et réapparaît chez un autre commercial, comme si elle venait d'arriver. Le commercial original perd l'accès à la conversation en cours de frappe.

---

## Scénario de reproduction (le plus probable)

```
T+00:00 | Client envoie un message
T+00:01 | assignConversation() dispatche la conversation au Commercial A
         | Chat : poste_id=A, last_client_message_at=T0, last_poste_message_at=NULL, unread_count=1

T+02:00 | Commercial A voit le chat, commence à taper sa réponse
T+02:30 | Commercial A envoie sa réponse via WebSocket (event 'message:send')
T+02:31 | createAgentMessage() crée le message en DB et appelle l'API Whapi
T+02:32 | L'appel Whapi timeout ou échoue (réseau lent, surcharge API)
         | Exception levée → le bloc UPDATE du chat n'est PAS exécuté
         | Chat : poste_id=A, last_poste_message_at=NULL ← INCHANGÉ !

T+15:00 | SLA Checker s'exécute (cron toutes les 15 minutes)
T+15:01 | Condition : last_poste_message_at (NULL) < last_client_message_at (T0) → VRAI
         | → reinjectConversation() est appelé
T+15:02 | Conversation réassignée au Commercial B (prochain dans la queue)
         | Gateway WebSocket émet CONVERSATION_REMOVED à A, CONVERSATION_ASSIGNED à B

T+15:03 | ❌ Commercial A voit la conversation DISPARAÎTRE en plein milieu de sa réponse
         | ❌ Commercial B voit la conversation APPARAÎTRE sans contexte
```

---

## Causes racines identifiées

### Cause 1 — Race condition entre l'envoi Whapi et la mise à jour du chat (PRINCIPALE)

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

La mise à jour de `last_poste_message_at` et `unread_count` se fait **après** l'appel à l'API Whapi. Si cet appel échoue ou timeout, le `UPDATE` sur la table `whatsapp_chat` n'est jamais exécuté. Le SLA checker voit alors un chat sans réponse agent et le réinjecte.

```typescript
// Ordre actuel (problématique)
1. await whapiClient.sendMessage(...)   // ← Si ça plante ici...
2. await chatRepository.update(...)    // ← ...cette ligne n'est jamais atteinte
```

**Correction attendue :** Mettre à jour `last_poste_message_at` AVANT l'envoi Whapi, ou dans une transaction qui garantit la mise à jour même en cas d'échec de l'envoi.

---

### Cause 2 — Le SLA Checker ne vérifie pas la présence réelle d'un message agent en DB

**Fichier :** `message_whatsapp/src/dispatcher/dispatcher.service.ts`

Le filtre utilisé pour décider qu'une conversation n'a pas reçu de réponse est :

```sql
(chat.last_poste_message_at IS NULL OR chat.last_poste_message_at < chat.last_client_message_at)
```

Ce filtre repose **uniquement sur le timestamp** stocké dans `whatsapp_chat`. Il ne vérifie pas s'il existe réellement un message de l'agent en base avec un timestamp supérieur à `last_client_message_at`. Un simple désynchronisme suffit à déclencher la réattribution.

---

### Cause 3 — Absence de verrou de protection "en cours de réponse"

Il n'existe pas de mécanisme qui signale que le commercial est **activement en train de rédiger une réponse**. Les jobs SLA et offline-reinjection ne savent pas qu'un agent a la conversation ouverte et est en train d'écrire. Dès que le délai SLA expire, la réattribution a lieu sans distinction.

---

### Cause 4 — Le job offline-reinjection peut aggraver la situation au démarrage journalier

**Fichier :** `message_whatsapp/src/jorbs/offline-reinjection.job.ts`

Ce job s'exécute chaque matin à 09:00 et réinjecte toutes les conversations avec `unread_count > 0` assignées à un poste hors ligne, **ainsi que toutes les conversations orphelines** (`poste_id=NULL`). Si la mise à jour de `last_poste_message_at` n'a pas eu lieu la veille, des conversations "répondues" mais mal marquées sont réinjectées massivement à la réouverture.

---

## Composants impactés

| Composant | Fichier | Rôle dans le bug |
|-----------|---------|-----------------|
| `createAgentMessage()` | `whatsapp_message/whatsapp_message.service.ts` | Ne met pas à jour le chat si l'envoi Whapi échoue |
| `jobRunnerAllPostes()` | `dispatcher/dispatcher.service.ts` | SLA Checker qui déclenche la réattribution |
| `reinjectConversation()` | `dispatcher/dispatcher.service.ts` | Effectue la réassignation au commercial suivant |
| `first-response-timeout.job.ts` | `jorbs/` | Cron toutes les 15 min qui appelle le SLA Checker |
| `offline-reinjection.job.ts` | `jorbs/` | Cron 09:00 qui réinjecte en masse |
| `whatsapp_message.gateway.ts` | `whatsapp_message/` | Émet les événements de disparition/apparition vers le frontend |

---

## Champs critiques impliqués (entité `whatsapp_chat`)

| Champ | Rôle | Problème potentiel |
|-------|------|-------------------|
| `last_client_message_at` | Timestamp du dernier message client | Toujours mis à jour correctement |
| `last_poste_message_at` | Timestamp du dernier message agent | **Peut rester NULL si l'envoi Whapi échoue** |
| `unread_count` | Nombre de messages non lus | Remis à 0 seulement si le chat est bien mis à jour |
| `poste_id` | Commercial actuellement assigné | Modifié par reinjectConversation() lors de la réattribution |
| `status` | État de la conversation | Peut passer à EN_ATTENTE lors de la réinjection |

---

## Impact utilisateur

- **Commercial A** : perd la conversation en cours de frappe, sans explication
- **Commercial B** : reçoit une conversation déjà traitée, perd du temps
- **Client** : peut recevoir une double réponse ou aucune réponse cohérente
- **Superviseur** : les métriques SLA sont faussées (réponses non comptabilisées)

---

## Corrections recommandées (par priorité)

### P0 — Mise à jour atomique du chat avant envoi Whapi

Dans `whatsapp_message.service.ts`, déplacer la mise à jour de `last_poste_message_at` et `unread_count` **avant** l'appel Whapi, ou l'encapsuler dans une transaction qui s'exécute indépendamment du résultat de l'envoi.

```typescript
// Ordre corrigé
1. await chatRepository.update({ chat_id }, { last_poste_message_at: now, unread_count: 0 })
2. await whapiClient.sendMessage(...)  // L'envoi peut échouer sans affecter l'état du chat
```

### P1 — Ajouter une vérification de message en DB dans le SLA Checker

Avant de réinjecter, vérifier qu'il n'existe pas un message agent en `whatsapp_message` avec `created_at > last_client_message_at` pour ce chat. Si oui, recaler `last_poste_message_at` et ne pas réinjecter.

### P2 — Introduire un champ `last_agent_typing_at` ou mécanisme de verrou

Permettre au frontend de signaler via WebSocket que l'agent est en cours de frappe. Le SLA Checker devrait ignorer les conversations où un agent est actif (événement typing) depuis moins de N minutes.

### P3 — Logging détaillé des réattributions

Logger systématiquement les réattributions avec : `chat_id`, `ancien poste_id`, `nouveau poste_id`, `raison` (SLA / offline / orphan), `last_poste_message_at`, `last_client_message_at`. Cela permettra de confirmer la fréquence réelle du bug en production.

---

## Fichiers à modifier en priorité

1. `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` — correction P0
2. `message_whatsapp/src/dispatcher/dispatcher.service.ts` — correction P1 (méthode `jobRunnerAllPostes`)
3. `message_whatsapp/src/jorbs/first-response-timeout.job.ts` — ajout logging P3

---

## Statut

- [ ] P0 — Mise à jour atomique avant envoi Whapi
- [x] **LIVRÉ** — SLA Checker : `unreadEligibility` réduit à `unread_count > 0` strictement. Une conversation lue (unread_count = 0) ne peut plus jamais être redispatchée. (`dispatcher.service.ts` + `first-response-timeout.job.ts`)
- [ ] P2 — Mécanisme de verrou "agent en frappe"
- [ ] P3 — Logging des réattributions
