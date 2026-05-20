# Plan d'amélioration — Planning : Remplacements & Absences

**Date :** 2026-05-20  
**Basé sur :** RAPPORT_PLANNING_REMPLACEMENTS_ABSENCES.md  
**Exclusions :** Notifications (4.4) · Workflow d'approbation

---

## Vue d'ensemble

```
Sprint 1 (P0) ── Stabilité opérationnelle
  US-1  Cron auto-régénération calendrier rotation
  US-2  Alerte admin calendrier expirant

Sprint 2 (P1) ── Fonctionnalités manquantes critiques
  US-3  Absences sur plage de dates
  US-4  Vue calendrier mensuelle admin

Sprint 3 (P2) ── Confort et fiabilité
  US-5  Historique des modifications
  US-6  Gestion des demi-journées
  US-7  Tableau de bord absences mensuel
  US-8  Self-service commercial (déclaration d'absence)
```

---

## Sprint 1 — Stabilité opérationnelle (P0)

### US-1 · Cron d'auto-régénération du calendrier de rotation

**Problème :** Si l'admin oublie de régénérer le calendrier, le planning de rotation expire silencieusement et tous les commerciaux apparaissent absents.

**Objectif :** Régénérer automatiquement les 3 prochains mois de calendrier le 1er de chaque mois, pour chaque groupe actif.

#### Backend

**Fichier à créer :** `src/commercial-groups/jobs/calendar-regen.job.ts`

```ts
@Injectable()
export class CalendarRegenJob {
  constructor(private readonly groupScheduleService: GroupScheduleService) {}

  @Cron('0 1 1 * *')  // 01:00 le 1er de chaque mois
  async regenerateAll(): Promise<void> {
    const groups = await this.groupScheduleService.getAllActiveGroups();
    for (const group of groups) {
      await this.groupScheduleService.generateForGroup(group.id, 3); // 3 mois
    }
  }
}
```

**Fichier modifié :** `src/commercial-groups/commercial-groups.module.ts`
- Ajouter `CalendarRegenJob` dans `providers`
- Importer `ScheduleModule.forRoot()` si pas déjà présent

**Aucune migration requise.**

---

### US-2 · Alerte admin si groupe sans calendrier valide à J+7

**Problème :** Aucun signal d'alerte quand le calendrier d'un groupe expire dans moins de 7 jours.

**Objectif :** Exposer un endpoint (et un indicateur dans l'admin) qui liste les groupes dont le calendrier expire dans ≤ 7 jours.

#### Backend

**Fichier modifié :** `src/commercial-groups/group-schedule.service.ts`

Ajouter :
```ts
async getGroupsWithExpiringCalendar(withinDays = 7): Promise<{ groupId: string; groupName: string; lastDay: string }[]> {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + withinDays);
  // SELECT groupId, MAX(date) FROM group_schedule_day
  // GROUP BY groupId HAVING MAX(date) <= horizon
}
```

**Fichier modifié :** `src/commercial-groups/commercial-groups.controller.ts`

Ajouter :
```ts
@Get('planning/calendar-health')
@UseGuards(AdminGuard)
getCalendarHealth() {
  return this.groupScheduleService.getGroupsWithExpiringCalendar(7);
}
```

#### Admin frontend

**Fichier modifié :** `admin/src/app/planning/page.tsx` (ou composant existant)

Ajouter un bandeau d'alerte rouge si `getCalendarHealth()` retourne des groupes :
```tsx
{expiringGroups.length > 0 && (
  <Alert variant="destructive">
    {expiringGroups.length} groupe(s) sans calendrier valide dans 7 jours :
    {expiringGroups.map(g => g.groupName).join(', ')}
  </Alert>
)}
```

**Aucune migration requise.**

---

## Sprint 2 — Fonctionnalités manquantes critiques (P1)

### US-3 · Absences sur plage de dates

**Problème :** Pour poser 5 jours d'absence, il faut créer 5 entrées manuellement.

**Objectif :** Accepter `dateStart` + `dateEnd` dans le DTO d'absence et générer les entrées jour par jour en transaction.

#### Backend

**Fichier modifié :** `src/commercial-groups/dto/create-absence.dto.ts`

```ts
export class CreateAbsenceDto {
  @IsUUID()    commercialId: string;
  @IsDateString() dateStart: string;   // YYYY-MM-DD
  @IsDateString() dateEnd: string;     // YYYY-MM-DD (= dateStart pour 1 jour)
  @IsString()  @IsOptional() reason?: string;
  @IsString()  declaredBy: string;
}
```

**Fichier modifié :** `src/commercial-groups/commercial-planning.service.ts`

Méthode `createAbsence()` — remplacer l'insert unique par une boucle en transaction :
```ts
async createAbsence(dto: CreateAbsenceDto): Promise<CommercialPlanning[]> {
  const days = eachDayInRange(dto.dateStart, dto.dateEnd); // helper local
  return this.dataSource.transaction(async (manager) => {
    const results: CommercialPlanning[] = [];
    for (const date of days) {
      // Vérifier conflit (commercialId, date) avant insert
      const existing = await manager.findOne(CommercialPlanning, {
        where: { commercialId: dto.commercialId, date },
      });
      if (existing) continue; // skip les jours déjà couverts
      const entry = manager.create(CommercialPlanning, {
        commercialId: dto.commercialId,
        type: 'absence',
        date,
        reason: dto.reason,
        declaredBy: dto.declaredBy,
      });
      results.push(await manager.save(entry));
    }
    // Effet immédiat si aujourd'hui est dans la plage
    const today = new Date().toISOString().slice(0, 10);
    if (days.includes(today)) {
      await manager.update(WhatsappCommercial, dto.commercialId, { isWorkingToday: false });
    }
    return results;
  });
}
```

**Aucune migration requise** (la table `commercial_planning` accueille déjà plusieurs lignes par commercial sur des dates différentes — la contrainte UNIQUE est sur `(commercialId, date)`, les jours en doublon sont simplement ignorés).

#### Admin frontend

**Fichier modifié :** modal/formulaire de création d'absence dans `admin/`

Remplacer le champ `date` unique par deux champs `dateStart` / `dateEnd` avec un date-picker de plage.

---

### US-4 · Vue calendrier mensuelle admin

**Problème :** L'admin ne voit les plannings que pour un jour donné (`getPlanningByDate`). Aucune vue du mois entier.

**Objectif :** Endpoint et page admin listant toutes les absences/remplacements du mois, groupés par commercial.

#### Backend

**Fichier modifié :** `src/commercial-groups/commercial-planning.service.ts`

Ajouter :
```ts
async getPlanningForMonth(year: number, month: number): Promise<CommercialPlanning[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end   = lastDayOfMonth(year, month); // helper local
  return this.planningRepo.find({
    where: { date: Between(start, end) },
    relations: ['commercial', 'linkedCommercial'],
    order: { date: 'ASC', commercialId: 'ASC' },
  });
}
```

**Fichier modifié :** `src/commercial-groups/commercial-groups.controller.ts`

Ajouter :
```ts
@Get('planning/month/:year/:month')
@UseGuards(AdminGuard)
getPlanningMonth(
  @Param('year', ParseIntPipe)  year: number,
  @Param('month', ParseIntPipe) month: number,
) {
  return this.commercialPlanningService.getPlanningForMonth(year, month);
}
```

#### Admin frontend

**Fichier à créer :** `admin/src/app/planning/CalendarMonthView.tsx`

Grille 7 colonnes × N semaines. Pour chaque jour :
- Badge vert = exceptionnel (remplaçant)
- Badge rouge = absence
- Badge gris = jour de repos (rotation)

Navigation mois précédent / suivant. Filtre par groupe.

**Aucune migration requise.**

---

## Sprint 3 — Confort et fiabilité (P2)

### US-5 · Historique des modifications

**Problème :** Aucune traçabilité : on ne sait pas qui a créé/supprimé un override ni quand.

**Objectif :** Enregistrer chaque création et suppression de `CommercialPlanning` dans une table d'audit.

#### Migration

**Fichier à créer :** `src/database/migrations/TIMESTAMP_add_planning_audit.ts`

```sql
CREATE TABLE commercial_planning_audit (
  id           VARCHAR(36) NOT NULL PRIMARY KEY,
  planning_id  VARCHAR(36),                       -- NULL si supprimé
  action       ENUM('created', 'deleted') NOT NULL,
  commercial_id VARCHAR(36) NOT NULL,
  type         ENUM('absence', 'exceptional') NOT NULL,
  date         DATE NOT NULL,
  reason       VARCHAR(255),
  declared_by  VARCHAR(36),
  performed_by VARCHAR(36),                       -- admin qui a fait l'action
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Backend

**Fichier à créer :** `src/commercial-groups/entities/commercial-planning-audit.entity.ts`

**Fichier modifié :** `src/commercial-groups/commercial-planning.service.ts`

- Dans `createAbsence()` et `createReplacement()` : insérer une ligne audit `action='created'`
- Dans `remove()` : insérer une ligne audit `action='deleted'`

**Fichier modifié :** `src/commercial-groups/commercial-groups.controller.ts`

Ajouter :
```ts
@Get('planning/audit')
@UseGuards(AdminGuard)
getAudit(
  @Query('commercialId') commercialId?: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  return this.commercialPlanningService.getAudit({ commercialId, from, to });
}
```

---

### US-6 · Gestion des demi-journées

**Problème :** Le système est binaire (`isWorkingToday = true/false`). Pas de demi-journées.

**Objectif :** Permettre d'indiquer `morning` | `afternoon` | `full` dans un override.

#### Migration

**Fichier à créer :** `src/database/migrations/TIMESTAMP_add_planning_timeslot.ts`

```sql
ALTER TABLE commercial_planning
  ADD COLUMN time_slot ENUM('full', 'morning', 'afternoon') NOT NULL DEFAULT 'full'
  AFTER type;
```

#### Backend

**Fichier modifié :** `src/commercial-groups/dto/create-absence.dto.ts`

```ts
@IsEnum(['full', 'morning', 'afternoon'])
@IsOptional()
timeSlot?: 'full' | 'morning' | 'afternoon';  // défaut : 'full'
```

**Fichier modifié :** `src/commercial-groups/entities/commercial-planning.entity.ts`

```ts
@Column({ type: 'enum', enum: ['full', 'morning', 'afternoon'], default: 'full' })
timeSlot: 'full' | 'morning' | 'afternoon';
```

**Fichier modifié :** `src/commercial-groups/jobs/daily-reset.job.ts`

Ajuster la logique `DailyResetJob` : une absence `morning` ne doit pas empêcher de travailler l'après-midi. La logique de `isWorkingToday` reste globale (jour entier) — la demi-journée est une information supplémentaire visible dans le planning mais ne modifie pas le flag global sauf si `timeSlot = 'full'`.

> **Note :** Pour que `isWorkingToday` devienne granulaire (matin/après-midi), il faudrait remplacer ce booléen par un enum — hors scope de cette US, à évaluer en US-6b.

---

### US-7 · Tableau de bord absences mensuel

**Problème :** Aucune vue synthétique du nombre de jours d'absence par commercial sur le mois.

**Objectif :** Page admin affichant, pour chaque commercial, le total de jours d'absence sur la période sélectionnée.

#### Backend

**Fichier modifié :** `src/commercial-groups/commercial-planning.service.ts`

Ajouter :
```ts
async getAbsenceSummary(year: number, month: number): Promise<{ commercial: string; totalDays: number }[]> {
  // SELECT commercialId, COUNT(*) as totalDays
  // FROM commercial_planning
  // WHERE type = 'absence' AND date BETWEEN start AND end
  // GROUP BY commercialId
}
```

**Fichier modifié :** `src/commercial-groups/commercial-groups.controller.ts`

```ts
@Get('planning/summary/:year/:month')
@UseGuards(AdminGuard)
getAbsenceSummary(
  @Param('year', ParseIntPipe)  year: number,
  @Param('month', ParseIntPipe) month: number,
) {
  return this.commercialPlanningService.getAbsenceSummary(year, month);
}
```

#### Admin frontend

**Fichier à créer :** `admin/src/app/planning/AbsenceSummaryTable.tsx`

Tableau : `Commercial | Jours d'absence | Jours de remplacement | Solde`  
Export CSV optionnel.

---

### US-8 · Self-service commercial (déclaration d'absence)

**Problème :** Seul l'admin peut déclarer une absence. Le commercial doit passer par l'admin pour chaque absence.

**Objectif :** Le commercial peut déclarer sa propre absence depuis l'interface front. L'absence est créée directement (sans workflow d'approbation).

#### Backend

**Fichier modifié :** `src/commercial-groups/commercial-groups.controller.ts`

Ajouter un endpoint protégé par `AuthGuard('jwt')` (commercial authentifié) :
```ts
@Post('planning/self/absence')
@UseGuards(AuthGuard('jwt'))
declareSelfAbsence(
  @Request() req: { user: JwtUser },
  @Body() dto: CreateSelfAbsenceDto,
) {
  return this.commercialPlanningService.createAbsence({
    ...dto,
    commercialId: req.user.userId,
    declaredBy:   req.user.userId,
  });
}
```

**Fichier à créer :** `src/commercial-groups/dto/create-self-absence.dto.ts`

```ts
export class CreateSelfAbsenceDto {
  @IsDateString() dateStart: string;
  @IsDateString() dateEnd: string;
  @IsString() @IsOptional() reason?: string;
}
```

> **Contrainte :** Le commercial ne peut déclarer une absence que pour lui-même (`commercialId` = son propre id JWT). Aucune validation hiérarchique n'est implémentée dans cette version.

#### Frontend commercial

**Fichier modifié :** composant de profil ou menu dans `front/src/`

Ajouter un bouton "Déclarer une absence" ouvrant un modal avec les champs `dateStart`, `dateEnd`, `reason`.

---

## Récapitulatif des US

| # | US | Sprint | Priorité | Effort | Migration |
|---|-----|--------|----------|--------|-----------|
| US-1 | Cron auto-régénération calendrier | 1 | P0 | Faible | Non |
| US-2 | Alerte calendrier expirant | 1 | P0 | Faible | Non |
| US-3 | Absences sur plage de dates | 2 | P1 | Moyen | Non |
| US-4 | Vue calendrier mensuelle admin | 2 | P1 | Moyen | Non |
| US-5 | Historique des modifications | 3 | P2 | Faible | Oui |
| US-6 | Demi-journées | 3 | P2 | Moyen | Oui |
| US-7 | Tableau de bord absences | 3 | P2 | Moyen | Non |
| US-8 | Self-service commercial | 3 | P2 | Moyen | Non |

---

## Dépendances entre US

```
US-1 ──────────────── indépendant
US-2 ──────────────── indépendant
US-3 ──────────────── indépendant
US-4 ──────────────── indépendant (utilise l'endpoint existant getPlanningByDate comme base)
US-5 ── après US-3   (l'audit doit couvrir les absences multi-jours dès le départ)
US-6 ── après US-5   (la demi-journée doit être tracée dans l'audit)
US-7 ── après US-3   (le total jours est fiable seulement si les absences multi-jours sont supportées)
US-8 ── après US-3   (réutilise createAbsence() avec plage de dates)
```

---

## Fichiers impactés (résumé)

### Backend `message_whatsapp/src/`
- `commercial-groups/jobs/calendar-regen.job.ts` ← **créer**
- `commercial-groups/commercial-groups.module.ts` ← modifier
- `commercial-groups/group-schedule.service.ts` ← modifier (US-2)
- `commercial-groups/commercial-planning.service.ts` ← modifier (US-3, US-5, US-7, US-8)
- `commercial-groups/commercial-groups.controller.ts` ← modifier (US-2, US-3, US-4, US-5, US-7, US-8)
- `commercial-groups/dto/create-absence.dto.ts` ← modifier (US-3, US-6)
- `commercial-groups/dto/create-self-absence.dto.ts` ← **créer** (US-8)
- `commercial-groups/entities/commercial-planning.entity.ts` ← modifier (US-6)
- `commercial-groups/entities/commercial-planning-audit.entity.ts` ← **créer** (US-5)
- `database/migrations/TIMESTAMP_add_planning_audit.ts` ← **créer** (US-5)
- `database/migrations/TIMESTAMP_add_planning_timeslot.ts` ← **créer** (US-6)

### Admin `admin/src/`
- `app/planning/page.tsx` ← modifier (US-2, US-4, US-7)
- `app/planning/CalendarMonthView.tsx` ← **créer** (US-4)
- `app/planning/AbsenceSummaryTable.tsx` ← **créer** (US-7)

### Frontend commercial `front/src/`
- Composant profil / menu ← modifier (US-8)
