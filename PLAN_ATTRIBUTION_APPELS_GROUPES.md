# Plan — Attribution des Appels par Poste, Présence & Planning

**Date :** 2026-05-11 | **Mis à jour :** 2026-05-11  
**Contexte :** Les appels DB2 peuvent être attribués à des commerciaux qui ne travaillent pas le
jour de l'appel, car la résolution actuelle ignore la présence réelle. Ce plan introduit une
attribution en cascade : device → poste → présence du jour → planning de groupe.

## Règles métier validées

| Question | Réponse validée |
|---|---|
| Un commercial peut-il appartenir à plusieurs groupes ? | **Non — un seul groupe par commercial** |
| Un groupe est-il lié à un poste ? | **Non — un groupe est une entité indépendante** (peut contenir des commerciaux de postes différents) |
| Ambiguïté : 2 commerciaux planifiés sur le même créneau au même poste | **Tiebreaker : `local_number` correspond au `phone` du commercial** |
| Reset de `is_working_today` | **Minuit uniquement** (cron `0 0 * * *`) |

---

## Diagnostic — État du code existant

### Architecture actuelle

```
DB2 call_log
  → OrderCallSyncService.syncFromDb2()
      │
      ├─ Pré-résolution (boucle UNIQUE avant le traitement des appels)
      │     • commercialByPhone  : Map<normalizedPhone → commercial.id>
      │     • commercialByDevice : Map<deviceId → commercial.id>  ← BUG ICI
      │
      └─ Pour chaque appel :
            commercial = commercialByDevice.get(deviceId)
                      ?? commercialByPhone.get(localNumber)
                      ?? null
```

### Bug confirmé — Phase 1

Dans la pré-résolution (`order-call-sync.service.ts` ~ligne 152) :

```typescript
// ACTUEL — BUG : la Map écrase tous les commerciaux sauf le DERNIER pour chaque poste
const commercialByPosteId = new Map(
  commercialsAtPoste.filter((c) => c.poste?.id).map((c) => [c.poste!.id, c.id]),
  //                                                         ^^^^^^^^^^^^^^^^^^^^^^
  //              Si 3 commerciaux au poste A → seul le 3e est gardé dans la Map
);
```

Résultat : `commercialByDevice` pointe toujours vers le même commercial (le dernier
inséré pour ce poste), peu importe lequel a réellement passé l'appel.

### Entités existantes pertinentes

#### WhatsappCommercial (`whatsapp_commercial`)
| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | VARCHAR | |
| `phone` | VARCHAR 50 | UNIQUE, nullable |
| `email` | VARCHAR | UNIQUE, nullable |
| `poste_id` | FK → WhatsappPoste | nullable, ON DELETE SET NULL |
| `isConnected` | BOOLEAN | default false |
| `commercial_type` | ENUM | trainee / vendeuse_confirmee / superviseur / admin |
| `lastConnectionAt` | TIMESTAMP | nullable |
| `deletedAt` | TIMESTAMP | nullable (soft-delete) |
| **`is_working_today`** | ❌ **À créer** | BOOLEAN default false |
| **`working_today_since`** | ❌ **À créer** | TIMESTAMP nullable |
| **`group_id`** | ❌ **À créer** | FK → CommercialGroup |

#### WhatsappPoste (`whatsapp_poste`)
| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `code` | VARCHAR 100 | UNIQUE |
| `name` | VARCHAR 100 | UNIQUE |
| `is_active` | BOOLEAN | |

> ⚠️ Un poste reste une entité distincte d'un groupe. Un poste = point physique
> (téléphone/device). Un groupe = équipe de commerciaux avec un planning commun.

#### CallDevice (`call_device`)
| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `deviceId` | VARCHAR 64 | UNIQUE — identifiant téléphone DB2 |
| `posteId` | VARCHAR 64 | FK vers WhatsappPoste (implicite) |
| `label` | VARCHAR 128 | Libellé libre |
| `callCount` | INT | compteur appels |

#### WorkSchedule (`work_schedule`) — **DÉJÀ EXISTANT**
| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `commercialId` | VARCHAR 36 | nullable — schedule individuel |
| `groupId` | VARCHAR 36 | nullable — schedule de groupe |
| `groupName` | VARCHAR 100 | |
| `dayOfWeek` | ENUM | monday..sunday |
| `startTime` | VARCHAR 5 | HH:MM |
| `endTime` | VARCHAR 5 | HH:MM |
| `breakSlots` | JSON | [{start, end}] |
| `isActive` | BOOLEAN | |

> `WorkSchedule.groupId` sera lié à `CommercialGroup.id` (nouvelle entité Phase 3).
> Priorité : schedule individuel > schedule de groupe.

#### WorkAttendance (`work_attendance`) — table seule, pas d'entité TypeORM
| Colonne | Type | Notes |
|---|---|---|
| `commercial_id` | VARCHAR 36 | |
| `event_type` | VARCHAR 20 | login, logout, etc. |
| `event_at` | TIMESTAMP | |
| `work_date` | CHAR 10 | YYYY-MM-DD |

---

## Pipeline d'attribution cible

```
Pour chaque appel DB2 :

  [1] device_id → CallDevice → posteId
      ├─ Si posteId connu → pool = tous les commerciaux actifs du poste
      └─ Si posteId inconnu → aller directement au fallback [5]

  [2] Filtrer le pool par is_working_today = true
      ├─ 1 commercial → attribuer ✓
      ├─ 0 → continuer [3]
      └─ N → continuer [3] (ambiguïté, affiner par planning)

  [3] Filtrer par planning de groupe à l'heure de l'appel
      WorkScheduleService.getActiveGroupIds(timestamp)
      → réduire le pool aux commerciaux dont le groupe est planifié à cette heure
      ├─ 1 commercial → attribuer ✓
      ├─ 0 → continuer [4]
      └─ N → continuer [4] (ambiguïté, affiner par téléphone)

  [4] Tiebreaker : local_number → commercial.phone
      → Le local_number de l'appel correspond exactement au phone d'un commercial du pool filtré
      ├─ Match trouvé → attribuer ✓
      └─ Pas de match → prendre le commercial avec lastConnectionAt le plus récent

  [5] Fallback global : local_number → commercial.phone (tous commerciaux, sans filtre poste)
      └─ Pas de match → null (appel non attribué)
```

---

## Phases d'implémentation

---

### Phase 1 — Correctif pool multi-commerciaux (P0 · XS · 1h)

**Aucune migration.** Uniquement un fix dans `order-call-sync.service.ts`.

**Problème :** `Map<posteId, commercialId>` n'accepte qu'un commercial par poste.  
**Fix :** Passer à `Map<posteId, WhatsappCommercial[]>` + fonction `pickBest()`.

```typescript
// APRÈS — Phase 1 uniquement (sans is_working_today ni groupe)
const poolByPosteId = new Map<string, WhatsappCommercial[]>();
for (const c of commercialsAtPoste.filter((c) => c.poste?.id)) {
  const list = poolByPosteId.get(c.poste!.id) ?? [];
  list.push(c);
  poolByPosteId.set(c.poste!.id, list);
}

// Sélection provisoire (Phase 1 seulement) : dernier connecté
function pickBest(pool: WhatsappCommercial[], localNumber?: string): string | null {
  // Tiebreaker phase 1 : local_number → phone commercial (déjà présent dans commercialByPhone)
  if (localNumber) {
    const byPhone = pool.find((c) => c.phone && normalizePhone(c.phone) === normalizePhone(localNumber));
    if (byPhone) return byPhone.id;
  }
  // Dernier recours : lastConnectionAt
  const sorted = [...pool].sort((a, b) =>
    (b.lastConnectionAt?.getTime() ?? 0) - (a.lastConnectionAt?.getTime() ?? 0),
  );
  return sorted[0]?.id ?? null;
}

const commercialByDevice = new Map(
  allDevices
    .filter((d) => d.posteId && poolByPosteId.has(d.posteId))
    .map((d) => [
      d.deviceId,
      pickBest(poolByPosteId.get(d.posteId!)!, /* localNumber résolu dans la boucle appel */),
    ]),
);
```

> Note : `localNumber` n'est connu qu'à l'intérieur de la boucle de traitement des appels.
> Pour Phase 1, on résout sans `localNumber` dans la pré-résolution, puis on passe `localNumber`
> comme affinement dans la boucle individuelle (Phase 4 complète l'intégration).

**Fichiers modifiés :**
- `src/order-call-sync/order-call-sync.service.ts`

---

### Phase 2 — Flag `is_working_today` + reset nocturne (P0 · S · 4h)

#### 2.1 Migration

**Fichier :** `src/database/migrations/20260512_add_working_today_to_commercial.ts`  
**Classe :** `AddWorkingTodayToCommercial1747094400001`

```sql
ALTER TABLE whatsapp_commercial
  ADD COLUMN is_working_today    TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN working_today_since TIMESTAMP  NULL DEFAULT NULL,
  ADD INDEX  IDX_commercial_working_today (is_working_today);
```

#### 2.2 Entité WhatsappCommercial — nouvelles colonnes

```typescript
// src/whatsapp_commercial/entities/user.entity.ts
@Column({ name: 'is_working_today', type: 'boolean', default: false })
isWorkingToday: boolean;

@Column({ name: 'working_today_since', type: 'timestamp', nullable: true, default: null })
workingTodaySince: Date | null;
```

#### 2.3 Auto-détection depuis DB2

À chaque sync (`syncFromDb2()`), les appels traités révèlent quels appareils/commerciaux
sont actifs. Après résolution du commercial pour un appel :

```typescript
// Si le commercial n'est pas encore marqué is_working_today, le setter automatiquement
if (commercialIdDb1 && !workingTodayIds.has(commercialIdDb1)) {
  await this.commercialRepo.update(commercialIdDb1, {
    isWorkingToday:    true,
    workingTodaySince: new Date(),
  });
  workingTodayIds.add(commercialIdDb1);
}
```

`workingTodayIds` est un `Set<string>` local au batch pour éviter les updates redondants.

#### 2.4 Reset automatique (cron minuit)

**Fichier :** `src/work-schedule/jobs/daily-reset.job.ts`

```typescript
@Cron('0 0 * * *')
async resetWorkingToday(): Promise<void> {
  await this.commercialRepo
    .createQueryBuilder()
    .update()
    .set({ isWorkingToday: false, workingTodaySince: null })
    .where('isWorkingToday = true')
    .execute();
  this.logger.log('resetWorkingToday: flag réinitialisé pour tous les commerciaux');
}
```

#### 2.5 Endpoint manuel (admin/superviseur)

```
PATCH /commercials/:id/working-today
Body  : { working: boolean }
Guard : AdminGuard
```

Permet à un superviseur de corriger manuellement le flag (commercial absent annoncé en
retard, remplacement de dernière minute, etc.).

#### 2.6 Impact sur `pickBest()` (Phase 1 augmentée)

```typescript
function pickBest(pool: WhatsappCommercial[], localNumber?: string): string | null {
  // Étape 1 : is_working_today
  const workingToday = pool.filter((c) => c.isWorkingToday);
  const candidates   = workingToday.length > 0 ? workingToday : pool;

  // Étape 2 : tiebreaker local_number → phone
  if (localNumber) {
    const norm    = normalizePhone(localNumber);
    const byPhone = candidates.find((c) => c.phone && normalizePhone(c.phone) === norm);
    if (byPhone) return byPhone.id;
  }

  // Étape 3 : dernier connecté
  const sorted = [...candidates].sort((a, b) =>
    (b.lastConnectionAt?.getTime() ?? 0) - (a.lastConnectionAt?.getTime() ?? 0),
  );
  return sorted[0]?.id ?? null;
}
```

---

### Phase 3 — Entité CommercialGroup (P1 · M · 1j)

#### 3.1 Définition

Un **groupe** est une entité indépendante qui :
- Contient N commerciaux (relation OneToMany)
- Possède son propre emploi du temps via `WorkSchedule.groupId`
- Est **distinct du poste** — un groupe peut réunir des commerciaux de postes différents
- Un commercial appartient à **au plus un groupe** (`group_id` nullable sur `whatsapp_commercial`)

#### 3.2 Entité CommercialGroup

**Fichier :** `src/commercial-group/entities/commercial-group.entity.ts`

```typescript
@Entity('commercial_group')
@Index('IDX_commercial_group_active', ['isActive'])
export class CommercialGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true, default: null })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relation inverse (chargée à la demande)
  @OneToMany(() => WhatsappCommercial, (c) => c.group)
  commercials?: WhatsappCommercial[];
}
```

> Pas de `posteId` sur le groupe — le groupe est intentionnellement découplé du poste.

#### 3.3 Migration

**Fichier :** `src/database/migrations/20260512_add_commercial_group.ts`  
**Classe :** `AddCommercialGroup1747094400002`

```sql
-- 1. Créer la table
CREATE TABLE commercial_group (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX IDX_commercial_group_active (is_active)
);

-- 2. Ajouter group_id sur whatsapp_commercial
ALTER TABLE whatsapp_commercial
  ADD COLUMN group_id CHAR(36) NULL DEFAULT NULL,
  ADD INDEX  IDX_commercial_group_id (group_id),
  ADD CONSTRAINT FK_commercial_group_id
    FOREIGN KEY (group_id) REFERENCES commercial_group(id) ON DELETE SET NULL;
```

#### 3.4 Entité WhatsappCommercial — ajout group_id

```typescript
@Column({ name: 'group_id', type: 'char', length: 36, nullable: true, default: null })
groupId: string | null;

@ManyToOne(() => CommercialGroup, (g) => g.commercials, { nullable: true, onDelete: 'SET NULL' })
@JoinColumn({ name: 'group_id' })
group?: CommercialGroup;
```

#### 3.5 Module CommercialGroup

**Fichier :** `src/commercial-group/commercial-group.module.ts`

Services et endpoints exposés :
```
POST   /commercial-groups              — créer un groupe
GET    /commercial-groups              — lister tous les groupes actifs
GET    /commercial-groups/:id          — détail + liste des membres
PATCH  /commercial-groups/:id          — renommer / désactiver
DELETE /commercial-groups/:id          — soft-delete (is_active = false)
POST   /commercial-groups/:id/members  — ajouter un commercial au groupe
DELETE /commercial-groups/:id/members/:commercialId — retirer un commercial
```

#### 3.6 Lien WorkSchedule → CommercialGroup

`WorkSchedule.groupId` accepte déjà un UUID. Créer des entrées avec
`groupId = commercialGroup.id`, `commercialId = null` pour le planning du groupe.

Convention de priorité dans `WorkScheduleService` :
```
schedule individuel (commercialId != null) > schedule de groupe (groupId != null)
```

---

### Phase 4 — Attribution par planning (P1 · M · 1j)

#### 4.1 Nouvelle méthode WorkScheduleService.getActiveGroupIds()

```typescript
/**
 * Retourne les IDs des groupes CommercialGroup dont le planning WorkSchedule
 * couvre le timestamp donné, en tenant compte des pauses (breakSlots).
 */
async getActiveGroupIds(at: Date): Promise<string[]> {
  const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][at.getDay()];
  const hhmm      = `${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`;

  const schedules = await this.workScheduleRepo.find({
    where: {
      groupId:    Not(IsNull()),
      dayOfWeek:  dayOfWeek as any,
      isActive:   true,
    },
  });

  return schedules
    .filter((s) => {
      if (s.startTime > hhmm || s.endTime <= hhmm) return false;
      const breaks = (s.breakSlots as { start: string; end: string }[] | null) ?? [];
      return !breaks.some((b) => b.start <= hhmm && b.end > hhmm);
    })
    .map((s) => s.groupId!);
}
```

#### 4.2 Méthode resolveCommercialForDevice() dans OrderCallSyncService

Remplace la Map statique + `pickBest()` par une résolution dynamique par appel,
utilisant toutes les étapes du pipeline :

```typescript
private async resolveCommercialForDevice(
  pool:         WhatsappCommercial[],  // commerciaux du poste
  localNumber:  string | null,
  callTimestamp: Date,
): Promise<string | null> {

  // Étape 1 : is_working_today
  const working = pool.filter((c) => c.isWorkingToday);
  const step1   = working.length > 0 ? working : pool;

  if (step1.length === 1) return step1[0].id;

  // Étape 2 : planning de groupe à l'heure de l'appel
  const activeGroupIds = await this.workScheduleService.getActiveGroupIds(callTimestamp);
  const bySchedule     = step1.filter((c) => c.groupId && activeGroupIds.includes(c.groupId));
  const step2          = bySchedule.length > 0 ? bySchedule : step1;

  if (step2.length === 1) return step2[0].id;

  // Étape 3 : tiebreaker local_number → commercial.phone
  if (localNumber) {
    const norm    = normalizePhone(localNumber);
    const byPhone = step2.find((c) => c.phone && normalizePhone(c.phone) === norm);
    if (byPhone) return byPhone.id;
  }

  // Étape 4 : dernier connecté
  const sorted = [...step2].sort((a, b) =>
    (b.lastConnectionAt?.getTime() ?? 0) - (a.lastConnectionAt?.getTime() ?? 0),
  );
  return sorted[0]?.id ?? null;
}
```

#### 4.3 Refactor de la boucle dans syncFromDb2()

La résolution n'est plus calculée en pré-résolution globale mais appelée individuellement
pour chaque appel (nécessaire car `callTimestamp` diffère par appel) :

```typescript
for (const call of calls) {
  const normalizedLocal = normalizePhone(call.localNumber);

  let commercialIdDb1: string | null = null;
  let attributionSource: string | null = null;

  if (call.deviceId) {
    const device = allDevicesMap.get(call.deviceId);
    if (device?.posteId) {
      const pool = poolByPosteId.get(device.posteId) ?? [];
      if (pool.length > 0) {
        commercialIdDb1 = await this.resolveCommercialForDevice(
          pool, call.localNumber, call.callTimestamp,
        );
        if (commercialIdDb1) attributionSource = 'device_poste';
      }
    }
  }

  // Fallback global : localNumber → phone (tous commerciaux)
  if (!commercialIdDb1 && normalizedLocal) {
    commercialIdDb1   = commercialByPhone.get(normalizedLocal) ?? null;
    if (commercialIdDb1) attributionSource = 'phone';
  }

  // ... reste du traitement
}
```

#### 4.4 Cache intra-batch

Pour éviter N requêtes WorkSchedule pour N appels d'un même batch, mettre en cache
les `activeGroupIds` calculés, clés par `dayOfWeek+hhmm` (arrondi à la minute) :

```typescript
const scheduleCache = new Map<string, string[]>(); // "monday|09:30" → groupIds

async function getCachedActiveGroups(at: Date): Promise<string[]> {
  const key = `${dayOfWeek}|${hhmm}`;
  if (!scheduleCache.has(key)) {
    scheduleCache.set(key, await workScheduleService.getActiveGroupIds(at));
  }
  return scheduleCache.get(key)!;
}
```

---

### Phase 5 — Admin UI (P2 · M · 1j)

#### 5.1 Vue "Présence du jour"

Page `/admin/presence` :
- Tableau par poste : nom du poste / commerciaux / badge vert "En service" ou gris "Absent"
- `working_today_since` affiché (heure de prise de poste)
- Bouton toggle manuel par superviseur

#### 5.2 Vue gestion des groupes

Page `/admin/groups` :
- Liste des groupes actifs / inactifs
- Créer un groupe, le nommer, l'activer/désactiver
- Drag-and-drop ou sélection pour assigner des commerciaux à un groupe
- Indicateur : commercial sans groupe (orphelin) = badge orange

#### 5.3 Vue planning par groupe

Extension de la vue emploi du temps existante :
- Onglet "Groupes" : une colonne par groupe, lignes = créneaux horaires
- Visualisation qui couvre quelle plage
- Lier une entrée `WorkSchedule` à un groupe depuis l'UI

---

## Migrations — Récapitulatif

| Ordre | Fichier | Classe TypeORM | Contenu |
|---|---|---|---|
| 1 | `20260512_add_working_today_to_commercial.ts` | `AddWorkingTodayToCommercial1747094400001` | `is_working_today` + `working_today_since` sur `whatsapp_commercial` |
| 2 | `20260512_add_commercial_group.ts` | `AddCommercialGroup1747094400002` | Crée `commercial_group` + `group_id` FK sur `whatsapp_commercial` |

---

## Ordre d'implémentation recommandé

| Priorité | Phase | Effort | Dépendances | Impact |
|---|---|---|---|---|
| **P0** | Phase 1 — Fix pool multi-commerciaux | XS (1h) | Aucune | Critique — corrige le bug actuel |
| **P0** | Phase 2 — Migration + entité + reset cron | S (3h) | Phase 1 | Haut — attribution au commercial présent |
| **P0** | Phase 2 — Auto-détection depuis DB2 | XS (1h) | Phase 2 migration | Haut — peuple le flag automatiquement |
| **P0** | Phase 2 — Endpoint toggle manuel | XS (1h) | Phase 2 migration | Moyen — correction superviseur |
| **P1** | Phase 3 — CommercialGroup + migrations + CRUD | M (1j) | Phase 2 | Moyen — prépare le planning |
| **P1** | Phase 4 — resolveCommercialForDevice() | M (1j) | Phase 3 | Haut — précision maximale |
| **P2** | Phase 5 — Admin UI présence + groupes + planning | M (1j) | Phase 3-4 | Moyen — visibilité superviseur |

---

## Nouveau pipeline d'attribution complet (après toutes phases)

```
Appel DB2 :
  device_id → poste → pool commerciaux du poste
    │
    ├─ [Étape 1] is_working_today = true
    │     → 1 seul ? → Attribuer ✓
    │
    ├─ [Étape 2] WorkSchedule.groupId planifié à callTimestamp
    │     → 1 seul ? → Attribuer ✓
    │
    ├─ [Étape 3] Tiebreaker local_number → commercial.phone
    │     → Match ? → Attribuer ✓
    │
    ├─ [Étape 4] lastConnectionAt le plus récent dans le pool filtré
    │     → Attribuer ✓
    │
    └─ [Fallback] local_number → commercial.phone (tous commerciaux)
          → Attribuer ✓ ou null
```

---

## Règles non-négociables

- Ne jamais écrire dans les tables natives DB2
- `is_working_today` est un flag DB1 uniquement — jamais synchronisé vers DB2
- `CommercialGroup` est entièrement DB1 — pas de correspondance DB2
- Un commercial = au plus un groupe (`group_id` unique par commercial)
- Le fallback `localNumber → phone` doit toujours rester en dernier recours
- Reset `is_working_today` à **minuit uniquement**

---

*Plan rédigé le 2026-05-11. Règles métier validées le 2026-05-11.*  
*Phases P0 peuvent démarrer immédiatement.*
