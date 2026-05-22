# Plan — Persistance de navigation après refresh (Admin + Front)

**Date :** 2026-05-22  
**Statut :** À implémenter  
**Priorité :** P1

---

## Diagnostic

### Cause racine

Les deux frontends utilisent du **state React pur** (`useState`) pour mémoriser la vue active. Ce state est **perdu à chaque refresh** car le navigateur recharge la page depuis l'URL — et l'URL ne contient aucune information sur la vue courante.

| App | Fichier | State perdu | Vue par défaut |
|-----|---------|-------------|----------------|
| Admin | `admin/src/app/dashboard/commercial/page.tsx` | `viewMode` (`useState('overview')`) | `'overview'` |
| Front | `front/src/app/whatsapp/page.tsx` | `viewMode` (`useState('conversations')`) + `filterStatus` (`useState('all')`) | `'conversations'` / `'all'` |

### Ce qui ne pose PAS de problème

- Le front a de vraies routes Next.js (`/contacts`, `/whatsapp`) → un refresh sur `/contacts` reste sur `/contacts`. ✅
- L'authentification (JWT/session) est gérée séparément et n'est pas affectée. ✅

---

## Solution choisie — URL Search Params

Utiliser les **query params URL** (`?view=commerciaux`) comme source de vérité pour la navigation.

**Pourquoi URL params et non localStorage :**
- Les URLs sont préservées nativement par le navigateur au refresh
- URLs partageables et bookmarkables
- Pas de désynchronisation entre URL et état affiché
- Pas de risque d'hydratation SSR contrairement à localStorage
- Comportement natif attendu par les utilisateurs

**Pattern Next.js App Router :**
```typescript
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// Lecture
const searchParams = useSearchParams();
const viewFromUrl = searchParams.get('view') ?? 'overview';

// Écriture (ne pollue pas l'historique)
const router = useRouter();
const pathname = usePathname();
router.replace(`${pathname}?view=${newMode}`, { scroll: false });
```

---

## Tâches

### US-A1 — Admin : Sync `viewMode` ↔ URL

**Fichier :** `admin/src/app/dashboard/commercial/page.tsx`

**Changements :**

1. Ajouter les imports Next.js manquants :
   ```typescript
   import { useSearchParams, useRouter, usePathname } from 'next/navigation';
   ```

2. Remplacer l'initialisation de `viewMode` :
   ```typescript
   // AVANT
   const [viewMode, setViewMode] = useState<ViewMode>('overview');
   
   // APRÈS
   const searchParams = useSearchParams();
   const router = useRouter();
   const pathname = usePathname();
   const [viewMode, setViewMode] = useState<ViewMode>(
     (searchParams.get('view') as ViewMode) ?? 'overview'
   );
   ```

3. Modifier `handleSetViewMode` pour mettre à jour l'URL :
   ```typescript
   const handleSetViewMode = (mode: ViewMode) => {
     if (mode !== 'conversations') {
       setConversationFilterPosteId(undefined);
       setConversationFilterCommercialId(undefined);
     }
     setViewMode(mode);
     router.replace(`${pathname}?view=${mode}`, { scroll: false });
   };
   ```

4. Modifier `handleViewPosteConversations` et `handleViewCommercialConversations` de la même façon pour mettre à jour l'URL avec `?view=conversations`.

5. Wrapper le composant dans un `<Suspense>` dans le fichier parent si Next.js le requiert (vérifier à l'exécution).

**Test :** Naviguer vers "Commerciaux" → rafraîchir → doit rester sur "Commerciaux".

---

### US-F1 — Front : Sync `viewMode` ↔ URL

**Fichier :** `front/src/app/whatsapp/page.tsx`

**Changements :**

1. Ajouter les imports Next.js :
   ```typescript
   import { useSearchParams, usePathname } from 'next/navigation';
   ```
   (`useRouter` est déjà importé)

2. Remplacer l'initialisation de `viewMode` :
   ```typescript
   // AVANT
   const [viewMode, setViewMode] = useState<ViewMode>('conversations');
   
   // APRÈS
   const searchParams = useSearchParams();
   const pathname = usePathname();
   const [viewMode, setViewMode] = useState<ViewMode>(
     (searchParams.get('view') as ViewMode) ?? 'conversations'
   );
   ```

3. Créer un handler `handleSetViewMode` qui sync l'URL :
   ```typescript
   const handleSetViewMode = useCallback((mode: ViewMode) => {
     setViewMode(mode);
     const params = new URLSearchParams(searchParams.toString());
     params.set('view', mode);
     router.replace(`${pathname}?${params.toString()}`, { scroll: false });
   }, [searchParams, pathname, router]);
   ```

4. Remplacer les appels directs à `setViewMode` par `handleSetViewMode` dans les handlers existants et dans la prop passée au `Sidebar`.

**Test :** Passer en vue "contacts" → rafraîchir → doit rester sur "contacts".

---

### US-F2 — Front : Sync `filterStatus` ↔ URL

**Fichier :** `front/src/app/whatsapp/page.tsx`

**Changements :**

1. Remplacer l'initialisation de `filterStatus` :
   ```typescript
   // AVANT
   const [filterStatus, setFilterStatus] = useState('all');
   
   // APRÈS
   const [filterStatus, setFilterStatus] = useState(
     searchParams.get('filter') ?? 'all'
   );
   ```

2. Créer un handler `handleSetFilterStatus` qui sync l'URL :
   ```typescript
   const handleSetFilterStatus = useCallback((status: string) => {
     setFilterStatus(status);
     const params = new URLSearchParams(searchParams.toString());
     params.set('filter', status);
     router.replace(`${pathname}?${params.toString()}`, { scroll: false });
   }, [searchParams, pathname, router]);
   ```

3. Remplacer les appels à `setFilterStatus` par `handleSetFilterStatus`.

**Test :** Filtrer sur "open" → rafraîchir → doit rester sur "open".

---

## Ce qui n'est PAS inclus dans ce plan

| État | Raison de l'exclusion |
|------|-----------------------|
| `selectedConversation` (front) | Déjà géré par Zustand — à persistance séparée si nécessaire |
| `conversationFilterPosteId` / `conversationFilterCommercialId` (admin) | Cas d'usage secondaire, complexité > valeur |
| `selectedPeriod` (admin) | P2 — peut être ajouté dans une itération suivante |
| `searchQuery` (front) | Anti-pattern UX — les recherches ne doivent pas survivre au refresh |
| `sidebarOpen` (admin) | Préférence UI — relève de localStorage, pas URL |

---

## Risques et points d'attention

1. **`useSearchParams` + Suspense** : En Next.js 13+ App Router, `useSearchParams()` dans un composant client peut nécessiter un `<Suspense>` wrapper. Si un warning apparaît au build, créer un composant wrapper léger qui reçoit les params en props.

2. **Valeurs invalides dans l'URL** : Un utilisateur peut manipuler `?view=foo` manuellement. Ajouter une validation :
   ```typescript
   const VALID_VIEWS: ViewMode[] = ['overview', 'commerciaux', 'postes', ...];
   const viewFromUrl = searchParams.get('view') as ViewMode;
   const safeView = VALID_VIEWS.includes(viewFromUrl) ? viewFromUrl : 'overview';
   ```

3. **Compatibilité navigation sidebar** : La `Navigation` admin appelle `setViewMode(item.id)` via prop. S'assurer que la prop transmise est bien `handleSetViewMode` (le nouveau wrapper) et non l'ancien `setViewMode` direct.

4. **Pas de `router.push`** : Toujours utiliser `router.replace` pour ne pas créer d'entrées dans l'historique à chaque changement de vue (sinon le bouton "retour" navigateur devient inutilisable).

---

## Ordre d'implémentation recommandé

1. **US-A1** (Admin viewMode) — impact le plus visible, cas le plus simple
2. **US-F1** (Front viewMode) 
3. **US-F2** (Front filterStatus)

Chaque US est indépendante et peut être testée isolément.
