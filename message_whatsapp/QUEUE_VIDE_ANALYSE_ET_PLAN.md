# Analyse et Plan — Garantir que la queue ne soit jamais vide

**Date** : 2026-04-07  
**Contexte** : Des conversations se retrouvent avec `poste_id = NULL` de manière permanente, invisibles pour tous les agents et non rattrapées par les crons existants.

---

## 1. Pourquoi la queue peut être vide

### Scénario A — Tous les agents se déconnectent

```
Dernier agent déconnecte
→ removeFromQueue()       → queue_positions devient vide
→ fillQueueWithAllPostes() → recharge avec tous les postes offline
→ MAIS : exclut les postes sans commercial
→ SI aucun poste n'a de commercial configuré → queue reste vide définitivement
→ getNextInQueue() = null → toute conversation entrant tombe en poste_id = NULL
```

### Scénario B — Réinjection SLA laisse un trou temporaire

```
reinjectConversation() déclenché par SLA checker :
  1. UPDATE chat SET poste_id = NULL, deadline = NULL   ← poste effacé ICI
  2. dispatchExistingConversation(chat) appelé
  3. getNextInQueue() → null (queue vide ou tous exclus)
  4. emitConversationRemoved(oldPoste) + RETURN

Résultat :
  - poste_id = NULL
  - first_response_deadline_at = NULL
  - SLA checker ne la ciblera PLUS JAMAIS (filtre deadline < NOW(), or NULL n'est jamais < NOW())
  - Invisible pour tous les agents
  - Rattrapée uniquement à 9h00 par offline-reinjection
```

### Scénario C — `getNextInQueue()` exclut tous les postes (canaux dédiés)

```
getNextInQueue() :
  - Exclut les postes ayant au moins un canal dédié (mode exclusif)
  - Si TOUS les postes ont des canaux dédiés → retourne null
  - Alors toute conversation sans canal dédié tombe en poste_id = NULL
```

---

## 2. Ce qui arrive après qu'une conversation perd son poste

Une fois `poste_id = NULL` et `first_response_deadline_at = NULL` :

| Mécanisme | Rattrape-t-il ce cas ? | Raison |
|-----------|------------------------|--------|
| SLA Checker (120 min) | ❌ NON | Filtre `unread_count > 0` ET `deadline < NOW()` — deadline NULL n'est jamais < NOW() |
| offline-reinjection (09:00) | ✅ OUI (1×/jour) | Cherche `poste_id IS NULL` → `dispatchOrphanConversation()` |
| Message client entrant | ✅ OUI | `assignConversation()` relance le dispatch via la queue |
| Fermeture auto (24h) | ✅ OUI | Ferme la conversation si pas de réponse depuis 24h |
| Bouton redispatch (manuel) | ✅ OUI (partiellement) | `redispatchWaiting()` traite les EN_ATTENTE |

**Conclusion** : Sans message client et sans intervention manuelle, une conversation créée à 10h reste invisible jusqu'à 9h le lendemain, puis potentiellement fermée automatiquement avant d'être vue.

---

## 3. Bugs identifiés et déjà corrigés

### Bug corrigé — `redispatchWaiting()` s'arrêtait dès la première queue vide

**Avant** : `if (!assigned) break;` — stoppait toute la boucle dès qu'un agent manquait  
**Après** : continue les autres conversations, compte séparément `still_waiting`

### Bug corrigé — `redispatchWaiting()` ne notifiait pas l'ancien poste

**Avant** : L'ancien commercial continuait à voir la conversation après réassignation  
**Après** : `emitConversationRemoved(oldPosteId)` émis avant la réassignation

### Bug corrigé — `redispatchWaiting()` réassignait les canaux dédiés

**Avant** : Conversations sur canal dédié pouvaient être envoyées vers n'importe quel poste  
**Après** : Vérification `getDedicatedPosteId()` avant assignation, skip si dédié

---

## 4. Plan de correction complet — 3 niveaux

---

### Niveau 1 — Fallback garanti dans `getNextInQueue()` ⭐ LE PLUS IMPORTANT

**Fichier** : `src/dispatcher/services/queue.service.ts`

**Problème** : `getNextInQueue()` retourne `null` dès que `queue_positions` est vide ou que tous les postes sont exclus (canaux dédiés).

**Solution** : Ajouter un fallback BDD qui contourne la table `queue_positions` et cherche directement le poste le moins chargé parmi tous les postes ayant au moins un commercial.

**Logique proposée** :

```
getNextInQueue() :

  ÉTAPE 1 — Tentative normale via queue_positions (least-loaded, round-robin)
    → Fetch QueuePosition ORDER BY position ASC
    → Exclure postes avec canaux dédiés
    → Sélectionner poste avec MIN(conversations ACTIF+EN_ATTENTE)
    → SI trouvé → moveToEnd() + retourner

  ÉTAPE 2 — Fallback BDD (si queue vide ou tous exclus)
    → SELECT WhatsappPoste
       WHERE EXISTS (WhatsappCommercial avec ce posteId)
       ORDER BY COUNT(conversations ACTIF+EN_ATTENTE) ASC
       LIMIT 1
    → SI trouvé → retourner CE POSTE (sans modifier queue_positions)
    → Logger : "Queue vide — fallback BDD vers poste {id}"

  ÉTAPE 3 — Aucun poste disponible (cas extrême)
    → Retourner null
    → Logger : "Aucun poste configuré avec commercial"
```

**Impact** : `getNextInQueue()` ne retourne plus jamais `null` tant qu'il existe au moins un poste avec un commercial, même si la queue est entièrement vide.

**Cas couverts** :
- Tous les agents déconnectés → fallback vers n'importe quel poste offline
- Tous les postes ont des canaux dédiés → le fallback ignore cette exclusion
- Redémarrage serveur avant première connexion → fallback BDD immédiat

---

### Niveau 2 — Atomicité du redispatch dans `reinjectConversation()` ⭐ ÉVITE LE TROU

**Fichier** : `src/dispatcher/dispatcher.service.ts`

**Problème** : `reinjectConversation()` efface `poste_id` et `deadline` AVANT de chercher le prochain poste, créant une fenêtre temporaire où `poste_id = NULL`.

**Solution** : Inverser l'ordre — chercher le nouveau poste D'ABORD, puis faire un UPDATE atomique.

**Logique actuelle (problématique)** :
```
1. UPDATE chat SET poste_id = NULL, deadline = NULL    ← trou ici si étape 2 échoue
2. dispatchExistingConversation()
3. getNextInQueue() → si null → emitConversationRemoved + abandon
```

**Logique proposée** :
```
1. nextPoste = getNextInQueue()
   SI null → étendre deadline +30 min, RETURN  (aucune alternative)

2. UPDATE chat SET :
     poste_id  = nextPoste.id
     status    = nextPoste.is_active ? ACTIF : EN_ATTENTE
     assigned_mode = ONLINE/OFFLINE
     assigned_at = NOW()
     first_response_deadline_at = NOW() + 15 min
   (un seul UPDATE atomique, jamais de passage par NULL)

3. emitConversationReassigned(oldPosteId, nextPoste.id)
     → CONVERSATION_REMOVED vers ancien poste
     → CONVERSATION_ASSIGNED vers nouveau poste
```

**Impact** :
- Plus jamais de fenêtre où `poste_id = NULL` pendant une réinjection
- Si aucun poste disponible : la deadline est juste étendue, la conversation reste sur son poste actuel
- `dispatchExistingConversation()` peut être simplifié ou supprimé (logique fusionnée dans `reinjectConversation()`)

---

### Niveau 3 — Cron `orphan-checker` toutes les 15 min ⭐ FILET DE SÉCURITÉ

**Fichier** : `src/jorbs/cron-config.service.ts` + nouveau fichier `src/jorbs/orphan-checker.job.ts`

**Problème** : Les conversations qui tombent malgré tout en `poste_id = NULL` ne sont rattrapées qu'à 9h par `offline-reinjection`, soit jusqu'à 24h de délai.

**Solution** : Ajouter un cron dédié, léger, qui tourne toutes les 15 min (inactif 21h–5h) et dispatche uniquement les conversations orphelines.

**Logique** :
```
orphan-checker (toutes les 15 min, désactivé 21h–5h) :

  Fetch chats WHERE :
    poste_id IS NULL
    AND status IN [ACTIF, EN_ATTENTE]
    AND read_only = false
  LIMIT 20

  Pour chaque → dispatchOrphanConversation()

  Retourne : "X orphelin(s) dispatché(s)"
```

**Configuration par défaut** :
```typescript
'orphan-checker': {
  label: 'Rattrapage orphelins — conversations sans poste',
  description: 'Dispatche toutes les 15 min les conversations sans poste (poste_id = NULL). Filet de sécurité si le dispatch initial a échoué.',
  enabled: true,
  scheduleType: 'interval',
  intervalMinutes: 15,
}
```

**Impact** :
- Délai maximum pour rattraper un orphelin : 15 min au lieu de 24h
- Léger (requête simple, LIMIT 20, pas de traitement lourd)
- Inactif la nuit (21h–5h) comme le SLA checker

---

## 5. Récapitulatif des modifications par fichier

| Fichier | Modification | Niveau |
|---------|-------------|--------|
| `src/dispatcher/services/queue.service.ts` | Ajouter fallback BDD dans `getNextInQueue()` | 1 |
| `src/dispatcher/dispatcher.service.ts` | Refactoriser `reinjectConversation()` pour atomicité | 2 |
| `src/jorbs/orphan-checker.job.ts` | Nouveau job `orphan-checker` | 3 |
| `src/jorbs/cron-config.service.ts` | Ajouter entrée par défaut `orphan-checker` | 3 |
| `src/jorbs/jorbs.module.ts` | Enregistrer le nouveau job | 3 |

---

## 6. Ordre d'implémentation recommandé

```
1. Niveau 1 (queue.service.ts) → Impact immédiat le plus large
2. Niveau 2 (dispatcher.service.ts) → Élimine les trous lors des réinjections
3. Niveau 3 (orphan-checker.job.ts) → Filet de sécurité résiduel
```

---

## 7. Garantie attendue après implémentation

| Situation | Comportement avant | Comportement après |
|-----------|-------------------|-------------------|
| Queue vide + message entrant | poste_id = NULL, perdu 24h | Fallback BDD → toujours assigné |
| Réinjection SLA + aucun agent | poste_id = NULL via trou temporaire | Reste sur ancien poste, deadline étendue |
| Poste dédié offline | Attente infinie sur ce poste | Inchangé (règle métier voulue) |
| Orphelin existant | Rattrapé à 9h00 seulement | Rattrapé en 15 min max |
| Tous agents offline | Queue remplie offline | Idem + fallback BDD si queue exclut tout |
