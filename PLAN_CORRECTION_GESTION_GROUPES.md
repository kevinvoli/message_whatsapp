# Plan de correction — Gestion des groupes commerciaux

_Basé sur le rapport d'analyse du 2026-06-29_

---

## Contexte

L'audit révèle que 6 endpoints backend sont manquants, rendant 4 composants admin non fonctionnels.
Les services sont tous implémentés et les tables existent en production.
**Aucune migration SQL n'est nécessaire** — uniquement des contrôleurs et routes à ajouter.

---

## Cause racine

Un contrôleur dédié aux sous-groupes / pauses n'a jamais été créé. Le `CommercialGroupController` gère les groupes mais pas les sous-entités. Les services `CommercialSubGroupService`, `BreakScheduleService`, `BreakExclusionService`, `BreakSupervisionService` sont orphelins.

---

## Sprint 1 — Contrôleur sous-groupes (US-A)

### Périmètre
Créer `src/commercial-group/commercial-sub-group.controller.ts` avec toutes les routes CRUD sous-groupes + membres.

### Routes à exposer

```
GET    /commercial-groups/:groupId/sub-groups            → CommercialSubGroupService.findAll(groupId)
POST   /commercial-groups/:groupId/sub-groups            → CommercialSubGroupService.create(groupId, dto)
GET    /commercial-groups/sub-groups/:subId              → CommercialSubGroupService.findOneWithMembers(subId)
PATCH  /commercial-groups/sub-groups/:subId              → CommercialSubGroupService.update(subId, dto)
DELETE /commercial-groups/sub-groups/:subId              → CommercialSubGroupService.softDelete(subId)
POST   /commercial-groups/sub-groups/:subId/members      → CommercialSubGroupService.addMember(subId, commercialId)
DELETE /commercial-groups/sub-groups/:subId/members/:cid → CommercialSubGroupService.removeMember(subId, cid)
```

### Guard
Toutes les routes : `AdminGuard`

### DTOs
- `CreateSubGroupDto` : `{ name: string; description?: string }`
- `UpdateSubGroupDto` : `{ name?: string; description?: string; isActive?: boolean }`
- `AddMemberDto` : `{ commercialId: string }`

### Module
Enregistrer `CommercialSubGroupController` dans `controllers: []` de `commercial-group.module.ts`.

### Impact frontend admin
`SubGroupsGroupSelector.tsx` et `SubGroupsManager.tsx` : toutes les opérations CRUD redeviennent fonctionnelles.

---

## Sprint 2 — Routes plages de pause + exclusions (US-B)

### Périmètre
Ajouter les routes pause/exclusion au même contrôleur ou à `commercial-sub-group.controller.ts`.

### Routes plages de pause

```
GET    /commercial-groups/sub-groups/:subId/break-schedule   → BreakScheduleService.findBySubGroup(subId)
PUT    /commercial-groups/sub-groups/:subId/break-schedule   → BreakScheduleService.upsert(subId, dto)
DELETE /commercial-groups/break-schedule/:scheduleId         → BreakScheduleService.softDelete(scheduleId)
```

DTOs : `UpsertBreakScheduleDto` existe déjà dans `dto/sub-group.dto.ts`.

### Routes exclusions de pause

```
GET    /commercial-groups/sub-groups/:subId/exclusions       → BreakExclusionService.findBySubGroup(subId)
POST   /commercial-groups/sub-groups/:subId/exclusions       → BreakExclusionService.create(dto)
DELETE /commercial-groups/exclusions/:exclusionId            → BreakExclusionService.softDelete(exclusionId)
```

DTOs : `CreateBreakExclusionDto` existe déjà dans `dto/sub-group.dto.ts`.

### Impact frontend admin
`BreakScheduleForm.tsx` et `BreakExclusionsPanel.tsx` : lecture + écriture opérationnelles.

---

## Sprint 3 — Supervision pauses + disconnect alerts (US-C)

### Route supervision temps réel

```
GET /commercial-groups/break-supervision?posteId=&subGroupId=  → BreakSupervisionService.getSupervision()
```

Vérifier que `BreakSupervisionService` est bien dans `providers[]` du module (probablement non).

### Disconnect alerts

L'endpoint `GET /commercial-groups/disconnect-alerts` n'existe pas mais est appelé depuis `PlanningTabsView.tsx`.

**Option A (recommandée)** : Implémenter la route qui retourne les sessions avec `alertedAt IS NOT NULL AND logoutAt IS NULL` (commerciaux actuellement déconnectés de façon anormale). Le service `DisconnectMonitorJob` détecte déjà ces sessions — ajouter une méthode `getActiveAlerts()` dans `CommercialGroupService`.

```
GET /commercial-groups/disconnect-alerts → sessions alertedAt IS NOT NULL AND logoutAt IS NULL
Retourne : DisconnectAlert[] { commercialId, commercialName, disconnectedSince, totalDisconnectMinutes }
```

**Option B** : Supprimer l'appel `getDisconnectAlerts()` depuis `PlanningTabsView.tsx` et `DisconnectAlertsBanner.tsx` si la feature n'est pas souhaitée.

---

## Récapitulatif des fichiers

### Backend — à créer
| Fichier | Contenu |
|---|---|
| `src/commercial-group/commercial-sub-group.controller.ts` | 7 routes CRUD sous-groupes + membres |

### Backend — à modifier
| Fichier | Modification |
|---|---|
| `src/commercial-group/commercial-group.module.ts` | Ajouter `CommercialSubGroupController` dans `controllers[]`, `BreakSupervisionService` dans `providers[]` |
| `src/commercial-group/commercial-sub-group.controller.ts` | Ajouter routes break-schedule + exclusions |
| `src/commercial-group/commercial-group.service.ts` | Ajouter méthode `getActiveAlerts()` (Option A) |
| `src/commercial-group/commercial-group.controller.ts` | Ajouter route `GET /disconnect-alerts` (Option A) |

### Frontend admin — aucune modification normalement requise
Les composants admin (`SubGroupsManager`, `BreakScheduleForm`, `BreakExclusionsPanel`, `BreakSupervisionTable`) appellent déjà les bons endpoints — ils fonctionneront dès que les routes backend existent.

---

## Angles morts à surveiller

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| 1 | `BreakSupervisionService` probablement absent de `providers[]` | Crash injection | Vérifier et ajouter si manquant |
| 2 | Circular dependency `CommercialGroupModule → WhatsappMessageModule` | Crash démarrage | Déjà résolu (import unidirectionnel) |
| 3 | `CommercialSubGroupController` conflit de route avec `CommercialGroupController` sur `/sub-groups/:id` | Route shadowing | Placer routes statiques avant les paramétrées |
| 4 | `BreakScheduleEngine` vérifie les exclusions via `BreakExclusionService.isExcluded()` — si la méthode n'existe pas | Runtime error | Vérifier la signature avant de déployer |

---

## Ordre d'exécution recommandé

```
Sprint 1 (backend + zéro frontend) → Sprint 2 (backend + zéro frontend) → Sprint 3 (backend léger + fix frontend optionnel)
```

Les trois sprints sont indépendants et peuvent être réalisés en une seule session. Pas de migration SQL à chaque étape — uniquement du code NestJS.

---

## Critères de validation

- `npx tsc --noEmit` dans `message_whatsapp/` → 0 erreur
- `npx tsc --noEmit` dans `admin/` → 0 erreur
- `GET /commercial-groups/:groupId/sub-groups` retourne `[]` (sans crash)
- `PUT /commercial-groups/sub-groups/:subId/break-schedule` crée une entrée en base
- `GET /commercial-groups/break-supervision` retourne le tableau de supervision
- `SubGroupsManager.tsx` charge et affiche les sous-groupes sans erreur 404
