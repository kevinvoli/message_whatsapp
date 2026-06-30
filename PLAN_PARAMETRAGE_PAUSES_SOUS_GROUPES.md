# Plan d'implémentation — Paramétrage des pauses par sous-groupe

> **Objectif** : Permettre à l'admin de configurer, pour chaque sous-groupe, une plage horaire de pause et un message popup affiché aux commerciaux.

---

## Contexte

### Ce qui est déjà fait (rien à toucher)

| Couche | Élément | Statut |
|--------|---------|--------|
| Backend — entité | `SubGroupBreakSchedule` (`sub_group_break_schedule`) | ✅ |
| Backend — service | `BreakScheduleService` (`upsert`, `findBySubGroup`, `softDelete`) | ✅ |
| Backend — controller | `PUT /commercial-groups/sub-groups/:subId/break-schedule` | ✅ |
| Backend — controller | `GET /commercial-groups/sub-groups/:subId/break-schedule` | ✅ |
| Backend — controller | `DELETE /commercial-groups/break-schedule/:scheduleId` | ✅ |
| Admin API layer | `getBreakSchedules`, `upsertBreakSchedule`, `deleteBreakSchedule` | ✅ |
| Admin types | `SubGroupBreakSchedule` dans `definitions.ts` | ✅ |

### Ce qui manque (périmètre de ce plan)

L'UI admin est absente : le `SubGroupCard` dans `CommercialGroupsView.tsx` n'expose pas encore les plages de pause.

---

## Champs configurables

| Champ | Type | Contrainte | Description |
|-------|------|-----------|-------------|
| `startTime` | `HH:MM` | obligatoire | Début de la plage de pause |
| `endTime` | `HH:MM` | obligatoire, > startTime | Fin de la plage de pause |
| `maxDurationMinutes` | entier ≥ 1 | défaut 60 | Durée maximale autorisée (minutes) |
| `reminderIntervalMinutes` | entier ≥ 1 | défaut 5 | Fréquence de rappel si pause non prise (minutes) |
| `popupMessageText` | texte ≤ 1000 chars | optionnel | Message affiché dans le popup commercial |

---

## Architecture cible

L'interface s'intègre **à l'intérieur du `SubGroupCard`** existant via un système d'onglets internes.

```
SubGroupCard (expandable)
├── [Onglet] Membres        ← existant
└── [Onglet] Pause          ← nouveau
    ├── Si aucune plage : formulaire vide + bouton "Enregistrer"
    └── Si plage existante : formulaire pré-rempli + bouton "Enregistrer" + bouton "Supprimer"
```

---

## User Stories

### US-1 — Onglets internes dans `SubGroupCard`

**Fichier** : `admin/src/app/ui/CommercialGroupsView.tsx`

**Ce qui change** :
- Ajouter un état `innerTab: 'membres' | 'pause'` dans `SubGroupCard`
- Afficher deux boutons d'onglet quand la carte est expandée
- Conditionner le rendu existant (membres) sur `innerTab === 'membres'`
- Brancher `innerTab === 'pause'` sur le nouveau composant `BreakSchedulePanel`

**Comportement** :
- Onglet "Membres" sélectionné par défaut à l'ouverture
- Changer d'onglet ne recharge pas les membres

---

### US-2 — Composant `BreakSchedulePanel`

**Fichier à créer** : `admin/src/app/ui/groups/BreakSchedulePanel.tsx`

**Props** :
```ts
interface BreakSchedulePanelProps {
  subGroupId: string;
}
```

**Comportement** :
1. Au montage : `GET /commercial-groups/sub-groups/:subId/break-schedule` → charge la plage existante (tableau, on prend `[0]`)
2. Formulaire contrôlé avec les 5 champs
3. **Enregistrer** → `PUT /commercial-groups/sub-groups/:subId/break-schedule` (upsert)
4. **Supprimer** (visible seulement si une plage existe) → `DELETE /commercial-groups/break-schedule/:scheduleId` puis reset du formulaire
5. Validation locale avant envoi :
   - `startTime` et `endTime` non vides
   - `endTime > startTime` (comparaison string HH:MM suffit)
   - `maxDurationMinutes` et `reminderIntervalMinutes` ≥ 1

**Layout du formulaire** :
```
[ Heure début ]  [ Heure fin ]

[ Durée max (min) ]  [ Rappel toutes les (min) ]

[ Message popup (textarea 3 lignes) ]

[ Enregistrer ]   [ Supprimer ← si existant ]
```

---

## Fichiers concernés

| Fichier | Action |
|---------|--------|
| `admin/src/app/ui/CommercialGroupsView.tsx` | Modifier — ajouter onglets internes + brancher `BreakSchedulePanel` |
| `admin/src/app/ui/groups/BreakSchedulePanel.tsx` | Créer — formulaire complet plage de pause |

Aucune modification backend, aucune migration, aucune modification du layer API.

---

## Ordre d'implémentation

```
1. Créer BreakSchedulePanel.tsx (composant autonome, testable isolément)
2. Modifier SubGroupCard dans CommercialGroupsView.tsx (ajouter onglets internes)
```

---

## Critères de validation

- [ ] Un sous-groupe sans plage de pause affiche un formulaire vide
- [ ] Sauvegarder crée la plage et le formulaire se recharge avec les valeurs sauvées
- [ ] Modifier une valeur et sauvegarder met à jour la plage existante (pas de doublon)
- [ ] `endTime ≤ startTime` → erreur inline, pas d'appel API
- [ ] Supprimer efface la plage et remet le formulaire à vide
- [ ] Le bouton Supprimer n'apparaît que si une plage existe
- [ ] L'onglet "Membres" fonctionne toujours sans régression
