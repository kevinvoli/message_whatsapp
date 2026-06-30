# Conventions front-end — Panel Admin

> Document de référence pour maintenir la cohérence visuelle et technique du panel admin.
> Toute nouvelle vue ou composant doit respecter ces règles.

---

## 1. Couleurs

### Système : CSS custom properties

Les couleurs sont déclarées dans `globals.css` comme variables CSS et exposées via `tailwind.config.ts`. Ne jamais écrire une valeur hexadécimale ou une couleur Tailwind en dur dans une vue.

```css
/* admin/src/app/globals.css */
:root {
  --color-primary:       #4f46e5;  /* indigo-600 */
  --color-primary-hover: #4338ca;  /* indigo-700 */
  --color-primary-light: #eef2ff;  /* indigo-50  */
  --color-danger:        #dc2626;  /* red-600    */
  --color-danger-light:  #fef2f2;  /* red-50     */
  --color-warning:       #f59e0b;  /* amber-500  */
  --color-success:       #16a34a;  /* green-600  */
  --color-border:        #e5e7eb;  /* gray-200   */
  --color-surface-alt:   #f9fafb;  /* gray-50    */
}
```

```ts
// tailwind.config.ts
extend: {
  colors: {
    primary:        'var(--color-primary)',
    'primary-hover':'var(--color-primary-hover)',
    'primary-light':'var(--color-primary-light)',
    danger:         'var(--color-danger)',
    'danger-light': 'var(--color-danger-light)',
  }
}
```

### Palette officielle

| Rôle | Variable CSS | Usage |
|------|-------------|-------|
| Primaire | `--color-primary` | Boutons principaux, tabs actifs, focus ring |
| Primaire hover | `--color-primary-hover` | Hover des boutons primaires |
| Primaire léger | `--color-primary-light` | Fond hover des boutons secondaires, bg badge actif |
| Danger | `--color-danger` | Suppression, erreurs critiques |
| Warning | `--color-warning` | Désactivation, alertes modérées |
| Succès | `--color-success` | Confirmation, statut actif |
| Bordure | `--color-border` | Inputs, cards, séparateurs |
| Surface alt | `--color-surface-alt` | Fond section dépliée, ligne alternée |

**Exception** : la sidebar (`bg-blue-900`) est délibérément distincte — elle représente l'espace "navigation système", pas le contenu.

### Pourquoi pas `design-tokens.ts` avec des strings Tailwind

Tailwind JIT ne génère une classe CSS que s'il voit son nom complet dans le source. Une construction dynamique comme `bg-${variable}` produit une classe jamais générée → styles absents en production. Les CSS custom properties contournent ce problème : la valeur est résolue au runtime par le navigateur, pas au build.

---

## 2. Composants partagés obligatoires

Tous dans `admin/src/app/ui/shared/`. Utiliser ces composants en priorité sur toute réimplémentation locale.

### `<Tabs>`

```tsx
import Tabs from '@/ui/shared/Tabs';

// Onglets simples
<Tabs
  tabs={[
    { id: 'membres', label: 'Membres' },
    { id: 'pause',   label: 'Pause' },
  ]}
  active={innerTab}
  onChange={setInnerTab}
/>

// Avec onglet désactivé + tooltip
<Tabs
  tabs={[
    { id: 'membres',     label: 'Membres', },
    { id: 'sous-groupes',label: 'Sous-groupes', disabled: !selectedGroup, disabledTitle: 'Sélectionnez d'abord un groupe' },
  ]}
  active={activeTab}
  onChange={setActiveTab}
  size="md"
/>
```

`size` : `sm` (text-xs, pour les onglets internes) | `md` (text-sm, défaut, pour les onglets principaux)

Ne jamais écrire `border-b-2 -mb-px` directement dans une vue.

---

### `<Modal>`

```tsx
import Modal from '@/ui/shared/Modal';

<Modal title="Modifier le groupe" onClose={closeModal} size="md">
  {/* contenu du formulaire */}
</Modal>
```

`size` : `sm` (max-w-sm) | `md` (max-w-md, défaut) | `lg` (max-w-lg)

Comportements inclus : fermeture via `Escape`, fermeture via clic sur l'overlay.

Ne jamais écrire `fixed inset-0 z-50 bg-black/40` directement dans une vue.

---

### Hook `useAsync<T>`

```ts
import { useAsync } from '@/hooks/useAsync';

// Fetch statique (une seule fois)
const { data: groups, loading, error, reload } = useAsync(
  () => getGroups(),
  [],
);

// Fetch avec dépendance — se relance automatiquement quand posteId change
const { data: chats, loading } = useAsync(
  () => getChats(posteId),
  [posteId],
);

// Re-fetch manuel après une mutation
const handleDelete = async () => {
  await deleteGroup(id);
  reload();
};
```

Ne jamais réimplémenter le triptyque `useState(false) / useState(null) / useState([])` pour loading/error/data.

---

### Composants CRUD existants

Pour les vues liste + formulaire d'édition simples, utiliser les composants génériques :
- `ui/crud/EntityTable.tsx` — table générique typée
- `ui/crud/EntityFormModal.tsx` — modal CRUD générique

---

## 3. Boutons

### Classes standard

```tsx
// Primaire
"flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm
 hover:bg-primary-hover disabled:opacity-50"

// Secondaire
"px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"

// Danger
"flex items-center gap-1.5 px-4 py-2 border border-danger-light text-danger
 rounded-lg text-sm hover:bg-danger-light disabled:opacity-50"

// Icône seule
"p-1.5 text-gray-400 hover:text-primary rounded hover:bg-primary-light"
```

### Règles

- Toujours `disabled` + `opacity-50` pendant une opération async
- Toujours `void handler()` sur les `onClick` async — jamais de floating promise

```tsx
// ✅
<button onClick={() => void handleSave()} disabled={saving}>

// ❌
<button onClick={handleSave}>
```

- Toujours un `aria-label` sur les boutons icône sans texte visible

---

## 4. Formulaires

### Classes standard

```tsx
// Label
<label className="block text-xs font-medium text-gray-700 mb-1">

// Input texte / number / time
<input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary focus:outline-none" />

// Textarea
<textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                     focus:ring-2 focus:ring-primary focus:outline-none resize-none" />

// Select
<select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                   focus:ring-2 focus:ring-primary focus:outline-none appearance-none" />
```

### Affichage d'erreur

```tsx
{error && (
  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
)}
```

Toujours inline, sous le champ concerné ou sous les boutons d'action. Jamais de toast pour une erreur de formulaire — le toast est réservé aux confirmations de succès.

---

## 5. Loading states

### Chargement initial d'une vue

```tsx
if (loading) {
  return (
    <div className="flex items-center justify-center h-32 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
    </div>
  );
}
```

### Chargement inline (bouton en cours d'action)

```tsx
{saving
  ? <Loader2 className="w-4 h-4 animate-spin" />
  : <Save className="w-4 h-4" />
}
```

### État vide (aucune donnée)

```tsx
<div className="text-center py-16 text-gray-400">
  <IconComponent className="w-12 h-12 mx-auto mb-3 opacity-30" />
  <p>Aucun élément configuré.</p>
</div>
```

---

## 6. Icônes

**Uniquement `lucide-react`.** Tailles selon le contexte :

| Contexte | Taille |
|----------|--------|
| Titre de section (`h2`) | `w-6 h-6` |
| Bouton avec texte | `w-4 h-4` |
| Bouton icône seul | `w-4 h-4` |
| Inline dans texte ou liste | `w-3.5 h-3.5` |
| Très petit (badge, chip) | `w-3 h-3` |

---

## 7. Structure d'un fichier de vue

```
admin/src/app/ui/NomDeLaVueView.tsx
```

```tsx
'use client';

// 1. Imports React
import React, { useState } from 'react';

// 2. Imports lucide
import { Icon1, Icon2 } from 'lucide-react';

// 3. Imports composants partagés
import Tabs  from '@/ui/shared/Tabs';
import Modal from '@/ui/shared/Modal';

// 4. Imports hooks
import { useAsync } from '@/hooks/useAsync';

// 5. Imports API
import { getFoo, createFoo } from '@/lib/api/foo.api';

// 6. Imports types — depuis les sous-fichiers, pas depuis definitions.ts
import type { FooType } from '@/lib/types/entities';

// ─── Sous-composants internes ────────────────────────────────────────────────
// Déclarés AVANT le composant principal, nommés en PascalCase

function FooCard({ foo }: { foo: FooType }) { ... }

// ─── Composant principal ─────────────────────────────────────────────────────
export default function NomDeLaVueView() { ... }
```

### Sous-composant vs fichier séparé

| Situation | Décision |
|-----------|----------|
| Utilisé uniquement dans cette vue | Déclarer dans le même fichier |
| Utilisé dans 2+ vues | Créer un fichier dans `ui/shared/` |
| Lié à un domaine métier spécifique (groupes, planning…) | Créer un fichier dans `ui/[domaine]/` |

### Taille limite

Un fichier de vue ne doit pas dépasser **300 lignes**. Au-delà, extraire des sous-composants.

---

## 8. États et mutations

### Pattern d'état local autorisé hors `useAsync`

```ts
// État formulaire contrôlé — OK
const [name, setName] = useState('');

// État UI pure — OK
const [expanded, setExpanded] = useState(false);
const [activeTab, setActiveTab] = useState<Tab>('membres');

// Mutation en cours — OK (distinct du loading du fetch)
const [saving, setSaving]   = useState(false);
const [deleting, setDeleting] = useState(false);
```

### Pattern de mutation

```ts
const handleSave = async () => {
  setSaving(true);
  setError(null);
  try {
    await updateFoo(id, dto);
    reload();       // recharge via useAsync
    onClose?.();
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Erreur.');
  } finally {
    setSaving(false);
  }
};
```

---

## 9. Navigation (ViewMode)

### Ajouter une nouvelle vue

1. Ajouter **une seule** valeur dans `ViewMode` (`lib/types/ui.ts`) — vérifier l'absence de doublon
2. Ajouter l'entrée dans `renderContent()` de `dashboard/commercial/page.tsx`
3. Ajouter l'item dans la sidebar (`ui/Navigation.tsx`) si c'est une vue principale
4. Vérifier que la nouvelle valeur est dans `VALID_VIEWS` si ce tableau existe

### Ce qu'il ne faut pas faire

- Jamais dupliquer une valeur dans `ViewMode`
- Jamais créer une route Next.js `app/X/page.tsx` pour une vue admin (sauf exception validée en PR)
- Jamais laisser une valeur `ViewMode` sans composant associé

---

## 10. TypeScript

- **Zéro `any`** — `unknown` + type guard si le type est inconnu à la compilation
- **Events typés explicitement** : `React.ChangeEvent<HTMLInputElement>`, pas `e: any`
- **Handlers async** : `void handler()` sur onClick, jamais de floating promise
- **Props optionnelles** : utiliser `?` + valeur par défaut dans la destructuration

```ts
// ✅
function Panel({ onClose, size = 'md' }: { onClose?: () => void; size?: 'sm' | 'md' }) {}

// ❌
function Panel(props: any) {}
```

---

## 11. Nommage

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Composant React | PascalCase | `SubGroupCard`, `BreakSchedulePanel` |
| Fichier composant | PascalCase.tsx | `BreakSchedulePanel.tsx` |
| Hook | camelCase, préfixe `use` | `useAsync`, `useBreakPrompt` |
| Fichier hook | camelCase.ts | `useAsync.ts` |
| Fichier API | kebab-case.api.ts | `commercial-groups.api.ts` |
| Type / interface | PascalCase | `CommercialGroup`, `SubGroupInnerTab` |
| Constante module | SCREAMING_SNAKE | `DEFAULT_FORM`, `VALID_VIEWS` |

---

## 12. Interdictions explicites

| Interdit | Raison | Alternative |
|----------|--------|------------|
| Copier-coller le JSX de modal | Divergence garantie | `<Modal>` |
| Copier-coller le pattern tabs | 3 variantes visuelles coexistantes | `<Tabs>` |
| `loading/error/data` en état local | Réimplémentation systématique | `useAsync` |
| `bg-indigo-600` / `bg-blue-500` en dur dans une vue | Incohérence de couleur | Variables CSS / classes Tailwind étendues |
| `any` TypeScript | Perd la sûreté du typage | `unknown` + type guard |
| Floating promise sur `onClick` | Erreurs async silencieuses | `() => void handler()` |
| Composant > 300 lignes | Illisible, difficile à tester | Extraire des sous-composants |
| Ajouter un type directement dans `definitions.ts` | Fichier déjà trop dense | `lib/types/entities.ts`, `ui.ts` ou `api.ts` |
| Valeur `ViewMode` en doublon | Confusion de routing | Vérifier avant d'ajouter |
