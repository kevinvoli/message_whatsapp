# Plan — Menu "Appels" Unifié (4 onglets)

**Date :** 2026-05-12  
**Priorité :** P1  
**Statut :** À implémenter

---

## Objectif

Remplacer le menu "Appels en absence" (vue unique) par un menu **"Appels"** unifié exposant 4 onglets :

| # | Onglet | Source de données |
|---|--------|-------------------|
| 1 | **Appels en absence** | `missed_call_event` (déjà implémenté) |
| 2 | **Appels sans commande** | `call_task` WHERE `category = 'JAMAIS_COMMANDE'` |
| 3 | **Appels annulés** | `call_task` WHERE `category = 'COMMANDE_ANNULEE'` |
| 4 | **Appels livrés** | `call_task` WHERE `category = 'COMMANDE_AVEC_LIVRAISON'` |

---

## Contexte technique

### Tables impliquées

**`missed_call_event`** (Sprint 1 de ce backlog)
- Statuts : `pending` → `assigned` → `called_back` / `escalated` / `closed`
- Lié à `CommercialActionTask` (tâche de rappel)

**`call_task`** (GICOP obligations — Sprint 6 backlog GICOP)
- Champ `category` : `COMMANDE_ANNULEE` | `COMMANDE_AVEC_LIVRAISON` | `JAMAIS_COMMANDE`
- Champ `status` : `PENDING` | `DONE`
- Champ `clientPhone` : renseigné au moment de la validation de l'appel
- Champ `callEventId` : ID externe DB2 de l'appel qui a validé la tâche
- Champ `durationSeconds` : durée de l'appel
- Champ `completedAt` : horodatage de validation
- Lié à `commercial_obligation_batch` via `batchId` → donne `posteId` + `batchNumber`

### Enumération `CallTaskCategory`
```
COMMANDE_ANNULEE         → "Appels annulés"
COMMANDE_AVEC_LIVRAISON  → "Appels livrés"
JAMAIS_COMMANDE          → "Appels sans commande"
```

---

## Architecture cible

```
AppelsView (onglets)
├── Tab 1 : MissedCallsTab        → API /admin/missed-calls (existant)
├── Tab 2 : CallTasksTab          → API /admin/call-tasks?category=JAMAIS_COMMANDE
├── Tab 3 : CallTasksTab          → API /admin/call-tasks?category=COMMANDE_ANNULEE
└── Tab 4 : CallTasksTab          → API /admin/call-tasks?category=COMMANDE_AVEC_LIVRAISON
```

`CallTasksTab` est un composant **partagé** paramétré par `category` — évite la duplication des onglets 2/3/4.

---

## Sprint 1 — Backend (nouveaux endpoints)

### US 1.1 — Service `CallTaskAdminService`

**Fichier :** `src/call-obligations/call-task-admin.service.ts`

Méthodes :

```typescript
getMetricsByCategory(category: CallTaskCategory): Promise<CallTaskMetrics>
// Retourne :
// - totalToday       : nb de call_task créées aujourd'hui pour cette catégorie
// - totalPending     : nb PENDING (pas encore validées)
// - totalDone        : nb DONE (appels passés)
// - avgDurationSeconds : durée moyenne des appels DONE (durationSeconds)
// - topPostesOverdue : postes avec le plus de PENDING > 24h (sans appel)

list(params: CallTaskListParams): Promise<{ items: CallTaskRow[]; total: number }>
// Filtres : category, status, posteId, dateFrom, dateTo, page, limit
// Join : call_task → commercial_obligation_batch → posteId, batchNumber
// Résultat par ligne (CallTaskRow) :
//   id, category, status, clientPhone, callEventId,
//   durationSeconds, completedAt, createdAt,
//   posteId, batchNumber
```

**`CallTaskMetrics` :**
```typescript
interface CallTaskMetrics {
  totalToday: number;
  totalPending: number;
  totalDone: number;
  avgDurationSeconds: number | null;
  topPostesOverdue: Array<{ posteId: string; count: number }>;
}
```

### US 1.2 — Contrôleur `CallTaskAdminController`

**Fichier :** `src/call-obligations/call-task-admin.controller.ts`

```
GET  /admin/call-tasks/metrics?category=JAMAIS_COMMANDE   [AdminGuard]
GET  /admin/call-tasks?category=JAMAIS_COMMANDE&...       [AdminGuard]
```

Query params `GET /admin/call-tasks` :
| Param | Type | Description |
|-------|------|-------------|
| `category` | `CallTaskCategory` | **Obligatoire** — filtre la catégorie |
| `status` | `PENDING \| DONE` | Optionnel |
| `posteId` | string | Optionnel |
| `dateFrom` | string (ISO) | Optionnel — sur `createdAt` |
| `dateTo` | string (ISO) | Optionnel — sur `createdAt` |
| `page` | number | Défaut : 1 |
| `limit` | number | Défaut : 50 |

### US 1.3 — Mise à jour `CallObligationsModule`

Ajouter `CallTaskAdminService` et `CallTaskAdminController` aux `providers` / `controllers` du module.

---

## Sprint 2 — Frontend Admin

### US 2.1 — API client `call-tasks.api.ts`

**Fichier :** `admin/src/app/lib/api/call-tasks.api.ts`

```typescript
export type CallTaskCategory = 'JAMAIS_COMMANDE' | 'COMMANDE_ANNULEE' | 'COMMANDE_AVEC_LIVRAISON';
export type CallTaskStatus = 'PENDING' | 'DONE';

export interface CallTaskMetrics {
  totalToday: number;
  totalPending: number;
  totalDone: number;
  avgDurationSeconds: number | null;
  topPostesOverdue: Array<{ posteId: string; count: number }>;
}

export interface CallTaskRow {
  id: string;
  category: CallTaskCategory;
  status: CallTaskStatus;
  clientPhone: string | null;
  callEventId: string | null;
  durationSeconds: number | null;
  completedAt: string | null;
  createdAt: string;
  posteId: string | null;
  batchNumber: number;
}

export function getCallTaskMetrics(category: CallTaskCategory): Promise<CallTaskMetrics>
export function listCallTasks(params: { category: CallTaskCategory; status?: CallTaskStatus; posteId?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }): Promise<{ items: CallTaskRow[]; total: number }>
```

### US 2.2 — Composant `CallTasksTab`

**Fichier :** `admin/src/app/modules/appels/components/CallTasksTab.tsx`

Props :
```typescript
interface CallTasksTabProps {
  category: CallTaskCategory;
}
```

Structure visuelle :
```
┌─────────────────────────────────────────────────────────────────┐
│  [Aujourd'hui: N]  [En attente: N]  [Effectués: N]  [Durée moy] │
├──────────────────────────────────────────────────────────────────┤
│  Filtres : [Tous] [En attente] [Effectués]   [Poste ▾]  [Date ▾] │
├──────────────────────────────────────────────────────────────────┤
│  Client          | Poste      | Batch# | Statut   | Durée | Date │
│  +225 07 000 001 | poste-1... | #3     | ✅ Fait  | 2min  | ...  │
│  +225 07 000 002 | poste-2... | #2     | ⏳ Attente | —   | ...  │
├──────────────────────────────────────────────────────────────────┤
│  < Précédent   Page 1/N   Suivant >                              │
└─────────────────────────────────────────────────────────────────┘
```

Détails d'affichage :
- **Statut** : badge vert "Effectué" si `DONE`, badge jaune "En attente" si `PENDING`
- **Durée** : `formatDelay(durationSeconds)` — `2min`, `45s`, `—` si null
- **Date** : `formatDate(completedAt ?? createdAt)` + `formatTime()`
- **Client** : `clientPhone` formaté, ou `—` si null (appel non encore passé)
- **Poste** : `posteId.slice(0, 8) + '...'` (cohérent avec `MissedCallsView`)
- **Batch** : `#N` où N = `batchNumber`

Métriques — 4 cartes :
| Icône | Label | Valeur |
|-------|-------|--------|
| `Phone` (bleu) | Aujourd'hui | `totalToday` |
| `Clock` (jaune) | En attente | `totalPending` |
| `CheckCircle` (vert) | Effectués | `totalDone` |
| `Timer` (gris) | Durée moy. | `formatDelay(avgDurationSeconds)` |

Top postes en retard : liste des postes avec le plus de `PENDING` > 24h sans appel validé.

### US 2.3 — Refactoring `MissedCallsView` → `MissedCallsTab`

**Fichier :** `admin/src/app/modules/appels/components/MissedCallsTab.tsx`

Extraire le contenu actuel de `admin/src/app/ui/MissedCallsView.tsx` dans ce nouveau composant. `MissedCallsView.tsx` devient un simple wrapper qui rend `<MissedCallsTab />` (pour rétro-compatibilité le temps de la migration, ou supprimer directement si la page n'est plus référencée en dehors du dashboard).

### US 2.4 — Composant `AppelsView` (vue principale avec onglets)

**Fichier :** `admin/src/app/modules/appels/components/AppelsView.tsx`

```typescript
const TABS = [
  { id: 'absence',      label: 'Appels en absence',    icon: PhoneOff,   color: 'red'    },
  { id: 'sans-commande',label: 'Sans commande',         icon: PhoneMissed,color: 'yellow' },
  { id: 'annules',      label: 'Annulés',               icon: PhoneOff,   color: 'orange' },
  { id: 'livres',       label: 'Livrés',                icon: PhoneCall,  color: 'green'  },
];
```

Structure :
```
┌─────────────────────────────────────────────────────────────────┐
│  📞 Appels                                                       │
├──────────────────────────────────────────────────────────────────┤
│  [En absence]  [Sans commande]  [Annulés]  [Livrés]             │
├──────────────────────────────────────────────────────────────────┤
│  <contenu de l'onglet actif>                                     │
└─────────────────────────────────────────────────────────────────┘
```

Rendu conditionnel :
```typescript
switch (activeTab) {
  case 'absence':       return <MissedCallsTab />;
  case 'sans-commande': return <CallTasksTab category="JAMAIS_COMMANDE" />;
  case 'annules':       return <CallTasksTab category="COMMANDE_ANNULEE" />;
  case 'livres':        return <CallTasksTab category="COMMANDE_AVEC_LIVRAISON" />;
}
```

Persistence de l'onglet actif via `useState` (reset à 'absence' au montage).

### US 2.5 — Mise à jour navigation admin

**Fichier :** `admin/src/app/data/admin-data.ts`

- Remplacer l'entrée `{ id: 'missed-calls', name: 'Appels en absence', icon: PhoneOff }` par `{ id: 'appels', name: 'Appels', icon: Phone }` dans le groupe "Intégrations & GICOP"
- Ajouter l'import `Phone` depuis lucide-react (si pas déjà présent)

**Fichier :** `admin/src/app/lib/definitions.ts`

- Ajouter `'appels'` au type `ViewMode`
- Retirer `'missed-calls'` (ou garder pour rétro-compatibilité si des liens externes le référencent)

**Fichier :** `admin/src/app/dashboard/commercial/page.tsx`

```typescript
// Remplacer :
case 'missed-calls': return <MissedCallsView />;
// Par :
case 'appels': return <AppelsView />;
```

---

## Sprint 3 — Tests

### US 3.1 — Tests `CallTaskAdminService`

**Fichier :** `src/call-obligations/__tests__/call-task-admin.service.spec.ts`

Tests à écrire :
1. `getMetricsByCategory()` — retourne les bons compteurs pour une catégorie donnée
2. `list()` — pagination correcte (page 2, limit 10)
3. `list()` — filtre `status=DONE` retourne uniquement les tâches DONE
4. `list()` — filtre `posteId` retourne uniquement les tâches du poste
5. `list()` — filtre `dateFrom/dateTo` filtre sur `createdAt`
6. `getMetricsByCategory()` — `avgDurationSeconds` null si aucune tâche DONE

---

## Fichiers à créer / modifier

### Backend

| Action | Fichier |
|--------|---------|
| CRÉER | `src/call-obligations/call-task-admin.service.ts` |
| CRÉER | `src/call-obligations/call-task-admin.controller.ts` |
| MODIFIER | `src/call-obligations/call-obligations.module.ts` |
| CRÉER | `src/call-obligations/__tests__/call-task-admin.service.spec.ts` |

### Frontend Admin

| Action | Fichier |
|--------|---------|
| CRÉER | `admin/src/app/lib/api/call-tasks.api.ts` |
| CRÉER | `admin/src/app/modules/appels/components/AppelsView.tsx` |
| CRÉER | `admin/src/app/modules/appels/components/MissedCallsTab.tsx` |
| CRÉER | `admin/src/app/modules/appels/components/CallTasksTab.tsx` |
| MODIFIER | `admin/src/app/data/admin-data.ts` |
| MODIFIER | `admin/src/app/lib/definitions.ts` |
| MODIFIER | `admin/src/app/dashboard/commercial/page.tsx` |
| MODIFIER (optionnel) | `admin/src/app/ui/MissedCallsView.tsx` → wrapper vers `MissedCallsTab` |

---

## Contraintes et règles

- **Lecture seule** sur les `call_task` GICOP depuis l'admin — pas d'action de fermeture manuelle (les tâches sont validées automatiquement par le système GICOP)
- **Pas d'auto-message** aux clients sur les onglets GICOP
- Les onglets 2/3/4 sont en **lecture seule** — pas de bouton "Fermer" (contrairement à l'onglet "En absence")
- Le composant `CallTasksTab` doit être **sans état partagé** entre les onglets — chaque onglet a ses propres filtres et pagination indépendants
- Utiliser `formatDate` / `formatTime` de `admin/src/app/lib/dateUtils.ts` pour tous les affichages de dates

---

## Estimation

| Sprint | US | Effort estimé |
|--------|----|---------------|
| Sprint 1 (Backend) | US 1.1 + 1.2 + 1.3 | ~2h |
| Sprint 2 (Frontend) | US 2.1 + 2.2 + 2.3 + 2.4 + 2.5 | ~3h |
| Sprint 3 (Tests) | US 3.1 | ~1h |
| **Total** | | **~6h** |
