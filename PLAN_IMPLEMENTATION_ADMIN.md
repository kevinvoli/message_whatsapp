# Plan d'implémentation — Refactoring panel admin

> Basé sur `AUDIT_UI_UX_ADMIN.md`. Révisé après critique interne.
> Objectif : corriger les problèmes de navigation, d'incohérence visuelle et de dette technique sans stopper le développement des features.

---

## Principes directeurs

- **Pas de big bang** : chaque sprint livre quelque chose d'utilisable indépendamment
- **Nouvelles vues = nouvelles conventions** : les vues existantes sont migrées progressivement
- **ROI d'abord** : les sprints sont ordonnés par impact utilisateur / risque de régression
- **Critère de done explicite** par sprint — pas de sprint "ouvert"

---

## Sprint 1 — Corrections UX critiques ✦ Faire maintenant

> Zéro risque de régression. Impact immédiat pour les utilisateurs.

### S1-1 : Accès direct aux sous-groupes depuis la carte groupe

**Problème** : atteindre la config de pause demande 6 actions et 3 niveaux de profondeur. L'onglet "Sous-groupes" est grisé sans explication.

**Fix** : ajouter un bouton "Sous-groupes" directement sur chaque carte groupe dans l'onglet `groupes`, à côté de "Gérer". Le clic bascule vers l'onglet `sous-groupes` avec le groupe pré-sélectionné.

**Fichier** : `admin/src/app/ui/CommercialGroupsView.tsx`
**Effort** : XS

---

### S1-2 : Tooltip sur les onglets désactivés

**Problème** : "Membres", "Sous-groupes", "Planning" sont grisés sans expliquer pourquoi.

**Fix** : ajouter `title="Sélectionnez d'abord un groupe"` sur les boutons `disabled`.

**Fichier** : `admin/src/app/ui/CommercialGroupsView.tsx`
**Effort** : XS

---

### S1-3 : Supprimer le doublon `message-traffic` dans `ViewMode`

**Fichier** : `admin/src/app/lib/definitions.ts`
**Effort** : XS (1 ligne)

---

### Critère de done — Sprint 1

- [ ] Un admin peut atteindre la config de pause en 3 actions (carte groupe → bouton "Sous-groupes" → expand sous-groupe → onglet "Pause")
- [ ] Les onglets grisés affichent un tooltip explicatif
- [ ] `ViewMode` ne contient plus de doublon (vérification TypeScript : 0 erreur)

---

## Sprint 2 — Fondations design system

> Créer les briques partagées. Les vues existantes ne sont pas encore migrées — seules les **nouvelles vues** utilisent ces composants.

### S2-1 : Variables CSS pour les couleurs (pas de tokens Tailwind)

**Pourquoi pas `design-tokens.ts` avec des strings Tailwind** : si une classe est construite dynamiquement (`bg-${token}`), le compilateur Tailwind JIT ne la génère pas → styles absents en production.

**Fix** : déclarer les couleurs comme CSS custom properties dans `globals.css`, et les référencer via `text-[var(--color-primary)]` ou via `extend` dans `tailwind.config.ts`.

```css
/* admin/src/app/globals.css */
:root {
  --color-primary:        #4f46e5;  /* indigo-600 */
  --color-primary-hover:  #4338ca;  /* indigo-700 */
  --color-primary-light:  #eef2ff;  /* indigo-50  */
  --color-danger:         #dc2626;  /* red-600    */
  --color-danger-light:   #fef2f2;  /* red-50     */
  --color-warning:        #f59e0b;  /* amber-500  */
  --color-success:        #16a34a;  /* green-600  */
  --color-border:         #e5e7eb;  /* gray-200   */
  --color-surface-alt:    #f9fafb;  /* gray-50    */
}
```

```ts
// tailwind.config.ts — extend pour avoir des classes utilitaires
extend: {
  colors: {
    primary:  'var(--color-primary)',
    'primary-hover': 'var(--color-primary-hover)',
    danger:   'var(--color-danger)',
    // ...
  }
}
```

Usage dans les composants :

```tsx
// ✅ — classe statique Tailwind étendue, compilée correctement
<button className="bg-primary hover:bg-primary-hover text-white rounded-lg px-4 py-2">

// ✅ — fallback avec la valeur CSS var directement
<div style={{ color: 'var(--color-primary)' }}>
```

**Fichiers** : `admin/src/app/globals.css`, `admin/tailwind.config.ts`
**Effort** : S

---

### S2-2 : Composant `<Tabs>`

Le pattern tabs (`border-b-2 -mb-px`) est copié dans chaque vue. Un composant générique évite la divergence.

```tsx
// admin/src/app/ui/shared/Tabs.tsx

interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
  disabled?: boolean;
  disabledTitle?: string;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';  // sm = text-xs, md = text-sm (défaut)
}
```

**Fichier à créer** : `admin/src/app/ui/shared/Tabs.tsx`
**Effort** : S

---

### S2-3 : Composant `<Modal>`

Le JSX `fixed inset-0 z-50 bg-black/40` est copié 8+ fois.

```tsx
// admin/src/app/ui/shared/Modal.tsx

interface ModalProps {
  title: string;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}
```

Gère le `Escape` clavier et le clic sur l'overlay pour fermer.

**Fichier à créer** : `admin/src/app/ui/shared/Modal.tsx`
**Effort** : S

---

### S2-4 : Hook `useAsync<T>` avec deps et cleanup

**Pourquoi le hook simple est insuffisant** : les vues avec filtres (`getChats(posteId)`) doivent re-fetcher quand les dépendances changent. Sans gestion des deps, le hook ne sert qu'aux cas statiques.

```ts
// admin/src/app/hooks/useAsync.ts

function useAsync<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList = [],
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}
```

Implémentation avec :
- `useEffect` sur `deps` → re-exécute `fn` quand une dep change
- Flag `cancelled` pour ignorer les réponses d'un appel obsolète (cleanup)
- `reload` : incrémente un compteur interne pour forcer un re-fetch manuel

```ts
// Utilisation statique
const { data: groups, loading, error, reload } = useAsync(() => getGroups(), []);

// Utilisation avec dépendance
const { data: chats, loading } = useAsync(
  () => getChats(posteId),
  [posteId],   // re-fetch automatique quand posteId change
);
```

**Fichier à créer** : `admin/src/app/hooks/useAsync.ts`
**Effort** : S

---

### Critère de done — Sprint 2

- [ ] `globals.css` contient les variables CSS, `tailwind.config.ts` les expose via `extend`
- [ ] `<Tabs>` rendu dans au moins une vue (CommercialGroupsView comme test)
- [ ] `<Modal>` rendu dans au moins une vue (GroupFormModal comme test)
- [ ] `useAsync` avec test unitaire couvrant : chargement initial, re-fetch sur deps, cleanup annulation

---

## Sprint 3 — Migration des vues existantes

> Appliquer les conventions Sprint 2 aux vues existantes, **du moins risqué au plus risqué**.

### Ordre de migration

| Priorité | Vue | Raison |
|----------|-----|--------|
| 1 | `SettingsView` | Simple, peu de trafic, couleur `blue-500` incohérente à corriger |
| 2 | `CommercialGroupsView` | Déjà touchée en S1, finaliser avec `<Tabs>` et `<Modal>` |
| 3 | `OverviewView` | Page d'accueil — visible mais peu de mutations |
| 4 | `ConversationsView` | La plus complexe et la plus utilisée — en dernier |

Chaque migration = remplacer les modales inline par `<Modal>`, les tabs inline par `<Tabs>`, les triplés `loading/error/data` locaux par `useAsync`.

### Règle de migration

Chaque vue migrée doit passer une checklist de non-régression avant d'être mergée :

- [ ] Chargement initial : spinner visible, données affichées après chargement
- [ ] Erreur réseau : message d'erreur affiché, pas de crash
- [ ] Mutation (create / update / delete) : données rechargées après succès
- [ ] Modal : s'ouvre, se ferme via bouton et via `Escape`
- [ ] Tabs : navigation fonctionnelle, onglet actif visuellement distinct
- [ ] Zéro erreur TypeScript

**Effort** : M par vue

---

## Sprint 4 — Nettoyage `definitions.ts`

### S4-1 : Scinder en sous-fichiers

```
admin/src/app/lib/
├── definitions.ts          ← re-exporte tout (rétrocompatibilité immédiate)
├── types/
│   ├── entities.ts         ← Commercial, Poste, Chat, Message, Canal, Groupe…
│   ├── ui.ts               ← ViewMode, FilterStatus, TabId, LoadState…
│   └── api.ts              ← DTOs, réponses paginées, params de requête
└── constants/
    └── thresholds.ts       ← SEUILS_ALERTES, COULEURS_STATUT
```

`definitions.ts` devient un barrel re-export (`export * from './types/entities'`, etc.) — aucun import existant ne casse.

**Ensuite** (itération suivante) : migrer progressivement les imports directs vers les sous-fichiers.

### S4-2 : Purger les `ViewMode` orphelins

Après S3 (toutes les vues migrées et référencées), supprimer les valeurs de `ViewMode` qui n'ont aucun composant associé. Vérification : chercher chaque valeur dans le codebase — si elle n'apparaît nulle part dans `renderContent` ou `VIEW_REGISTRY`, elle est orpheline.

**Critère de done — Sprint 4**

- [ ] `definitions.ts` est un barrel de moins de 20 lignes
- [ ] `types/entities.ts`, `types/ui.ts`, `types/api.ts` existent et sont cohérents
- [ ] Zéro valeur orpheline dans `ViewMode`
- [ ] Zéro erreur TypeScript après la migration

---

## Ce qui n'est PAS dans ce plan

### Switch → Map (retiré)

Remplacer le switch de 30 cas par une `Map<ViewMode, ComponentType>` a été **retiré** pour deux raisons :
1. Une Map force l'import de tous les composants au démarrage → pas de code splitting possible
2. Le switch peut utiliser `dynamic()` par cas pour du lazy loading — avantage que la Map perd

Si le nombre de vues dépasse 50, reconsidérer avec `React.lazy()` + `Suspense` par groupe de vues.

---

## Règle permanente (à partir de maintenant)

> Toute nouvelle vue créée utilise `<Tabs>`, `<Modal>`, `useAsync`, et les variables CSS de couleur.
> Aucune dérogation sans justification explicite dans la PR.

---

## Suivi

| Sprint | Contenu | Statut |
|--------|---------|--------|
| Sprint 1 | Corrections UX critiques | À faire |
| Sprint 2 | Fondations design system | À faire |
| Sprint 3 | Migration vues existantes | À faire |
| Sprint 4 | Nettoyage definitions.ts | À faire |
