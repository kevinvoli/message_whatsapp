# Plan d'implémentation — Refonte interface commercial

**Date** : 2026-05-20  
**Scope** : Menus Contact, Dashboard, Files, Conv de la sidebar commerciale  
**Branche** : travailler sur une branche feature dédiée

---

## Résumé des changements

| Menu | Action | Détail |
|------|--------|--------|
| **Contact** | Refonte | Uniquement portefeuille + contacts appelés + absences + catégorie |
| **Relance** | Aucune modification | Intouché |
| **Dashboard** | Suppression | Retiré de la navigation, plus accessible |
| **Files** | Suppression | Retiré de la navigation, plus accessible |
| **Conv** | Refonte filtres | Tous / Actives / Appels rotation (supprimer Non lus, Nouveaux, En attente) |

---

## Tâche 1 — Menu Dashboard : désactivation complète

### 1.1 Retirer du type ViewMode
**Fichier** : `front/src/types/chat.ts` — ligne 87

```ts
// AVANT
type ViewMode = 'conversations' | 'contacts' | 'relances' | 'objectifs' | 'ranking' | 'menus-metier' | 'action-queue' | 'dashboard'

// APRÈS
type ViewMode = 'conversations' | 'contacts' | 'relances' | 'objectifs' | 'ranking' | 'menus-metier'
```

### 1.2 Retirer le bouton de UserHeader
**Fichier** : `front/src/components/sidebar/UserHeader.tsx`

- Supprimer le `<button>` "Dashboard" (lignes 144–155)
- La 2ème ligne de navigation passe de 4 items à 2 items (Rang + Métier)
- Les 2 items restants doivent prendre toute la largeur (`flex-1` sur chacun)
- Import `BarChart2` à supprimer si plus utilisé

### 1.3 Retirer le cas dans Sidebar
**Fichier** : `front/src/components/sidebar/Sidebar.tsx`

- Supprimer l'import `DashboardPanel` (ligne 20)
- Supprimer le cas `viewMode === 'dashboard'` (lignes 134–135)

---

## Tâche 2 — Menu Files : suppression complète

### 2.1 Retirer du type ViewMode
**Fichier** : `front/src/types/chat.ts` — ligne 87

- Retirer `'action-queue'` (déjà fait avec la Tâche 1, les deux modifications se font en une seule fois)

### 2.2 Retirer le bouton de UserHeader
**Fichier** : `front/src/components/sidebar/UserHeader.tsx`

- Supprimer le `<button>` "Files" (lignes 180–191)
- Import `ListTodo` à supprimer si plus utilisé

### 2.3 Retirer le cas dans Sidebar
**Fichier** : `front/src/components/sidebar/Sidebar.tsx`

- Supprimer l'import `ActionQueuePanel` (ligne 19)
- Supprimer le cas `viewMode === 'action-queue'` (lignes 132–133)

---

## Tâche 3 — Menu Conv : refonte des filtres

### Filtres actuels (à supprimer)
- `Tous` | `Non lus` | `Nouveaux` | `En attente`
- Section dépliable "Charge par poste"

### Nouveaux filtres
| Filtre | Clé | Logique |
|--------|-----|---------|
| **Tous** | `all` | Toutes les conversations du commercial (~50) — `return true` |
| **Actives** | `active` | Conv en fenêtre glissante non verrouillées — `window_slot != null && is_locked !== true` |
| **Appels rotation** | `rotation_calls` | Conv en fenêtre glissante où le contact a été appelé — `window_slot != null && call_status !== null && call_status !== 'à_appeler'` |

### 3.1 Mettre à jour le hook de filtrage
**Fichier** : `front/src/hooks/useConversationFilters.ts`

```ts
// Remplacer la logique du switch
switch (filterStatus) {
  case 'active':
    return conv.window_slot != null && conv.is_locked !== true;
  case 'rotation_calls':
    return conv.window_slot != null
      && conv.call_status != null
      && conv.call_status !== 'à_appeler';
  default: // 'all'
    return true;
}
```

> Note : Le comportement spécial `window_slot != null` qui force la visibilité
> (ancienne ligne 16) disparaît — les filtres `active` et `rotation_calls` le gèrent
> explicitement. En mode `all`, tout s'affiche.

### 3.2 Refaire le composant ConversationFilters
**Fichier** : `front/src/components/sidebar/ConversationFilters.tsx`

- Supprimer les compteurs `nouveau`, `attente`
- Supprimer toute la section "Charge par poste" (lignes 57–84)
- Supprimer l'import `ChevronDown`, `ChevronUp`
- Afficher 3 pills : `Tous (N)` | `Actives (N)` | `Appels rotation (N)`

```tsx
const counts = useMemo(() => ({
  all:            conversations.length,
  active:         conversations.filter((c) => c.window_slot != null && c.is_locked !== true).length,
  rotation_calls: conversations.filter(
    (c) => c.window_slot != null && c.call_status != null && c.call_status !== 'à_appeler'
  ).length,
}), [conversations]);
```

---

## Tâche 4 — Menu Contact : refonte

### Comportement cible
- Toujours filtré sur `my_portfolio: true` (le filtre "Tous global" disparaît)
- 3 onglets : **Appelés** (défaut) | **Absences** | **Tous**
- Afficher la catégorie client (`client_category`) dans chaque carte
- Afficher le statut d'appel (`call_status`) comme badge coloré

### Filtres cibles
| Filtre | Clé | API call |
|--------|-----|---------|
| **Appelés** | `called` | `my_portfolio=true` + `call_status=appelé,rappeler` |
| **Absences** | `missed` | `my_portfolio=true` + `call_status=non_joignable` |
| **Tous** | `all` | `my_portfolio=true` (tout le portefeuille) |

### 4.1 Étendre le backend — ajouter filtre `call_status`

**Fichier** : `message_whatsapp/src/client-dossier/client-dossier.controller.ts`

Ajouter le paramètre `call_status` dans la route `GET /clients` :
```ts
@Query('call_status') callStatus?: string,
```
Et le passer à `service.searchClients()`.

**Fichier** : `message_whatsapp/src/client-dossier/client-dossier.service.ts`

Dans `searchClients()`, ajouter :
```ts
// callStatus peut être une valeur unique ou comma-separated "appelé,rappeler"
if (callStatus) {
  const statuses = callStatus.split(',').map(s => s.trim()).filter(Boolean);
  if (statuses.length === 1) {
    qb.andWhere('c.call_status = :callStatus', { callStatus: statuses[0] });
  } else {
    qb.andWhere('c.call_status IN (:...callStatuses)', { callStatuses: statuses });
  }
}
```

### 4.2 Étendre l'API frontend
**Fichier** : `front/src/lib/contactApi.ts`

Ajouter `call_status?: string` aux params de `searchClients()` :
```ts
if (params.call_status) query.set('call_status', params.call_status);
```

### 4.3 Refaire ContactSidebarPanel
**Fichier** : `front/src/components/contacts/ContactSidebarPanel.tsx`

Modifications :
- Remplacer le type `FilterKey = 'all' | 'my_portfolio'` par `'all' | 'called' | 'missed'`
- Forcer `my_portfolio: true` dans tous les appels (pas de filtre global)
- Mapper chaque filtre → `call_status` API :
  - `called` → `call_status: 'appelé,rappeler'`
  - `missed` → `call_status: 'non_joignable'`
  - `all` → pas de `call_status` (tout le portefeuille)
- Changer le filtre par défaut de `'all'` à `'called'`
- Mettre à jour les pills : `Appelés` | `Absences` | `Tous`

### 4.4 Mettre à jour la ClientCard
**Fichier** : `front/src/components/contacts/ContactSidebarPanel.tsx` — fonction `ClientCard`

Ajouter sous le nom/téléphone :
- Badge `client_category` (si non null) — couleur neutre (ex: `bg-blue-50 text-blue-700`)
- Badge `call_status` avec couleur via `getCallStatusColor()` et label via `getCallStatusLabel()`
  - Importer ces fonctions depuis `@/types/chat`

---

## Récapitulatif des fichiers à modifier

### Backend
| Fichier | Modification |
|---------|-------------|
| `message_whatsapp/src/client-dossier/client-dossier.controller.ts` | Ajouter `@Query('call_status')` |
| `message_whatsapp/src/client-dossier/client-dossier.service.ts` | Ajouter filtre `call_status` dans `searchClients()` |

### Frontend
| Fichier | Modification |
|---------|-------------|
| `front/src/types/chat.ts` | Retirer `'action-queue'` et `'dashboard'` de `ViewMode` |
| `front/src/components/sidebar/UserHeader.tsx` | Supprimer boutons Dashboard + Files ; réorganiser ligne 2 |
| `front/src/components/sidebar/Sidebar.tsx` | Supprimer imports + cas `action-queue` et `dashboard` |
| `front/src/components/sidebar/ConversationFilters.tsx` | Remplacer filtres par Tous / Actives / Appels rotation |
| `front/src/hooks/useConversationFilters.ts` | Adapter logique filtrage (3 nouveaux cas) |
| `front/src/components/contacts/ContactSidebarPanel.tsx` | Refonte complète (filtres + carte + catégorie) |
| `front/src/lib/contactApi.ts` | Ajouter param `call_status` dans `searchClients()` |

---

## Ordre d'implémentation recommandé

1. **Backend** : ajouter filtre `call_status` sur `GET /clients` (ne casse rien d'existant)
2. **Frontend API** : ajouter `call_status` dans `contactApi.ts`
3. **Tâche 1+2** (Dashboard + Files) : modifications purement de suppression — rapides et sans risque
4. **Tâche 3** (filtres Conv) : modifier hook + composant ensemble pour rester cohérent
5. **Tâche 4** (Contact) : refonte du panel — plus complexe, à faire en dernier

---

## Points d'attention

- `useConversationFilters.ts` : l'ancienne règle "window_slot != null force la visibilité quel que soit le filtre" est **supprimée**. En filtre `all`, les conversations window sont visibles car `return true`. Les filtres `active` et `rotation_calls` les ciblent explicitement.
- La suppression de `'dashboard'` et `'action-queue'` du type `ViewMode` provoquera des erreurs TypeScript si d'autres composants les référencent — vérifier avec `grep` avant commit.
- Le backend : le filtre `call_status` accepte des valeurs comma-separated (`appelé,rappeler`) pour éviter plusieurs appels API.
