# Plan d'implémentation — Emploi du temps des groupes commerciaux

**Basé sur :** `RAPPORT_IMPLEMENTATION_EMPLOI_DU_TEMPS_GROUPES.md`  
**Date :** 2026-05-18  
**Statut global :** 🔴 À faire

---

## Sprint A — Backend core

### A1 — Migrations base de données
**Statut :** 🔴 À faire  
**Fichiers à créer :**
- `message_whatsapp/src/db/migrations/AddScheduleConfigToGroup1779062400001.ts`
- `message_whatsapp/src/db/migrations/CreateGroupScheduleDay1779062400002.ts`

**Tâches :**
- [ ] Créer la migration `AddScheduleConfigToGroup1779062400001` :
  - Ajoute colonne `work_days_count INT NOT NULL DEFAULT 2` sur `commercial_group`
  - Ajoute colonne `first_work_day DATE NULL DEFAULT NULL` sur `commercial_group`
- [ ] Créer la migration `CreateGroupScheduleDay1779062400002` :
  - Crée la table `group_schedule_day` avec colonnes : `id`, `group_id`, `date`, `is_work_day`, `created_at`
  - Crée l'index unique `UQ_group_schedule_day (group_id, date)`
  - Crée les index `IDX_group_schedule_date (date)` et `IDX_group_schedule_group (group_id)`

**Critères de validation :**
- `npx typeorm migration:run` s'exécute sans erreur
- La table `group_schedule_day` existe en base
- Les colonnes `work_days_count` et `first_work_day` existent sur `commercial_group`

---

### A2 — Mise à jour entité `CommercialGroup`
**Statut :** 🔴 À faire  
**Fichier à modifier :**
- `message_whatsapp/src/commercial-group/entities/commercial-group.entity.ts`

**Tâches :**
- [ ] Ajouter le champ `workDaysCount: number` (décorateur `@Column`, default 2)
- [ ] Ajouter le champ `firstWorkDay: string | null` (décorateur `@Column`, type `date`, nullable)

**Critères de validation :**
- Pas d'erreur TypeScript à la compilation

---

### A3 — Nouvelle entité `GroupScheduleDay`
**Statut :** 🔴 À faire  
**Fichier à créer :**
- `message_whatsapp/src/commercial-group/entities/group-schedule-day.entity.ts`

**Tâches :**
- [ ] Créer l'entité avec les champs : `id`, `groupId`, `date`, `isWorkDay`, `createdAt`
- [ ] Ajouter les décorateurs `@Index` pour `UQ_group_schedule_day` (unique) et `IDX_group_schedule_date`
- [ ] Enregistrer l'entité dans `commercial-group.module.ts` via `TypeOrmModule.forFeature([..., GroupScheduleDay])`

**Critères de validation :**
- L'entité est reconnue par TypeORM sans erreur au démarrage

---

### A4 — Nouveau service `GroupScheduleService`
**Statut :** 🔴 À faire  
**Fichiers à créer :**
- `message_whatsapp/src/commercial-group/group-schedule.service.ts`
- `message_whatsapp/src/commercial-group/group-schedule.service.spec.ts`

**Tâches :**
- [ ] Implémenter `generateForGroup(groupId, months = 3)` :
  - Lire `workDaysCount` et `firstWorkDay` du groupe
  - Lancer l'exception si `firstWorkDay` est null
  - Calculer pour chaque jour de la période : `delta = daysBetween(firstWorkDay, j)`, `position = delta % (workDaysCount * 2)`, `isWorkDay = position < workDaysCount`
  - UPSERT en base (INSERT ... ON DUPLICATE KEY UPDATE) — remplace tout planning existant pour la période
  - Retourner le nombre de jours créés/mis à jour
- [ ] Implémenter `generateForAllGroups(months = 3)` :
  - Charger tous les groupes actifs avec `firstWorkDay IS NOT NULL`
  - Appeler `generateForGroup` sur chacun
  - Retourner un résumé `{ groupId, daysGenerated }[]`
- [ ] Implémenter `getTodayWorkingGroupIds()` :
  - Calculer la date du jour au format `'YYYY-MM-DD'` (fuseau horaire `APP_TIMEZONE`)
  - Requête `GROUP BY group_id WHERE date = today AND is_work_day = true`
  - Retourner la liste des `groupId`
- [ ] Implémenter `getCalendarForGroup(groupId, from, to)` :
  - Retourner la liste de `{ date, isWorkDay, dayOfWeek }` pour la période
- [ ] Écrire les tests unitaires pour l'algorithme de génération :
  - Cas nominal : 2 jours travail / 2 jours repos
  - Cas 3 jours : 3 jours travail / 3 jours repos
  - Cas samedi/dimanche : vérifier qu'ils peuvent être des jours travaillés
  - Cas `firstWorkDay` à null : doit lever une exception

**Critères de validation :**
- Tous les tests unitaires passent
- L'algorithme produit le bon cycle pour workDaysCount = 2 et 3

---

### A5 — Contrainte poste unique dans un groupe
**Statut :** 🔴 À faire  
**Fichier à modifier :**
- `message_whatsapp/src/commercial-group/commercial-group.service.ts`

**Tâches :**
- [ ] Dans `addMember(groupId, commercialId)` : avant d'ajouter le commercial, vérifier qu'aucun autre membre du groupe n'a le même `poste_id`
- [ ] Si conflit : lever `ConflictException` avec message explicite (nom du poste concerné)
- [ ] Ajouter injection du repository `WhatsappCommercial` si pas déjà présent

**Critères de validation :**
- Tenter d'ajouter un commercial sur un poste déjà occupé dans le groupe → HTTP 409
- Ajouter un commercial sur un poste libre → HTTP 201

---

### A6 — Nouvelles méthodes dans `CommercialGroupService`
**Statut :** 🔴 À faire  
**Fichier à modifier :**
- `message_whatsapp/src/commercial-group/commercial-group.service.ts`

**Tâches :**
- [ ] Ajouter `setScheduleConfig(id, dto: { workDaysCount, firstWorkDay })` :
  - Vérifier que le groupe existe
  - Mettre à jour `workDaysCount` et `firstWorkDay`
- [ ] Ajouter `generateSchedule(id, months?)` : délègue à `GroupScheduleService.generateForGroup()`
- [ ] Ajouter `getSchedule(id, from?, to?)` : délègue à `GroupScheduleService.getCalendarForGroup()`
- [ ] Injecter `GroupScheduleService` dans le constructeur

**Critères de validation :**
- Pas d'erreur TypeScript

---

### A7 — Nouveaux endpoints dans `CommercialGroupController`
**Statut :** 🔴 À faire  
**Fichier à modifier :**
- `message_whatsapp/src/commercial-group/commercial-group.controller.ts`

**Tâches :**
- [ ] `PATCH /commercial-groups/:id/schedule-config` → appelle `setScheduleConfig()` — DTO : `{ workDaysCount: number, firstWorkDay: string }`
- [ ] `POST /commercial-groups/:id/schedule/generate` → appelle `generateSchedule()` — body optionnel `{ months?: number }` — retourne `{ daysGenerated: number }`
- [ ] `GET /commercial-groups/:id/schedule` → appelle `getSchedule()` — query params `from?`, `to?`
- [ ] `POST /commercial-groups/schedule/generate-all` → appelle `generateForAllGroups()` — retourne le résumé par groupe
- [ ] Tous les endpoints protégés par `@UseGuards(AdminGuard)`
- [ ] Créer le DTO `ScheduleConfigDto` avec validations : `@IsInt() @Min(1) @Max(14)` pour `workDaysCount`, `@IsDateString()` pour `firstWorkDay`

**Critères de validation :**
- `PATCH /commercial-groups/:id/schedule-config` avec body valide → 200 + config mise à jour
- `POST /commercial-groups/:id/schedule/generate` → 201 + nombre de jours générés
- `GET /commercial-groups/:id/schedule` → 200 + tableau de jours
- Toute requête sans token admin → 401/403

---

### A8 — Mise à jour `DailyResetJob`
**Statut :** 🔴 À faire  
**Fichier à modifier :**
- `message_whatsapp/src/work-schedule/jobs/daily-reset.job.ts`

**Tâches :**
- [ ] Injecter `GroupScheduleService` et le repository `WhatsappCommercial`
- [ ] Remplacer la logique actuelle (reset global à false) par :
  1. Appeler `getTodayWorkingGroupIds()` pour obtenir les groupes en travail
  2. `UPDATE whatsapp_commercial SET is_working_today = true WHERE group_id IN (...)`
  3. `UPDATE whatsapp_commercial SET is_working_today = false WHERE group_id NOT IN (...)` (y compris les `group_id IS NULL`)
- [ ] Conserver le cron `0 0 * * *` (tous les jours, 7j/7)
- [ ] Logger le résultat : nombre de commerciaux activés / désactivés

**Critères de validation :**
- Le jour où un groupe est planifié comme "travail" : ses commerciaux ont `is_working_today = true` après minuit
- Le jour de repos : `is_working_today = false`
- Commerciaux sans groupe : toujours à `false`

---

## Sprint B — Intégration attribution d'appels

### B1 — Mise à jour `WorkScheduleService.getActiveGroupIds()`
**Statut :** 🔴 À faire  
**Fichier à modifier :**
- `message_whatsapp/src/work-schedule/work-schedule.service.ts`

**Tâches :**
- [ ] Injecter le repository `GroupScheduleDay`
- [ ] Après le filtre horaire existant (day-of-week + heures), ajouter le filtre rotatif :
  - Calculer `todayStr = 'YYYY-MM-DD'`
  - Requêter `group_schedule_day WHERE date = todayStr AND is_work_day = true`
  - Construire `rotatingGroupIds` (Set)
  - Retourner uniquement les groupes qui passent **les deux** filtres
  - Si aucun planning rotatif n'est généré pour un groupe : l'inclure par défaut (rétrocompatibilité)

**Critères de validation :**
- Un groupe en jour de repos n'est pas retourné par `getActiveGroupIds()` même si l'heure est dans la plage 06h-20h
- Un groupe sans planning rotatif généré continue d'être retourné normalement

---

### B2 — Tests d'intégration
**Statut :** 🔴 À faire  
**Fichier à créer :**
- `message_whatsapp/src/commercial-group/group-schedule.service.spec.ts` (si pas fait en A4)

**Tâches :**
- [ ] Test : génération 3 mois sur un groupe avec `workDaysCount = 2`
  - Vérifier que les jours alternent bien 2 travail / 2 repos
  - Vérifier que samedi et dimanche peuvent être TRAVAIL
- [ ] Test : génération 3 mois avec `workDaysCount = 3`
- [ ] Test : `getTodayWorkingGroupIds()` retourne le bon groupe selon la date simulée
- [ ] Test : `getActiveGroupIds()` exclut un groupe en jour de repos
- [ ] Test : contrainte poste unique → `ConflictException` au bon moment

**Critères de validation :**
- Tous les tests passent (`npm run test`)
- Couverture des cas limites (début de cycle, fin de cycle, régénération)

---

## Sprint C — Interface admin

### C1 — Types et API client admin
**Statut :** 🔴 À faire  
**Fichiers à modifier :**
- `admin/src/app/lib/definitions.ts`
- `admin/src/app/lib/api.ts`

**Tâches :**
- [ ] Dans `definitions.ts` : ajouter les types
  ```typescript
  GroupScheduleDay { date: string; isWorkDay: boolean; dayOfWeek: number }
  ScheduleConfigDto { workDaysCount: number; firstWorkDay: string }
  GroupWithSchedule extends CommercialGroup { workDaysCount: number; firstWorkDay: string | null }
  ```
- [ ] Dans `api.ts` : ajouter les fonctions
  - `patchGroupScheduleConfig(id, dto: ScheduleConfigDto)`
  - `generateGroupSchedule(id, months?: number)`
  - `generateAllGroupSchedules()`
  - `getGroupSchedule(id, from?: string, to?: string): Promise<GroupScheduleDay[]>`

**Critères de validation :**
- Pas d'erreur TypeScript

---

### C2 — Composant `ScheduleConfigForm`
**Statut :** 🔴 À faire  
**Fichier à créer :**
- `admin/src/app/components/groups/ScheduleConfigForm.tsx`

**Tâches :**
- [ ] Formulaire avec deux champs :
  - `workDaysCount` : input number (min 1, max 14, step 1)
  - `firstWorkDay` : input date
- [ ] Bouton "Enregistrer la config" → appelle `patchGroupScheduleConfig()`
- [ ] Bouton "Générer 3 mois" → appelle `generateGroupSchedule()` → affiche un toast succès avec le nombre de jours générés
- [ ] Gestion des états loading / erreur sur chaque bouton
- [ ] Pré-remplissage avec les valeurs actuelles du groupe (`workDaysCount`, `firstWorkDay`)

**Critères de validation :**
- Enregistrer une config → les champs sont mis à jour en base
- Cliquer "Générer 3 mois" sans `firstWorkDay` configuré → message d'erreur explicite
- Cliquer "Générer 3 mois" avec config valide → confirmation avec nombre de jours

---

### C3 — Composant `GroupScheduleCalendar`
**Statut :** 🔴 À faire  
**Fichier à créer :**
- `admin/src/app/components/groups/GroupScheduleCalendar.tsx`

**Tâches :**
- [ ] Afficher un calendrier sur 3 mois (mois courant + 2 suivants)
- [ ] Chaque jour coloré : vert foncé = TRAVAIL, gris clair = REPOS, bleu = aujourd'hui
- [ ] Charger les données via `getGroupSchedule(groupId)` au montage
- [ ] Si aucun planning généré : afficher un message "Aucun planning généré — cliquez sur Générer 3 mois"
- [ ] Navigation mois précédent / suivant (boutons)
- [ ] Légende en bas : TRAVAIL / REPOS / Aujourd'hui

**Critères de validation :**
- Le calendrier affiche correctement les jours travaillés en vert
- La navigation mensuelle fonctionne
- Après clic sur "Générer 3 mois" (depuis `ScheduleConfigForm`), le calendrier se rafraîchit automatiquement

---

### C4 — Composant `GroupPresenceTable`
**Statut :** 🔴 À faire  
**Fichier à créer :**
- `admin/src/app/components/groups/GroupPresenceTable.tsx`

**Tâches :**
- [ ] Tableau listant tous les groupes actifs avec pour chaque groupe :
  - Nom du groupe
  - Badge "En service" (vert) ou "Repos" (gris) selon si aujourd'hui est un jour de travail
  - Noms des commerciaux membres
- [ ] Données chargées via `getGroupSchedule()` pour la date du jour
- [ ] Afficher la date du jour en titre

**Critères de validation :**
- Les groupes en travail aujourd'hui affichent le badge vert
- Les groupes en repos affichent le badge gris

---

### C5 — Intégration dans la page admin des groupes
**Statut :** 🔴 À faire  
**Fichier à modifier :**
- Page admin existante gérant les groupes (à identifier selon l'arborescence admin)

**Tâches :**
- [ ] Intégrer `ScheduleConfigForm` sous la liste des membres de chaque groupe
- [ ] Intégrer `GroupScheduleCalendar` sous `ScheduleConfigForm`
- [ ] Ajouter `GroupPresenceTable` en haut de la page (vue globale du jour)
- [ ] S'assurer que la mise à jour du planning via le formulaire déclenche le rechargement du calendrier (via state ou callback)

**Critères de validation :**
- Flux complet : configurer rythme + premier jour → générer → voir le calendrier mis à jour → vérifier que `GroupPresenceTable` reflète le bon statut

---

## Ordre d'exécution recommandé

```
A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8
                 ↓
                B1 → B2
                          ↓
                         C1 → C2 → C3 → C4 → C5
```

Les sprints A et B sont des prérequis stricts du sprint C.  
Au sein du sprint A, respecter l'ordre A1 → A2 → A3 (les migrations et entités en premier).

---

## Récapitulatif des fichiers

| Fichier | Action | Sprint |
|---------|--------|--------|
| `src/db/migrations/AddScheduleConfigToGroup1779062400001.ts` | CRÉER | A1 |
| `src/db/migrations/CreateGroupScheduleDay1779062400002.ts` | CRÉER | A1 |
| `src/commercial-group/entities/commercial-group.entity.ts` | MODIFIER | A2 |
| `src/commercial-group/entities/group-schedule-day.entity.ts` | CRÉER | A3 |
| `src/commercial-group/commercial-group.module.ts` | MODIFIER | A3 |
| `src/commercial-group/group-schedule.service.ts` | CRÉER | A4 |
| `src/commercial-group/group-schedule.service.spec.ts` | CRÉER | A4 |
| `src/commercial-group/commercial-group.service.ts` | MODIFIER | A5, A6 |
| `src/commercial-group/commercial-group.controller.ts` | MODIFIER | A7 |
| `src/work-schedule/jobs/daily-reset.job.ts` | MODIFIER | A8 |
| `src/work-schedule/work-schedule.service.ts` | MODIFIER | B1 |
| `admin/src/app/lib/definitions.ts` | MODIFIER | C1 |
| `admin/src/app/lib/api.ts` | MODIFIER | C1 |
| `admin/src/app/components/groups/ScheduleConfigForm.tsx` | CRÉER | C2 |
| `admin/src/app/components/groups/GroupScheduleCalendar.tsx` | CRÉER | C3 |
| `admin/src/app/components/groups/GroupPresenceTable.tsx` | CRÉER | C4 |
| Page admin groupes | MODIFIER | C5 |
