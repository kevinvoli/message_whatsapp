# Rapport de bug — Fenêtre glissante : décroissance du total de conversations

**Date :** 2026-05-18  
**Sévérité :** P0 — régression fonctionnelle majeure  
**Symptôme observé :** après chaque rotation, le total de conversations visibles diminue de 10

---

## 1. Comportement attendu vs observé

| État | Actives | Bloquées | Total |
|------|---------|----------|-------|
| Initial | 10 | 40 | **50** |
| Après rotation 1 (attendu) | 10 | 40 | **50** |
| Après rotation 1 (observé) | 10 | 30 | **40** |
| Après rotation 2 (attendu) | 10 | 40 | **50** |
| Après rotation 2 (observé) | 10 | 20 | **30** |
| ... | ... | ... | **décroissance -10 par rotation** |

---

## 2. Cause racine

### 2.1 Le bug principal — `_executeRotation` (window-rotation.service.ts, ligne ~618)

La rotation libère les 10 conversations actives dont le rapport est soumis (`batchRelease`), puis cherche de nouvelles conversations pour remplir les 10 slots libérés. La requête d'injection est :

```typescript
// ligne ~607 de window-rotation.service.ts
const newCandidates = await this.chatRepo
  .createQueryBuilder('c')
  .where('c.poste_id = :posteId', { posteId })
  .andWhere('c.deletedAt IS NULL')
  .andWhere('c.is_priority = 0')
  .andWhere('(c.window_status IS NULL OR c.window_status != :released OR c.status = :ferme)', {
    released: WindowStatus.RELEASED,
    ferme: WhatsappChatStatus.FERME,
  })
  .orderBy('c.last_activity_at', 'DESC')
  .take(slotsAvailable + submitted.length) // ← PROBLÈME
  .getMany();
```

**Analyse du problème :**

- `slotsAvailable = quotaTotal - remaining.length = 50 - 40 = 10`
- `submitted.length = 10` (les 10 libérées)
- → `take(20)` : on charge au maximum **20 lignes**

La condition `window_status != 'released'` inclut les **40 conversations LOCKED encore dans la fenêtre** (elles ont `window_status = 'locked'`, donc ≠ `'released'`).

La requête retourne donc en priorité des conversations déjà dans la fenêtre (les 40 LOCKED les plus récentes). Elles sont ensuite filtrées par `excludedIds` (qui contient les 40 LOCKED + les 10 libérées = 50 IDs). Résultat : **0 vrais nouveaux candidats** sur les 20 lignes récupérées.

```typescript
const unexcluded = newCandidates.filter((c) => !excludedIds.has(c.id)); // → []
// toInject = [] → 0 nouvelles conversations injectées
```

**Effet en cascade :**
```
Fenêtre initiale : 50 (10 ACTIVE + 40 LOCKED)
Après batchRelease : 40 LOCKED + 0 injectées = 40
Rotation suivante : 50 - 40 = 10 slots dispos → take(20) → encore 0 candidats
Fenêtre : 30 → 20 → 10 → 0
```

### 2.2 Le même bug dans `compactSlots` (ligne ~727)

```typescript
const rawCandidates = await this.chatRepo
  ...
  .take(slotsUsed + 5) // ← même bug : inclut les déjà-slottés
  .getMany();
```

`slotsUsed` correspond aux conversations déjà dans la fenêtre. Le `take(slotsUsed + 5)` peut retourner uniquement des conversations déjà-slottées, laissant 0 vrais candidats après filtrage.

---

## 3. Fichiers et lignes concernés

| Fichier | Méthode | Ligne | Nature du bug |
|---------|---------|-------|---------------|
| `message_whatsapp/src/window/services/window-rotation.service.ts` | `_executeRotation` | ~607–633 | `take()` trop petit + condition inclut les déjà-slottés |
| `message_whatsapp/src/window/services/window-rotation.service.ts` | `compactSlots` | ~715–741 | Idem |

---

## 4. Correction proposée

### Fix `_executeRotation` (méthode privée, ~ligne 607)

**Ajouter `c.window_slot IS NULL`** dans la condition WHERE pour ne cibler que les conversations pas encore dans la fenêtre. Ajuster le `take()` en conséquence.

```typescript
// AVANT
.andWhere('(c.window_status IS NULL OR c.window_status != :released OR c.status = :ferme)', { ... })
.take(slotsAvailable + submitted.length)

// APRÈS
.andWhere('c.window_slot IS NULL')  // ← uniquement les non-slottées
.andWhere('(c.window_status IS NULL OR c.window_status != :released OR c.status = :ferme)', { ... })
.take(slotsAvailable + 10)  // ← buffer réduit, suffisant pour le filtre FERMÉ
```

**Pourquoi ça fonctionne :**
- Les 40 conversations LOCKED ont `window_slot IS NOT NULL` → exclues de la requête
- Les 10 libérées ont `window_slot = null` MAIS `window_status = RELEASED` (non FERMÉ) → exclues par la condition RELEASED
- Seules les **vraies nouvelles conversations** (jamais slottées ou préalablement libérées) sont candidates

### Fix `compactSlots` (~ligne 715)

Même correction :

```typescript
// AVANT
.take(slotsUsed + 5)

// APRÈS  
.andWhere('c.window_slot IS NULL')  // ← uniquement les non-slottées
.take(quotaTotal - slotsUsed + 10)  // ← slots manquants + buffer
```

---

## 5. Impact du fix

- **Aucun risque de régression** : le filtre `window_slot IS NULL` est plus restrictif et correct
- **Amélioration des performances** : la requête ne charge plus 40+ conversations inutiles
- **Comportement après fix** : la fenêtre reste invariablement à `quotaTotal` (50) après chaque rotation, sauf si le poste n'a pas assez de conversations disponibles (cas normal géré par `buildWindowForPoste` qui ne remplirait que partiellement)

---

## 6. Scénarios de test à valider

1. **Rotation standard** : 50 convs (10 ACTIVE, 40 LOCKED) → 10 rapports soumis → rotation → **50 convs** (10 ACTIVE, 40 LOCKED)
2. **Rotation avec peu de nouvelles convs** : poste avec 45 convs total → après rotation → **45 convs** (10 ACTIVE, 35 LOCKED, comportement correct car pas assez de convs)
3. **Double rotation** : deux rotations successives → total toujours 50
4. **Compactage** : fermeture d'une conv LOCKED → compactage → 50 convs maintenues si disponible

---

## 7. Diagnostic complémentaire — endpoint debug

Utiliser `GET /window/debug/:posteId` (endpoint admin existant) pour observer l'état de la fenêtre avant/après rotation et vérifier `activeCount + lockedCount === quotaTotal`.

**Valeurs suspectes à surveiller :**
- `activeCount + lockedCount < quotaTotal` après une rotation = bug confirmé
- `rotationWouldTrigger: true` avec moins de 50 convs slottées = précondition du bug
