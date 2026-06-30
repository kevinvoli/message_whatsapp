# Audit UI/UX — Panel Admin

> Avis technique et produit sur l'état actuel du panel admin.

---

## Verdict global

Le panel est **fonctionnel mais souffre de dettes accumulées** : navigation trop profonde, incohérences visuelles, et absence d'abstractions partagées. Ces problèmes expliquent directement le bug signalé ("on ne voit pas l'onglet de configuration des pauses"). Ce n'est pas un bug de code — c'est un problème de profondeur de navigation.

---

## 1. Navigation — Le problème principal

### Chemin actuel pour configurer les heures de pause

```
Sidebar → Groupes commerciaux
  → Onglet "Groupes"
    → Clic "Gérer →" sur un groupe
      → Bascule auto sur onglet "Membres"
        → Clic manuel sur "Sous-groupes"
          → Clic sur un sous-groupe pour l'expand
            → Clic sur l'onglet interne "Pause"
```

**6 actions, 3 niveaux de profondeur.** Un admin qui cherche "les horaires de pause" n'a aucune chance de trouver naturellement cet onglet. C'est la cause directe du problème signalé.

### Pourquoi c'est problématique

- Les onglets `Membres / Sous-groupes / Planning` sont **grisés et non-cliquables** tant qu'aucun groupe n'est sélectionné. Un utilisateur qui arrive sur la vue voit 3 boutons désactivés sans comprendre pourquoi.
- La bascule automatique vers "Membres" au clic de "Gérer" est contre-intuitive — l'utilisateur voulait peut-être aller aux sous-groupes.
- Les onglets internes `Membres | Pause` à l'intérieur de chaque `SubGroupCard` sont **invisibles** tant que la carte n'est pas dépliée. Deux niveaux de tabs imbriqués dans une même vue = UX confuse.

### Ce qu'il faudrait

Soit **réduire la profondeur** (accès direct aux sous-groupes depuis la liste de groupes sans passer par un onglet intermédiaire), soit **rendre la découverte plus explicite** (tooltip, label d'aide sur les onglets grisés, accès rapide depuis la carte groupe).

---

## 2. Architecture de navigation globale — SPA masquée

Le routing n'utilise pas le système de pages Next.js. C'est une SPA pilotée par un state `viewMode` avec un `switch` de 30+ cas dans `dashboard/commercial/page.tsx`.

**Conséquences :**
- Un `switch` à 30 cas est difficile à maintenir et à lire
- Les URLs ne reflètent pas vraiment la vue active (juste `?view=X` en query param)
- Certaines valeurs de `ViewMode` n'ont pas de case correspondant dans le switch → dead code silencieux
- `ViewMode` contient `message-traffic` **en doublon** dans le type union (`definitions.ts`)

Ce choix était probablement pragmatique au départ mais devient pénalisant à mesure que le nombre de vues augmente (actuellement ~52 valeurs dans l'union).

---

## 3. Incohérences visuelles

### Couleurs d'accent

| Composant | Couleur accent |
|-----------|---------------|
| Sidebar | `blue-900 / blue-700` |
| `CommercialGroupsView` (tabs, boutons) | `indigo-600` |
| `SettingsView` (tabs actifs) | `blue-500` |
| `PlanningTabsView` | `indigo-600` |

Trois couleurs différentes pour le même concept "actif/primaire". Sans token de couleur centralisé, chaque nouvelle vue ajoute une légère divergence.

### Patterns répétés sans abstraction

Chaque vue réimplémente localement :
- Le pattern `loading / error / data` (pas de hook `useAsync` partagé)
- Les modales (`fixed inset-0 z-50 bg-black/40 ...`) — le même JSX copié 8+ fois
- Le pattern de tabs (`border-b-2 -mb-px transition-colors`) — copié dans chaque vue
- Les boutons primaires/danger — jamais extraits en composant

Il existe `ui/crud/EntityTable.tsx` et `ui/crud/EntityFormModal.tsx` (composants génériques), mais ils ne sont pas utilisés dans les nouvelles vues.

---

## 4. `definitions.ts` — Fichier monolithique

1 530 lignes, 50+ types, tout dans un seul fichier. Ce fichier mélange :
- Types métier (entités : `Chat`, `Message`, `Commercial`, `Poste`)
- Types UI (états de vues, filtres, props)
- Constantes (`SEUILS_ALERTES`, `COULEURS_STATUT`)
- Un import `React.ElementType`

Le problème n'est pas la taille, c'est le mélange de responsabilités. Quand un type change côté backend, il faut retrouver sa définition dans 1 530 lignes.

---

## 5. Vues trop larges

`ConversationsView` est estimée à 300+ lignes pour le composant seul. `CommercialGroupsView` avec tous ses sous-composants inline dépasse 750 lignes dans un seul fichier. La logique de fetch, la logique d'état, et le rendu sont tous dans le même composant.

---

## 6. Ce qui fonctionne bien

- **Cohérence du loading state** : `<Loader2 animate-spin />` utilisé partout, comportement prévisible
- **Tailwind uniquement** : pas de dépendances UI externes à gérer
- **`ToastProvider` et `useToast()`** : pattern centralisé bien fait
- **`ui/crud/EntityTable.tsx`** : générique typé, bonne idée mais sous-utilisé
- **Sidebar collapsible** : bonne ergonomie pour les écrans étroits
- **Persistence URL** (`?view=X`, `?filter=X`) : déjà en place sur les vues principales

---

## Recommandations prioritaires

### Court terme (sans refactoring)

1. **Rendre les sous-groupes accessibles directement depuis la carte groupe** — un bouton "Sous-groupes" à côté de "Gérer" sur chaque card, sans passer par un onglet intermédiaire désactivé.
2. **Label d'aide sur les onglets grisés** : `title="Sélectionnez d'abord un groupe"` au minimum.
3. **Corriger le doublon `message-traffic` dans `ViewMode`** (1 ligne).

### Moyen terme

4. **Extraire un composant `<InnerTabs>`** réutilisable pour tous les patterns tabs imbriqués.
5. **Extraire un hook `useAsync<T>(fn)`** pour factoriser `loading / error / data`.
6. **Séparer `definitions.ts`** en `types/entities.ts`, `types/ui.ts`, `types/api.ts`.

### Long terme

7. **Migrer vers des routes Next.js** pour les vues principales (ou conserver le `viewMode` mais réduire le switch en une map `Record<ViewMode, React.ComponentType>`).
8. **Adopter `EntityTable` et `EntityFormModal`** dans les nouvelles vues plutôt que de réimplémenter.

---

## Résumé

| Dimension | Note | Commentaire |
|-----------|------|-------------|
| Profondeur de navigation | ⚠️ Problème | 3 niveaux pour atteindre "Pause" — trop profond |
| Cohérence visuelle | ⚠️ Moyen | 3 couleurs d'accent différentes, patterns copiés |
| Architecture composants | ⚠️ Moyen | Pas d'abstractions, vues monolithiques |
| Fonctionnalité | ✅ Bon | Tout fonctionne, riche en features |
| Loading states | ✅ Bon | Cohérents et présents partout |
| Types TypeScript | ⚠️ Moyen | Fichier monolithique, doublon dans ViewMode |
