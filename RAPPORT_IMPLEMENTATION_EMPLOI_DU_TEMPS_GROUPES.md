# Rapport d'implémentation — Emploi du temps des groupes commerciaux

**Date :** 2026-05-18  
**Scope :** Planification rotative des groupes + attribution d'appels liée au planning  
**Priorité :** P1

---

## 1. Contexte et état de l'existant

### Ce qui existe déjà
| Élément | Fichier | État |
|---------|---------|------|
| Entité `CommercialGroup` | `src/commercial-group/entities/commercial-group.entity.ts` | ✅ Existe (name, description, isActive) |
| Champ `group_id` sur Commercial | `src/whatsapp_commercial/entities/user.entity.ts` | ✅ Existe |
| Champ `is_working_today` | idem | ✅ Existe |
| CRUD groupes + membres | `src/commercial-group/` | ✅ Existe |
| `DailyResetJob` (reset is_working_today à minuit) | `src/work-schedule/jobs/daily-reset.job.ts` | ✅ Existe — à étendre |
| `WorkSchedule` (créneaux hebdo par jour) | `src/work-schedule/` | ✅ Existe — coexiste |
| `getActiveGroupIds(at)` | `WorkScheduleService` | ✅ Existe — à compléter |

### Ce qui manque
1. Contrainte "pas deux commerciaux du même poste dans un groupe"
2. Config de rotation sur `CommercialGroup` (`workDaysCount`, `firstWorkDay`)
3. Table `group_schedule_day` — calendrier généré sur 3 mois
4. Endpoint de génération de planning
5. Cron qui active/désactive `is_working_today` selon le planning
6. UI admin : formulaire config + bouton "Générer 3 mois" + vue calendrier

---

## 2. Règles métier

### 2.1 Contraintes de groupe
- Un commercial appartient à **un seul groupe** (déjà garanti par la FK `group_id`)
- Un groupe ne peut pas contenir deux commerciaux ayant le **même poste** → contrainte à ajouter dans `CommercialGroupService.addMember()`

### 2.2 Rotation des jours de travail
- Chaque groupe a un paramètre `workDaysCount` (entier ≥ 1, défaut = 2)
- Le cycle est : **N jours de travail → N jours de repos → N jours de travail...**
- Le paramètre `firstWorkDay` est la date du **premier jour de travail** du groupe (défini par l'admin)
- Le planning est généré sur **3 mois glissants** à partir de la date de génération
- La génération écrase tout planning existant pour ce groupe sur la période

### 2.3 Heures de travail
- Plage fixe : **06:00 → 20:00, du lundi au dimanche** (7 jours sur 7)
- `is_working_today` = `true` uniquement si : le jour est planifié comme "work" dans le calendrier du groupe

### 2.4 Lien avec l'attribution d'appels
- `OrderCallSyncService` utilise déjà `WorkScheduleService.getActiveGroupIds(at)` pour filtrer les groupes actifs
- Cette méthode sera complétée : en plus du filtre horaire existant, elle vérifie `group_schedule_day` pour savoir si le groupe est en jour de travail ce jour-là
- Seuls les commerciaux dont `is_working_today = true` reçoivent des appels

---

## 3. Schéma de base de données

### 3.1 Modification de `commercial_group`

**Migration : `AddScheduleConfigToGroup1779062400001`**

```sql
ALTER TABLE commercial_group
  ADD COLUMN work_days_count INT NOT NULL DEFAULT 2 COMMENT 'Jours consécutifs travaillés',
  ADD COLUMN first_work_day DATE NULL DEFAULT NULL COMMENT 'Premier jour de travail du groupe';
```

### 3.2 Nouvelle table `group_schedule_day`

**Migration : `CreateGroupScheduleDay1779062400002`**

```sql
CREATE TABLE group_schedule_day (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  group_id     CHAR(36)     NOT NULL,
  date         DATE         NOT NULL,
  is_work_day  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY UQ_group_schedule_day (group_id, date),
  INDEX IDX_group_schedule_date (date),
  INDEX IDX_group_schedule_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Pas de FK contrainte** vers `commercial_group` pour éviter les blocages en cascade — intégrité assurée applicativement.

---

## 4. Entités TypeORM

### 4.1 Mise à jour `CommercialGroup`

```typescript
// Ajouter dans commercial-group.entity.ts
@Column({ name: 'work_days_count', type: 'int', default: 2 })
workDaysCount: number;

@Column({ name: 'first_work_day', type: 'date', nullable: true, default: null })
firstWorkDay: string | null;  // format 'YYYY-MM-DD'
```

### 4.2 Nouvelle entité `GroupScheduleDay`

**Fichier :** `src/commercial-group/entities/group-schedule-day.entity.ts`

```typescript
@Entity('group_schedule_day')
@Index('UQ_group_schedule_day', ['groupId', 'date'], { unique: true })
@Index('IDX_group_schedule_date', ['date'])
export class GroupScheduleDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'group_id', type: 'char', length: 36 })
  groupId: string;

  @Column({ name: 'date', type: 'date' })
  date: string;  // 'YYYY-MM-DD'

  @Column({ name: 'is_work_day', type: 'boolean', default: false })
  isWorkDay: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

---

## 5. Backend — Services

### 5.1 Algorithme de génération du planning

**Logique pure, sans dépendance framework :**

```
ENTRÉES: firstWorkDay (Date), workDaysCount (int), startDate (Date), endDate (Date)

POUR chaque jour j entre startDate et endDate :
  delta = nombre de jours calendaires entre firstWorkDay et j
  position = delta % (workDaysCount * 2)
  isWorkDay = (position < workDaysCount)   // 0..N-1 = travail, N..2N-1 = repos
  ÉCRIRE GroupScheduleDay { groupId, date: j, isWorkDay }
```

**Exemple avec workDaysCount = 2, firstWorkDay = lundi 19/05 :**
```
19/05 (lun) delta=0 pos=0 → TRAVAIL ✓
20/05 (mar) delta=1 pos=1 → TRAVAIL ✓
21/05 (mer) delta=2 pos=2 → REPOS
22/05 (jeu) delta=3 pos=3 → REPOS
23/05 (ven) delta=4 pos=0 → TRAVAIL ✓
24/05 (sam) delta=5 pos=1 → TRAVAIL ✓
25/05 (dim) delta=6 pos=2 → REPOS
26/05 (lun) delta=7 pos=3 → REPOS
27/05 (mar) delta=8 pos=0 → TRAVAIL ✓
```

### 5.2 Nouveau service `GroupScheduleService`

**Fichier :** `src/commercial-group/group-schedule.service.ts`

| Méthode | Description |
|---------|-------------|
| `generateForGroup(groupId, months?)` | Génère `months` mois (défaut 3) en UPSERT, retourne le nombre de jours créés |
| `generateForAllGroups(months?)` | Lance `generateForGroup` sur tous les groupes avec config |
| `isWorkDayForGroup(groupId, date)` | Lit `group_schedule_day` pour savoir si c'est un jour travaillé |
| `getTodayWorkingGroupIds()` | Retourne les `group_id` dont aujourd'hui est un jour de travail (7j/7) |
| `getCalendarForGroup(groupId, from, to)` | Retourne la liste de jours avec is_work_day pour l'affichage UI |

### 5.3 Mise à jour `CommercialGroupService`

#### Contrainte poste unique dans un groupe

Dans `addMember(groupId, commercialId)` :

```typescript
// Récupérer le poste du candidat
const candidate = await this.commercialRepo.findOne({
  where: { id: commercialId }, relations: ['poste']
});
if (candidate?.poste) {
  // Vérifier si un autre membre du groupe a le même poste
  const conflict = await this.commercialRepo.findOne({
    where: { groupId, poste: { id: candidate.poste.id } }
  });
  if (conflict) {
    throw new ConflictException(
      `Le groupe contient déjà un commercial sur le poste ${candidate.poste.name}`
    );
  }
}
```

#### Nouvelles méthodes

| Méthode | Description |
|---------|-------------|
| `setScheduleConfig(id, dto)` | Met à jour `workDaysCount` + `firstWorkDay` |
| `generateSchedule(id, months?)` | Délègue à `GroupScheduleService.generateForGroup()` |
| `getSchedule(id, from?, to?)` | Retourne le calendrier pour l'UI |

### 5.4 Mise à jour `DailyResetJob`

**Fichier :** `src/work-schedule/jobs/daily-reset.job.ts`

Le job actuel remet tout le monde à `false` à minuit. Il doit maintenant :

1. Récupérer les `group_id` dont aujourd'hui est un jour de travail (`GroupScheduleService.getTodayWorkingGroupIds()`)
2. Mettre `isWorkingToday = true` pour tous les commerciaux de ces groupes
3. Mettre `isWorkingToday = false` pour les autres

```typescript
@Cron('0 0 * * *', { timeZone: process.env.TZ ?? 'Africa/Douala' })
async handleDailyReset(): Promise<void> {
  const workingGroupIds = await this.groupScheduleService.getTodayWorkingGroupIds();

  // Activer les commerciaux des groupes en travail aujourd'hui
  if (workingGroupIds.length > 0) {
    await this.commercialRepo.update(
      { groupId: In(workingGroupIds), deletedAt: IsNull() },
      { isWorkingToday: true, workingTodaySince: new Date() }
    );
  }

  // Désactiver tous les autres (y compris commerciaux sans groupe)
  await this.commercialRepo.update(
    { groupId: workingGroupIds.length > 0 ? Not(In(workingGroupIds)) : Not(IsNull()) },
    { isWorkingToday: false, workingTodaySince: null }
  );

  // Commerciaux sans groupe → toujours désactivés (ou à configurer séparément)
  if (workingGroupIds.length > 0) {
    await this.commercialRepo.update(
      { groupId: IsNull(), deletedAt: IsNull() },
      { isWorkingToday: false, workingTodaySince: null }
    );
  }
}
```

> **Note :** Le cron tourne tous les jours (`0 0 * * *`) car les groupes peuvent travailler 7j/7 selon leur planning rotatif.

### 5.5 Mise à jour `WorkScheduleService.getActiveGroupIds()`

En complément du filtre horaire existant, filtrer les groupes dont aujourd'hui est un `is_work_day` dans `group_schedule_day` :

```typescript
async getActiveGroupIds(at: Date): Promise<string[]> {
  // 1. Filtre horaire existant (day-of-week + heures)
  const scheduleGroupIds = await this._existingHourlyFilter(at);

  // 2. Filtre planning rotatif : groupes dont aujourd'hui est jour travaillé
  const todayStr = at.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const workDays = await this.groupScheduleDayRepo.find({
    where: { date: todayStr, isWorkDay: true },
    select: ['groupId'],
  });
  const rotatingGroupIds = new Set(workDays.map((d) => d.groupId));

  // Un groupe est actif si : il passe le filtre horaire ET c'est son jour de travail
  // (Si un groupe n'a pas de planning rotatif généré, on l'inclut par défaut)
  return scheduleGroupIds.filter((gid) => {
    if (!rotatingGroupIds.has(gid) && workDays.length > 0) return false; // planning généré → filtrer
    return true;
  });
}
```

---

## 6. Endpoints backend

### 6.1 Nouveaux endpoints sur `/commercial-groups`

| Méthode | URL | Guard | Description |
|---------|-----|-------|-------------|
| `PATCH` | `/commercial-groups/:id/schedule-config` | AdminGuard | Définir `workDaysCount` + `firstWorkDay` |
| `POST` | `/commercial-groups/:id/schedule/generate` | AdminGuard | Générer le planning 3 mois (body: `{ months?: number }`) |
| `GET` | `/commercial-groups/:id/schedule` | AdminGuard | Lire le planning généré (query: `from`, `to`) |
| `POST` | `/commercial-groups/schedule/generate-all` | AdminGuard | Générer pour tous les groupes |

### 6.2 DTOs

```typescript
// PATCH /commercial-groups/:id/schedule-config
class ScheduleConfigDto {
  @IsInt() @Min(1) @Max(14)
  workDaysCount: number;           // ex: 2 ou 3

  @IsDateString()
  firstWorkDay: string;            // 'YYYY-MM-DD'
}

// Réponse GET /commercial-groups/:id/schedule
interface GroupScheduleDay {
  date: string;        // 'YYYY-MM-DD'
  isWorkDay: boolean;
  dayOfWeek: number;   // 0=dim, 1=lun... 6=sam
}
```

---

## 7. Frontend admin

### 7.1 Page existante `/commercial-groups` — extensions

#### Section "Emploi du temps" par groupe (sous la liste des membres)

```
┌─────────────────────────────────────────────────────────────────┐
│ Groupe A — Emploi du temps                                      │
├─────────────────────────────────────────────────────────────────┤
│ Rythme : [2] jours de travail  Premier jour : [19/05/2026 ▼]   │
│                                                                  │
│ [Enregistrer la config]  [Générer 3 mois ▶]                    │
├─────────────────────────────────────────────────────────────────┤
│ Mai 2026                                                        │
│  Lu  Ma  Me  Je  Ve  Sa  Di                                     │
│       .   .  [T] [T] [T] [T]                                    │
│   R   R  [T] [T] [T] [T]  R                                    │
│   R  [T] [T] [T] [T]  R   R                                    │
│  [T] [T]  ...                                                   │
│  [T] = jour travaillé (06h-20h)   R = repos   . = passé        │
└─────────────────────────────────────────────────────────────────┘
```

#### Composants à créer/modifier

| Composant | Fichier admin | Rôle |
|-----------|---------------|------|
| `ScheduleConfigForm` | `admin/src/app/components/groups/ScheduleConfigForm.tsx` | Formulaire rythme + firstWorkDay |
| `GroupScheduleCalendar` | `admin/src/app/components/groups/GroupScheduleCalendar.tsx` | Affichage 3 mois calendrier |
| Mise à jour page groupes | `admin/src/app/groups/page.tsx` | Intégrer les deux composants |

### 7.2 Vue globale "Qui travaille aujourd'hui ?"

Nouvelle section dans le dashboard admin ou dans la page groupes :

```
┌─────────────────────────────────────────────────────────────────┐
│ Présence du 19/05/2026 (lundi)                                  │
├──────────────────┬──────────────────┬───────────────────────────┤
│ Groupe           │ Statut           │ Commerciaux               │
├──────────────────┼──────────────────┼───────────────────────────┤
│ Groupe A         │ ✅ En service    │ Marie D., Paul K.          │
│ Groupe B         │ 💤 Repos         │ —                          │
│ Groupe C         │ ✅ En service    │ Fatou S., Jean M.          │
└──────────────────┴──────────────────┴───────────────────────────┘
```

### 7.3 Appels API admin à créer

Dans `admin/src/app/lib/api.ts` :

```typescript
// Config planning
patchGroupScheduleConfig(id, dto: { workDaysCount, firstWorkDay })

// Générer
generateGroupSchedule(id, months?: number)
generateAllGroupSchedules()

// Lire calendrier
getGroupSchedule(id, from?, to?): GroupScheduleDay[]
```

---

## 8. Migrations (dans l'ordre)

| # | Classe | Timestamp | Description |
|---|--------|-----------|-------------|
| 1 | `AddScheduleConfigToGroup1779062400001` | `1779062400001` | Colonnes `work_days_count` + `first_work_day` sur `commercial_group` |
| 2 | `CreateGroupScheduleDay1779062400002` | `1779062400002` | Table `group_schedule_day` |

---

## 9. Fichiers à créer / modifier

### Backend

| Action | Fichier |
|--------|---------|
| CRÉER | `src/commercial-group/entities/group-schedule-day.entity.ts` |
| CRÉER | `src/commercial-group/group-schedule.service.ts` |
| CRÉER | `src/commercial-group/group-schedule.service.spec.ts` |
| MODIFIER | `src/commercial-group/entities/commercial-group.entity.ts` (+ 2 colonnes) |
| MODIFIER | `src/commercial-group/commercial-group.service.ts` (contrainte poste + nouvelles méthodes) |
| MODIFIER | `src/commercial-group/commercial-group.controller.ts` (3 nouveaux endpoints) |
| MODIFIER | `src/commercial-group/commercial-group.module.ts` (enregistrer GroupScheduleDay repo) |
| MODIFIER | `src/work-schedule/jobs/daily-reset.job.ts` (activer/désactiver selon planning) |
| MODIFIER | `src/work-schedule/work-schedule.service.ts` (getActiveGroupIds + filtre rotatif) |
| CRÉER | `src/db/migrations/AddScheduleConfigToGroup1779062400001.ts` |
| CRÉER | `src/db/migrations/CreateGroupScheduleDay1779062400002.ts` |

### Frontend admin

| Action | Fichier |
|--------|---------|
| CRÉER | `admin/src/app/components/groups/ScheduleConfigForm.tsx` |
| CRÉER | `admin/src/app/components/groups/GroupScheduleCalendar.tsx` |
| CRÉER | `admin/src/app/components/groups/GroupPresenceTable.tsx` |
| MODIFIER | `admin/src/app/lib/api.ts` (3 nouvelles fonctions) |
| MODIFIER | `admin/src/app/lib/definitions.ts` (types GroupScheduleDay, ScheduleConfigDto) |
| MODIFIER | `admin/src/app/groups/page.tsx` (ou composant parent des groupes) |

---

## 10. Plan de développement par sprint

### Sprint A — Backend core (P0)
1. Migrations 1 et 2
2. Entité `GroupScheduleDay` + mise à jour entité `CommercialGroup`
3. `GroupScheduleService` avec algorithme de génération + tests unitaires
4. Contrainte poste unique dans `addMember()`
5. Endpoints `PATCH /:id/schedule-config` + `POST /:id/schedule/generate` + `GET /:id/schedule`
6. Mise à jour `DailyResetJob`

### Sprint B — Intégration attribution (P1)
7. Mise à jour `getActiveGroupIds()` avec filtre `group_schedule_day`
8. Endpoint `POST /schedule/generate-all`
9. Tests d'intégration (rotation, attribution appels)

### Sprint C — UI admin (P1)
10. `ScheduleConfigForm` + `GroupScheduleCalendar`
11. `GroupPresenceTable`
12. Intégration dans la page groupes

---

## 11. Points d'attention

| Risque | Mitigation |
|--------|------------|
| Génération coûteuse (3 mois × N groupes) | Exécuter en arrière-plan (BullMQ ou Promise non-bloquante), retourner HTTP 202 |
| Race condition DailyResetJob si groupe sans `firstWorkDay` | Skip les groupes sans config dans `getTodayWorkingGroupIds()` |
| Régénération sur une période couvrant le passé | Interdire ou avertir si `firstWorkDay` < aujourd'hui − 7j |
| `work_schedule` (hebdo) et `group_schedule_day` (rotatif) coexistent | Un groupe peut avoir les deux — `getActiveGroupIds()` applique l'intersection (les deux conditions doivent être vraies) |
| Commercial sans groupe | `isWorkingToday` peut être géré manuellement via `PATCH /users/:id/working-today` existant |
