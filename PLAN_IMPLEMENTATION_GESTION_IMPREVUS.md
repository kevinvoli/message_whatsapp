# Plan d'implémentation — Gestion des imprévus de planning
> Basé sur `PROPOSITIONS_GESTION_IMPRÉVUS_PLANNING.md` + audit codebase du 2026-05-19  
> Migration timestamp de référence : **`1779148800`** (2026-05-19)

---

## Contexte technique

| Élément | Valeur |
|---|---|
| Dernière migration | `CreateGroupScheduleDay1779062400002` |
| Prochaine migration | `AddCommercialPlanning1779148800001` |
| DailyResetJob | `src/work-schedule/jobs/daily-reset.job.ts` |
| JwtStrategy | `src/auth/jwt.strategy.ts` |
| OrderCallSyncService | `src/order-call-sync/order-call-sync.service.ts` |
| CommercialGroup | `src/commercial-group/` |
| Entité commercial | `src/whatsapp_commercial/entities/user.entity.ts` |

---

## Phase 1 — Socle BDD + Entité + DailyResetJob
> **Prérequis :** aucun — peut démarrer immédiatement  
> **Effort :** Faible (~2h)

### T1.1 — Migration `AddCommercialPlanning1779148800001`

**Fichier à créer :** `message_whatsapp/src/database/migrations/AddCommercialPlanning1779148800001.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommercialPlanning1779148800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`commercial_planning\` (
        \`id\`                   CHAR(36)                          NOT NULL DEFAULT (UUID()),
        \`commercial_id\`        CHAR(36)                          NOT NULL,
        \`type\`                 ENUM('absence','exceptional')     NOT NULL,
        \`date\`                 DATE                              NOT NULL,
        \`linked_commercial_id\` CHAR(36)                          NULL,
        \`override_poste_id\`    CHAR(36)                          NULL,
        \`reason\`               VARCHAR(255)                      NULL,
        \`declared_by\`          VARCHAR(100)                      NULL,
        \`created_at\`           DATETIME                          NOT NULL DEFAULT NOW(),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_commercial_planning_date\` (\`commercial_id\`, \`date\`),
        INDEX \`IDX_commercial_planning_date\` (\`date\`),
        INDEX \`IDX_commercial_planning_type_date\` (\`type\`, \`date\`),
        CONSTRAINT \`FK_cp_commercial\`
          FOREIGN KEY (\`commercial_id\`) REFERENCES \`whatsapp_commercial\` (\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_cp_linked_commercial\`
          FOREIGN KEY (\`linked_commercial_id\`) REFERENCES \`whatsapp_commercial\` (\`id\`)
          ON DELETE SET NULL,
        CONSTRAINT \`FK_cp_override_poste\`
          FOREIGN KEY (\`override_poste_id\`) REFERENCES \`whatsapp_poste\` (\`id\`)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`commercial_planning\``);
  }
}
```

### T1.2 — Entité TypeORM `CommercialPlanning`

**Fichier à créer :** `message_whatsapp/src/commercial-group/entities/commercial-planning.entity.ts`

```typescript
import {
  Column, CreateDateColumn, Entity, Index,
  JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { WhatsappCommercial } from '../../whatsapp_commercial/entities/user.entity';
import { WhatsappPoste } from '../../whatsapp_poste/entities/poste.entity';

@Entity('commercial_planning')
@Unique(['commercialId', 'date'])
@Index(['date'])
@Index(['type', 'date'])
export class CommercialPlanning {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id' })
  commercialId: string;

  @ManyToOne(() => WhatsappCommercial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commercial_id' })
  commercial?: WhatsappCommercial;

  @Column({ type: 'enum', enum: ['absence', 'exceptional'] })
  type: 'absence' | 'exceptional';

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'linked_commercial_id', nullable: true })
  linkedCommercialId?: string | null;

  @ManyToOne(() => WhatsappCommercial, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linked_commercial_id' })
  linkedCommercial?: WhatsappCommercial | null;

  @Column({ name: 'override_poste_id', nullable: true })
  overridePosteId?: string | null;

  @ManyToOne(() => WhatsappPoste, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'override_poste_id' })
  overridePoste?: WhatsappPoste | null;

  @Column({ nullable: true })
  reason?: string | null;

  @Column({ name: 'declared_by', nullable: true })
  declaredBy?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### T1.3 — Modification `DailyResetJob`

**Fichier à modifier :** `message_whatsapp/src/work-schedule/jobs/daily-reset.job.ts`

Ajouter `@InjectRepository(CommercialPlanning)` et deux étapes après les étapes existantes :

```typescript
// Étape 4 — Absences du jour → forcer is_working_today = false
await this.commercialRepo
  .createQueryBuilder()
  .update(WhatsappCommercial)
  .set({ isWorkingToday: false, workingTodaySince: null })
  .where(`id IN (
    SELECT commercial_id FROM commercial_planning
    WHERE date = :today AND type = 'absence'
  )`, { today })
  .execute();

// Étape 5 — Exceptionnels du jour → forcer is_working_today = true
await this.commercialRepo
  .createQueryBuilder()
  .update(WhatsappCommercial)
  .set({ isWorkingToday: true, workingTodaySince: () => 'NOW()' })
  .where(`id IN (
    SELECT commercial_id FROM commercial_planning
    WHERE date = :today AND type = 'exceptional'
  )`, { today })
  .execute();
```

> `today` = date formatée `fr-CA` dans le fuseau `APP_TIMEZONE` (même pattern que `getTodayWorkingGroupIds()`).

---

## Phase 2 — Service + API backend
> **Prérequis :** T1.2 (entité)  
> **Effort :** Moyen (~4h)

### T2.1 — `CommercialPlanningService`

**Fichier à créer :** `message_whatsapp/src/commercial-group/commercial-planning.service.ts`

Méthodes à implémenter :

| Méthode | Description |
|---|---|
| `getTodayString()` | Date du jour dans `APP_TIMEZONE` (fr-CA) |
| `createAbsence(dto)` | Crée une ligne `type='absence'` — vérifie pas de conflit date/commercial |
| `createExceptional(dto)` | Crée une ligne `type='exceptional'` — idem |
| `createReplacement(dto)` | Transaction 2 lignes (C1=absence + C2=exceptional avec `overridePosteId=C1.poste.id`) |
| `findByDate(date)` | Retourne tous les overrides d'une date avec relations |
| `remove(id)` | Supprime 1 ligne, et sa ligne liée si remplacement |

**Validations dans `createReplacement()` :**
1. C1 doit avoir un `poste` — sinon `BadRequestException`
2. Pas de conflit `(commercial_id=C1, date)` déjà existant — sinon `ConflictException`
3. Pas de conflit `(commercial_id=C2, date)` — sinon `ConflictException`
4. Pas de doublon `override_poste_id = C1.poste.id` pour cette date — sinon `ConflictException('Ce poste a déjà un remplaçant désigné')`

### T2.2 — DTOs

**Fichier à créer :** `message_whatsapp/src/commercial-group/dto/create-planning.dto.ts`

```typescript
export class CreateAbsenceDto {
  commercialId: string;
  date: string; // YYYY-MM-DD
  reason?: string;
}

export class CreateExceptionalDto {
  commercialId: string;
  date: string;
  reason?: string;
}

export class CreateReplacementDto {
  replacedId: string;   // C1 (absent)
  replacerId: string;   // C2 (remplaçant)
  date: string;
  reason?: string;
}
```

### T2.3 — Endpoints dans `CommercialGroupController`

**Fichier à modifier :** `message_whatsapp/src/commercial-group/commercial-group.controller.ts`

Ajouter sous le bloc `/:id/members` :

```
POST   /commercial-groups/planning              → createAbsence ou createExceptional (champ type dans body)
POST   /commercial-groups/planning/replacement  → createReplacement
DELETE /commercial-groups/planning/:id          → removePlanning
GET    /commercial-groups/planning?date=...     → findByDate
```

### T2.4 — Enregistrement dans le module

**Fichier à modifier :** `message_whatsapp/src/commercial-group/commercial-group.module.ts`

- Ajouter `CommercialPlanning` dans `TypeOrmModule.forFeature([...])`
- Ajouter `CommercialPlanningService` dans `providers`
- Exporter `CommercialPlanningService` (nécessaire pour Phase 3)

---

## Phase 3 — JWT effectif + Enrichissement pool dispatch
> **Prérequis :** T1.2 (entité), T2.1 (service exporté)  
> **Effort :** Moyen (~3h)

### T3.1 — Modification `JwtStrategy.validate()`

**Fichier à modifier :** `message_whatsapp/src/auth/jwt.strategy.ts`

Injecter `@InjectRepository(CommercialPlanning)` et modifier `validate()` :

```typescript
async validate(payload: any) {
  const today = new Intl.DateTimeFormat('fr-CA', {
    timeZone: process.env['TZ'] ?? process.env['APP_TIMEZONE'] ?? 'Africa/Abidjan',
  }).format(new Date());

  const [commercial, planning] = await Promise.all([
    this.commercialRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'isWorkingToday'],
    }),
    this.planningRepo.findOne({
      where: { commercialId: payload.sub, date: today },
    }),
  ]);

  const effectivePosteId =
    planning?.type === 'exceptional' && planning.overridePosteId
      ? planning.overridePosteId
      : payload.posteId;

  return {
    userId:         payload.sub,
    email:          payload.email,
    posteId:        effectivePosteId,
    isWorkingToday: commercial?.isWorkingToday ?? false,
    absentToday:    planning?.type === 'absence',
    isReplacing:    planning?.type === 'exceptional' && !!planning.overridePosteId,
    replacingName:  null, // enrichi côté front si nécessaire
  };
}
```

> **Important :** `payload.posteId` est déjà dans le JWT (poste habituel). On ne modifie pas le JWT lui-même — on surcharge la valeur retournée par `validate()` à chaque requête authentifiée.

### T3.2 — Enrichissement pool `OrderCallSyncService`

**Fichier à modifier :** `message_whatsapp/src/order-call-sync/order-call-sync.service.ts`

Injecter `@InjectRepository(CommercialPlanning)`.

Dans `syncNewCalls()`, après la construction de `poolByPosteId` (ligne ~162-167), ajouter :

```typescript
// Injecter les remplaçants du jour dans le pool du poste remplacé
const todayStr = new Intl.DateTimeFormat('fr-CA', {
  timeZone: process.env['TZ'] ?? process.env['APP_TIMEZONE'] ?? 'Africa/Abidjan',
}).format(new Date());

const replacements = await this.planningRepo.find({
  where: { type: 'exceptional', date: todayStr },
});

for (const r of replacements) {
  if (!r.overridePosteId) continue;
  const replacer = allCommercials.find((c) => c.id === r.commercialId)
    ?? await this.commercialRepo.findOne({
      where: { id: r.commercialId, deletedAt: IsNull() },
      relations: ['poste'],
      select: { id: true, phone: true, lastConnectionAt: true, isWorkingToday: true, groupId: true, poste: { id: true } },
    });
  if (!replacer) continue;
  const pool = poolByPosteId.get(r.overridePosteId) ?? [];
  if (!pool.find((c) => c.id === replacer.id)) {
    pool.push(replacer);
    poolByPosteId.set(r.overridePosteId, pool);
  }
}
```

> `allCommercials` est le tableau chargé avant la boucle de construction de `poolByPosteId`. Si la variable s'appelle différemment dans le code réel, adapter.

---

## Phase 4 — UI Admin : Vue présence enrichie
> **Prérequis :** T2.2 (endpoints API)  
> **Effort :** Moyen (~4h)

### T4.1 — Appels API admin

**Fichier à modifier :** `admin/src/app/lib/api.ts`

Ajouter :
```typescript
export const getPlanningByDate = (date: string) =>
  fetch(`${API_URL}/commercial-groups/planning?date=${date}`, { credentials: 'include' });

export const createAbsence = (body: CreateAbsenceDto) =>
  fetch(`${API_URL}/commercial-groups/planning`, { method: 'POST', body: JSON.stringify(body), ... });

export const createReplacement = (body: CreateReplacementDto) =>
  fetch(`${API_URL}/commercial-groups/planning/replacement`, { method: 'POST', ... });

export const deletePlanning = (id: string) =>
  fetch(`${API_URL}/commercial-groups/planning/${id}`, { method: 'DELETE', ... });
```

**Fichier à modifier :** `admin/src/app/lib/definitions.ts`

Ajouter les types `CommercialPlanningDto`, `CreateAbsenceDto`, `CreateReplacementDto`.

### T4.2 — Page vue présence

**Fichier à créer :** `admin/src/app/commercial-groups/presence/page.tsx`

Tableau avec colonnes : Groupe | Commercial | Poste effectif | Statut | Action

**Badges à afficher :**

| Badge | Couleur Tailwind | Condition |
|---|---|---|
| En service | `bg-green-100 text-green-700` | `isWorkingToday=true`, pas d'override |
| Absent | `bg-orange-100 text-orange-700` | type=`absence`, pas de `linkedCommercialId` |
| Remplacé | `bg-orange-100 text-orange-700` | type=`absence` avec `linkedCommercialId` |
| Remplaçant | `bg-purple-100 text-purple-700` | type=`exceptional` avec `overridePosteId` |
| Exceptionnel | `bg-blue-100 text-blue-700` | type=`exceptional` sans `overridePosteId` |
| Repos | `bg-gray-100 text-gray-600` | `isWorkingToday=false`, pas d'override |

**Actions par ligne :**
- En service → bouton [Déclarer absent]
- Repos → bouton [Activer aujourd'hui]  
- Absent/Remplacé → bouton [×] (annuler)
- Remplaçant → texte "Remplace [prénom]"

**Formulaire remplacement (modal) :**
- Sélecteur "Commercial remplacé" (filtre sur ceux en service)
- Sélecteur "Remplaçant" (filtre sur ceux au repos / autre groupe)
- Date (défaut = aujourd'hui)
- Raison (optionnel)

---

## Phase 5 — Bannière front contextuelle
> **Prérequis :** T3.1 (JWT enrichi avec `absentToday` + `isReplacing`)  
> **Effort :** Faible (~1h)

### T5.1 — Composant bannière

**Fichier à modifier :** layout principal du front (probablement `front/src/app/layout.tsx` ou `front/src/components/Layout.tsx`)

```tsx
{!user.isWorkingToday && (
  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700">
    {user.absentToday
      ? 'Vous êtes déclaré absent aujourd\'hui. Aucun appel ne vous sera attribué.'
      : 'Vous n\'êtes pas en service aujourd\'hui. Aucun appel ne vous sera attribué.'
    }
  </div>
)}

{user.isWorkingToday && user.isReplacing && (
  <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 text-sm text-purple-700">
    Vous remplacez un collègue aujourd\'hui — vous gérez son poste et ses conversations.
  </div>
)}
```

> `user.absentToday` et `user.isReplacing` sont injectés par `JwtStrategy.validate()` (Phase 3).  
> Le front doit exposer ces champs dans le contexte d'authentification (AuthProvider ou équivalent).

---

## Phase 6 — WorkingDayGuard (optionnel / court terme)
> **Prérequis :** Phase 1 complète  
> **Effort :** Moyen (~2h) — **désactivé par défaut**

### T6.1 — Guard + flag SystemConfig

**Fichier à créer :** `message_whatsapp/src/auth/working-day.guard.ts`

```typescript
@Injectable()
export class WorkingDayGuard implements CanActivate {
  constructor(
    private readonly systemConfigService: SystemConfigService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const restrict = await this.systemConfigService.getBoolean(
      'RESTRICT_LOGIN_TO_WORKING_DAYS', false,
    );
    if (!restrict) return true;

    const req = ctx.switchToHttp().getRequest();
    const commercial = await this.commercialRepo.findOne({
      where: { id: req.user.userId },
      select: ['isWorkingToday'],
    });

    if (!commercial?.isWorkingToday) {
      throw new ForbiddenException(
        "Connexion non autorisée : ce n'est pas votre jour de travail.",
      );
    }
    return true;
  }
}
```

Clé SystemConfig à créer : `RESTRICT_LOGIN_TO_WORKING_DAYS` = `"false"` (par défaut).

---

## Ordre d'exécution et dépendances

```
Phase 1 ──────────────────────────────────── Pas de dépendances
  T1.1 Migration
  T1.2 Entité CommercialPlanning
  T1.3 DailyResetJob (étapes 4+5)

Phase 2 ──────────────────────────────────── Requiert T1.2
  T2.1 CommercialPlanningService
  T2.2 DTOs
  T2.3 Endpoints controller
  T2.4 Module registration

Phase 3 ──────────────────────────────────── Requiert T1.2 + T2.4
  T3.1 JwtStrategy.validate()
  T3.2 OrderCallSyncService pool enrichment

Phase 4 ──────────────────────────────────── Requiert T2.3 (API dispo)
  T4.1 API admin calls
  T4.2 Page vue présence

Phase 5 ──────────────────────────────────── Requiert T3.1 (JWT enrichi)
  T5.1 Bannière front contextuelle

Phase 6 ──────────────────────────────────── Requiert Phase 1 (optionnel)
  T6.1 WorkingDayGuard + SystemConfig flag
```

```
Dépendances critiques :
T1.2 → T2.1 → T2.4 → T3.1 → T5.1
                    → T3.2
              T2.3 → T4.1 → T4.2
```

---

## Récapitulatif des fichiers touchés

| Fichier | Action | Phase |
|---|---|---|
| `src/database/migrations/AddCommercialPlanning1779148800001.ts` | Créer | 1 |
| `src/commercial-group/entities/commercial-planning.entity.ts` | Créer | 1 |
| `src/work-schedule/jobs/daily-reset.job.ts` | Modifier (étapes 4+5) | 1 |
| `src/commercial-group/dto/create-planning.dto.ts` | Créer | 2 |
| `src/commercial-group/commercial-planning.service.ts` | Créer | 2 |
| `src/commercial-group/commercial-group.controller.ts` | Modifier (4 endpoints) | 2 |
| `src/commercial-group/commercial-group.module.ts` | Modifier (entity + service) | 2 |
| `src/auth/jwt.strategy.ts` | Modifier (validate enrichi) | 3 |
| `src/order-call-sync/order-call-sync.service.ts` | Modifier (pool enrichment) | 3 |
| `admin/src/app/lib/api.ts` | Modifier (4 appels) | 4 |
| `admin/src/app/lib/definitions.ts` | Modifier (nouveaux types) | 4 |
| `admin/src/app/commercial-groups/presence/page.tsx` | Créer | 4 |
| `front/src/app/layout.tsx` (ou Layout.tsx) | Modifier (bannière) | 5 |
| `src/auth/working-day.guard.ts` | Créer (optionnel) | 6 |

**Total : 14 fichiers** (8 créés, 6 modifiés)  
**Effort total estimé : ~16h** (phases 1-5) + ~2h optionnel (phase 6)

---

## Points d'attention

1. **Contrainte UNIQUE `(commercial_id, date)`** — un commercial ne peut pas être à la fois absent ET exceptionnel le même jour. La contrainte BDD le garantit.

2. **Conflit d'override** — avant tout remplacement, vérifier qu'aucun autre commercial n'a déjà `override_poste_id = poste_de_C1` pour la date cible.

3. **Fuseau horaire** — utiliser systématiquement `APP_TIMEZONE` (via `SystemConfigService` ou `process.env`) pour les calculs de date. Ne pas utiliser `new Date().toISOString()` qui retourne UTC.

4. **`override_poste_id` dans la migration** — les FK `FK_cp_override_poste` et `FK_cp_linked_commercial` avec `ON DELETE SET NULL` préservent l'intégrité si un poste ou commercial est supprimé.

5. **AuthProvider front** — vérifier que `absentToday` et `isReplacing` sont bien propagés depuis le payload JWT jusqu'au contexte React. Si l'AuthProvider ne relit pas le JWT à chaque requête, il faudra peut-être décoder le token côté front ou appeler un endpoint `/auth/me`.

6. **Ordre des étapes dans DailyResetJob** — les étapes 4 (absences → false) et 5 (exceptionnels → true) doivent s'exécuter **après** les étapes 2 et 3 (activation/désactivation groupe), pour que les overrides individuels aient la priorité.
