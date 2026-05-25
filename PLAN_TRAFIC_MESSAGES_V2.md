# Plan V2 — Trafic Messages : Toggle Heure/Jour + Optimisation à l'échelle

> **Branche :** `production`  
> **Date :** 2026-05-25  
> **Dépend de :** `PLAN_TRAFIC_MESSAGES.md` (v1 livrée)  
> **Statut :** 📋 À implémenter

---

## 1. Contexte & Objectifs

### Besoin fonctionnel
Ajouter un **toggle local** dans la vue Trafic Messages pour basculer entre :
- **Mode heure** (actuel) — 24 barres, axe X : 00h→23h
- **Mode jour** (nouveau) — 7 barres, axe X : Lun→Dim

### Besoin technique
Optimiser toutes les requêtes SQL de la vue trafic pour absorber **plusieurs millions
de lignes** dans `whatsapp_message` sans dégradation de performance.

---

## 2. Audit des index existants sur `whatsapp_message`

### 2.1 Index actuels (déclarés dans l'entité)

| Nom | Colonnes DB | Utilisé par |
|---|---|---|
| `IDX_msg_analytics_time` | `(createdAt, deletedAt)` | Range scan Q1 et Q2 |
| `IDX_msg_analytics_dir_time` | `(direction, createdAt, deletedAt)` | Filtre par direction |
| `IDX_msg_commercial_dir_time` | `(commercial_id, direction, createdAt)` | Perf commerciaux |
| `IDX_msg_poste_dir_time` | `(poste_id, direction, createdAt)` | Perf postes |
| `IDX_msg_response_time` | `(chat_id, direction, timestamp)` | Temps de réponse |

### 2.2 Problèmes identifiés

#### Problème 1 — Pas d'index couvrant → row lookup systématique

La requête principale `getTraficHoraire` (Q1) :
```sql
SELECT HOUR(createdAt), COUNT(*), SUM(direction='IN'), SUM(direction='OUT')
FROM whatsapp_message
WHERE deletedAt IS NULL AND createdAt >= :start AND createdAt <= :end
GROUP BY HOUR(createdAt)
```

**Ce qui se passe :**
- MySQL utilise `IDX_msg_analytics_time (createdAt, deletedAt)` pour le range scan ✅
- Mais `direction` n'est pas dans cet index → MySQL doit **lire la ligne principale**
  pour chaque row afin d'obtenir la valeur de `direction` ❌
- Sur 10M rows sur 30 jours = ~330K rows lues/jour × row lookup = **overhead ×3 à ×5**

#### Problème 2 — Function-scan sur `HOUR(createdAt)` et `WEEKDAY(createdAt)`

MySQL ne peut pas utiliser un index B-tree pour résoudre `GROUP BY HOUR(createdAt)` 
directement. Il doit calculer `HOUR()` pour chaque ligne du range, puis agréger.

En MySQL 5.7 : **aucun index ne peut accélérer le GROUP BY** sur une expression.  
En MySQL 8.0 : les functional indexes existent mais ne sont pas encore créés.

**Solution :** colonnes générées virtuelles + index sur ces colonnes.

#### Problème 3 — `getPerformanceTemporelle` a le même pattern

```sql
SELECT DATE(createdAt), COUNT(*), ...
GROUP BY DATE(createdAt)
```

Même problème : function-scan sur `DATE()`, pas de covering index.
Bénéficiera de l'index couvrant ajouté en N1.

#### Problème 4 — Q2 dans `getTraficHoraire` = requête séparée

La Q2 `COUNT(DISTINCT DATE(createdAt))` est un deuxième aller-retour DB. 
Avec Promise.all les deux requêtes s'exécutent en parallèle — acceptable.
Optimisation possible : la fusionner dans Q1 via sous-requête scalaire.

---

## 3. Stratégie d'optimisation — 3 niveaux

### Niveau 1 — Index couvrant (élimine les row lookups) [PRIORITÉ HAUTE]

Ajouter un index sur `(createdAt, direction, deletedAt)` :
- `createdAt` en premier → range scan efficace
- `direction` inclus → agrégation `SUM(direction='IN'/'OUT')` depuis l'index, sans toucher les lignes
- `deletedAt` inclus → filtre `IS NULL` depuis l'index

```
AVANT : range scan → N row lookups pour lire direction
APRÈS : range scan entièrement dans l'index (index-only scan)
Gain estimé : -60 à -80% temps de requête
```

### Niveau 2 — Colonnes générées + index dédiés (élimine les function-scans) [PRIORITÉ HAUTE]

Ajouter deux colonnes virtuelles générées par MySQL :

| Colonne DB | Expression | Type | Usage |
|---|---|---|---|
| `hour_of_day` | `HOUR(createdAt)` | `TINYINT UNSIGNED` | GROUP BY mode heure |
| `day_of_week_n` | `WEEKDAY(createdAt)` | `TINYINT UNSIGNED` | GROUP BY mode jour |

> `WEEKDAY()` retourne **0=Lundi, 1=Mardi, …, 6=Dimanche** (convention française naturelle).

Puis indexer ces colonnes avec `createdAt` en préfixe pour garder le range filter :

```
AVANT : GROUP BY HOUR(createdAt) → calcul HOUR() sur chaque ligne du range
APRÈS : GROUP BY hour_of_day → lit directement depuis l'index, 0 calcul
Gain estimé : -30 à -50% temps sur le GROUP BY
```

### Niveau 3 — Fusion Q1+Q2 en une seule passe (élimine un aller-retour DB) [PRIORITÉ MOYENNE]

Remplacer la Q2 séparée par une **sous-requête scalaire dans Q1** :

```sql
SELECT
  hour_of_day,
  COUNT(*)                                         AS total,
  SUM(direction = 'IN')                            AS messages_in,
  SUM(direction = 'OUT')                           AS messages_out,
  -- nb_jours : sous-requête exécutée UNE SEULE FOIS, mise en cache par MySQL
  (SELECT COUNT(DISTINCT DATE(createdAt))
   FROM whatsapp_message
   WHERE deletedAt IS NULL
     AND createdAt >= :start AND createdAt <= :end) AS nb_jours_global
FROM whatsapp_message
WHERE deletedAt IS NULL AND createdAt >= :start AND createdAt <= :end
GROUP BY hour_of_day
ORDER BY hour_of_day ASC
```

> MySQL optimise les sous-requêtes scalaires non-corrélées (exécutées une seule fois
> et le résultat mis en cache pour tous les groupes). Plus efficace que Promise.all
> sur une connexion à forte charge.

**Gain estimé :** -1 connexion DB par requête, réduit la charge de connection pool.

---

## 4. User Stories

### US-1 — Migration BDD [BACKEND]

**Fichier à créer :**  
`message_whatsapp/src/database/migrations/AddTrafficGroupingIndexes1748995200001.ts`

**Contenu complet :**
```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration : optimisation du trafic horaire à l'échelle
 *
 * 1. Colonnes générées virtuelles (MySQL 5.7+ / 8.0 compatible)
 *    - hour_of_day   = HOUR(createdAt)    → GROUP BY mode heure
 *    - day_of_week_n = WEEKDAY(createdAt) → GROUP BY mode jour (0=Lun…6=Dim)
 *
 * 2. Index couvrant principal
 *    IDX_msg_trafic_covering (createdAt, direction, deletedAt)
 *    → élimine les row lookups : SUM(direction) satisfait depuis l'index
 *
 * 3. Index dédié mode heure
 *    IDX_msg_trafic_hour (hour_of_day, createdAt, deletedAt)
 *    → GROUP BY hour_of_day sans function-scan
 *
 * 4. Index dédié mode jour de semaine
 *    IDX_msg_trafic_dow (day_of_week_n, createdAt, deletedAt)
 *    → GROUP BY day_of_week_n sans function-scan
 *
 * Toutes les opérations sont online InnoDB et idempotentes.
 */
export class AddTrafficGroupingIndexes1748995200001 implements MigrationInterface {
  name = 'AddTrafficGroupingIndexes1748995200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) return;

    // ── 1. Colonnes générées virtuelles ───────────────────────────────────────
    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_message'
         AND COLUMN_NAME IN ('hour_of_day', 'day_of_week_n')`,
    );
    const existingCols = new Set((cols as any[]).map((r) => r.COLUMN_NAME));

    if (!existingCols.has('hour_of_day')) {
      await queryRunner.query(`
        ALTER TABLE \`whatsapp_message\`
          ADD COLUMN \`hour_of_day\` TINYINT UNSIGNED
            GENERATED ALWAYS AS (HOUR(\`createdAt\`)) VIRTUAL
            COMMENT 'Heure 0-23, générée virtuellement depuis createdAt'
      `);
    }

    if (!existingCols.has('day_of_week_n')) {
      await queryRunner.query(`
        ALTER TABLE \`whatsapp_message\`
          ADD COLUMN \`day_of_week_n\` TINYINT UNSIGNED
            GENERATED ALWAYS AS (WEEKDAY(\`createdAt\`)) VIRTUAL
            COMMENT 'Jour semaine 0=Lun…6=Dim, généré depuis createdAt'
      `);
    }

    // ── 2. Index couvrant (range + direction sans row lookup) ────────────────
    await this.addIndex(
      queryRunner, 'whatsapp_message', 'IDX_msg_trafic_covering',
      '`createdAt`, `direction`, `deletedAt`',
    );

    // ── 3. Index mode heure ───────────────────────────────────────────────────
    await this.addIndex(
      queryRunner, 'whatsapp_message', 'IDX_msg_trafic_hour',
      '`hour_of_day`, `createdAt`, `deletedAt`',
    );

    // ── 4. Index mode jour de semaine ─────────────────────────────────────────
    await this.addIndex(
      queryRunner, 'whatsapp_message', 'IDX_msg_trafic_dow',
      '`day_of_week_n`, `createdAt`, `deletedAt`',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) return;

    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_trafic_dow');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_trafic_hour');
    await this.dropIndex(queryRunner, 'whatsapp_message', 'IDX_msg_trafic_covering');

    // Supprimer colonnes dans l'ordre inverse (dow avant hour car pas de dépendance)
    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_message'
         AND COLUMN_NAME IN ('hour_of_day', 'day_of_week_n')`,
    );
    const existingCols = new Set((cols as any[]).map((r) => r.COLUMN_NAME));
    if (existingCols.has('day_of_week_n')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP COLUMN \`day_of_week_n\``,
      );
    }
    if (existingCols.has('hour_of_day')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP COLUMN \`hour_of_day\``,
      );
    }
  }

  // ── Helpers idempotents ────────────────────────────────────────────────────

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`,
      [indexName],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async addIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    columns: string,
  ): Promise<void> {
    if (await this.indexExists(queryRunner, table, indexName)) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`,
    );
  }

  private async dropIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<void> {
    if (!(await this.indexExists(queryRunner, table, indexName))) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``,
    );
  }
}
```

> ⚠️ **Attention déploiement** : `ALTER TABLE ADD COLUMN VIRTUAL` et `ADD INDEX` sont
> des opérations **online InnoDB** (pas de lock de table). Sur 10M+ rows, prévoir
> 2–10 minutes selon le serveur. À exécuter en heure creuse.

---

### US-2 — Backend : entité + service + DTO + controller [BACKEND]

#### 4.2.1 Entité `whatsapp_message.entity.ts` — ajouter les colonnes générées

Ajouter après `@DeleteDateColumn` :

```typescript
// ── Colonnes générées virtuelles (créées par migration AddTrafficGroupingIndexes) ──
// Non incluses dans INSERT/UPDATE — lecture seule pour les requêtes d'agrégation.

@Column({
  name: 'hour_of_day',
  type: 'tinyint',
  unsigned: true,
  nullable: true,
  generatedType: 'VIRTUAL',
  asExpression: `HOUR(\`createdAt\`)`,
  select: false,   // exclure des SELECT * automatiques
  insert: false,
  update: false,
})
hourOfDay?: number | null;

@Column({
  name: 'day_of_week_n',
  type: 'tinyint',
  unsigned: true,
  nullable: true,
  generatedType: 'VIRTUAL',
  asExpression: `WEEKDAY(\`createdAt\`)`,
  select: false,
  insert: false,
  update: false,
})
dayOfWeekN?: number | null;
```

> `generatedType: 'VIRTUAL'` et `asExpression` sont supportés par TypeORM 0.3.x
> sur MySQL. Le `select: false` évite que ces colonnes apparaissent dans les SELECT *
> et les `find()` — elles ne sont utilisées qu'en QueryBuilder.

#### 4.2.2 DTOs — `create-metrique.dto.ts`

**Renommer `TraficHorairePointDto` → champs génériques :**

```typescript
/** Point du diagramme trafic (heure OU jour selon granularité) */
export class TraficPointDto {
  @ApiProperty({ description: 'Index : 0-23 (heure) ou 0-6 (jour, 0=Lun)' })
  index: number;

  @ApiProperty({ description: "Label : '00:00' ou 'Lun'" })
  label: string;

  @ApiProperty() total: number;
  @ApiProperty() messages_in: number;
  @ApiProperty() messages_out: number;
  @ApiProperty({ description: 'Moyenne par jour (mode heure) ou par semaine (mode jour)' })
  avg_par_unite: number;
}

/** Réponse trafic v2 — remplace TraficHoraireResponseDto */
export class TraficResponseDto {
  @ApiProperty({ enum: ['heure', 'jour'] })
  granularite: 'heure' | 'jour';            // mode actif

  @ApiProperty({ type: [TraficPointDto] })
  points: TraficPointDto[];                 // 24 points (heure) ou 7 points (jour)

  @ApiProperty({ type: TraficStatistiquesDto })
  statistiques: TraficStatistiquesDto;      // inchangé

  meta: {
    periode: string;
    dateStart: string;
    dateEnd: string;
    nb_unites: number;                      // 24 ou 7
    nb_jours: number;                       // nb de jours distincts dans la plage
  };
}
```

> **Rétro-compatibilité :** `TraficHoraireResponseDto` et `TraficHorairePointDto`
> peuvent être conservés comme alias deprecated le temps de la transition :
> ```typescript
> export { TraficResponseDto      as TraficHoraireResponseDto };
> export { TraficPointDto         as TraficHorairePointDto    };
> ```

#### 4.2.3 Service `metriques.service.ts` — refactorer `getTraficHoraire()`

```typescript
// Libellés des jours (WEEKDAY : 0=Lun ... 6=Dim)
private readonly DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

async getTraficHoraire(
  periode    = 'today',
  dateFrom?  : string,
  dateTo?    : string,
  granularite: 'heure' | 'jour' = 'heure',
): Promise<TraficResponseDto> {
  const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);
  const nbUnites = granularite === 'heure' ? 24 : 7;

  // ── Q1 : agrégation par colonne générée (index-only scan avec IDX_msg_trafic_*) ──
  //  On référence `message.hourOfDay` ou `message.dayOfWeekN` (colonnes générées)
  //  au lieu de HOUR()/WEEKDAY() → MySQL utilise directement l'index.
  //
  //  La sous-requête scalaire `nb_jours_global` est exécutée UNE SEULE FOIS par
  //  MySQL (non-corrélée) et mise en cache pour tous les groupes → N3 appliqué.
  const groupCol = granularite === 'heure' ? 'message.hourOfDay' : 'message.dayOfWeekN';

  const rows = await this.messageRepository
    .createQueryBuilder('message')
    .select(groupCol, 'groupe')
    .addSelect('COUNT(*)', 'total')
    .addSelect('SUM(CASE WHEN message.direction = "IN"  THEN 1 ELSE 0 END)', 'messages_in')
    .addSelect('SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)', 'messages_out')
    // N3 : sous-requête scalaire non-corrélée — remplace la Q2 séparée
    .addSelect(
      `(SELECT COUNT(DISTINCT DATE(m2.createdAt))
          FROM whatsapp_message m2
         WHERE m2.deletedAt IS NULL
           AND m2.createdAt >= :dateStart
           AND m2.createdAt <= :dateEnd)`,
      'nb_jours_global',
    )
    .where('message.deletedAt IS NULL')
    .andWhere('message.createdAt >= :dateStart', { dateStart })
    .andWhere('message.createdAt <= :dateEnd',   { dateEnd })
    .groupBy(groupCol)
    .orderBy('groupe', 'ASC')
    .getRawMany();

  // Nb jours distincts dans la plage (lu depuis n'importe quel groupe)
  const nbJoursGlobal = parseInt(rows[0]?.nb_jours_global) || 1;

  // ── Construire les N points (remplir les tranches sans données avec 0) ──────
  const dataMap = new Map<number, { total: number; in: number; out: number }>();
  for (const row of rows) {
    const g = parseInt(row.groupe);
    dataMap.set(g, {
      total: parseInt(row.total)        || 0,
      in:    parseInt(row.messages_in)  || 0,
      out:   parseInt(row.messages_out) || 0,
    });
  }

  const points: TraficPointDto[] = Array.from({ length: nbUnites }, (_, i) => {
    const d = dataMap.get(i) ?? { total: 0, in: 0, out: 0 };
    const label = granularite === 'heure'
      ? `${String(i).padStart(2, '0')}:00`
      : this.DOW_LABELS[i];
    const avgParUnite = granularite === 'heure'
      ? (nbJoursGlobal > 1 ? Math.round((d.total / nbJoursGlobal) * 10) / 10 : d.total)
      : (nbJoursGlobal > 6 ? Math.round((d.total / Math.floor(nbJoursGlobal / 7)) * 10) / 10 : d.total);
    return {
      index:        i,
      label,
      total:        d.total,
      messages_in:  d.in,
      messages_out: d.out,
      avg_par_unite: avgParUnite,
    };
  });

  // ── Calcul statistiques ────────────────────────────────────────────────────
  // (logique identique à la v1, adapté avec `points` au lieu de `horaire`)
  const totalMsg  = points.reduce((s, p) => s + p.total, 0);
  const totalIn   = points.reduce((s, p) => s + p.messages_in, 0);
  const totalOut  = points.reduce((s, p) => s + p.messages_out, 0);
  // ... [reste identique à la méthode v1]

  return {
    granularite,
    points,
    statistiques,
    meta: {
      periode,
      dateStart: dateStart.toISOString(),
      dateEnd:   dateEnd.toISOString(),
      nb_unites: nbUnites,
      nb_jours:  nbJoursGlobal,
    },
  };
}
```

> **Note :** `avg_par_unite` en mode `jour` divise par le nombre de semaines complètes
> (`Math.floor(nbJoursGlobal / 7)`). Ainsi, pour une plage de 30 jours (4 semaines),
> chaque barre affiche la moyenne de messages reçus ce jour-là sur 4 semaines.

#### 4.2.4 Controller — ajouter `@Query('granularite')`

```typescript
@Get('trafic-horaire')
@ApiOperation({ summary: 'Trafic messages par heure (24h) ou par jour de semaine (7j)' })
@ApiResponse({ status: 200, type: TraficResponseDto })
async getTraficHoraire(
  @Query('periode')     periode     : string = 'today',
  @Query('dateFrom')    dateFrom?   : string,
  @Query('dateTo')      dateTo?     : string,
  @Query('granularite') granularite : 'heure' | 'jour' = 'heure',
): Promise<TraficResponseDto> {
  return this.metriquesService.getTraficHoraire(
    periode, dateFrom, dateTo, granularite,
  );
}
```

---

### US-3 — Frontend : Types + API + Composant [FRONTEND]

#### 4.3.1 `definitions.ts` — mettre à jour les types

```typescript
/** Point générique du diagramme trafic (heure ou jour) */
export type TraficPoint = {
  index:         number;   // 0-23 (heure) ou 0-6 (jour)
  label:         string;   // "00:00" ou "Lun"
  total:         number;
  messages_in:   number;
  messages_out:  number;
  avg_par_unite: number;
};

/** Réponse de l'endpoint trafic-horaire v2 */
export type TraficResponse = {
  granularite:  'heure' | 'jour';
  points:       TraficPoint[];          // 24 ou 7 points
  statistiques: TraficStatistiques;     // inchangé
  meta: {
    periode:    string;
    dateStart:  string;
    dateEnd:    string;
    nb_unites:  number;
    nb_jours:   number;
  };
};

// Alias de compatibilité v1 → v2
export type TraficHoraireResponse = TraficResponse;
export type TraficHorairePoint    = TraficPoint;
```

#### 4.3.2 `api.ts` — ajouter `granularite` param

```typescript
export async function getTraficHoraire(
  periode      = 'today',
  dateFrom?    : string,
  dateTo?      : string,
  granularite  : 'heure' | 'jour' = 'heure',   // ← NOUVEAU
): Promise<TraficResponse> {
  const params = new URLSearchParams({ periode, granularite });
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo)   params.set('dateTo', dateTo);
  const response = await fetch(
    `${API_BASE_URL}/api/metriques/trafic-horaire?${params.toString()}`,
    { method: 'GET', credentials: 'include' },
  );
  return handleResponse<TraficResponse>(response);
}
```

#### 4.3.3 `MessageTrafficView.tsx` — toggle + adaptation composant

**Nouveau state local (pas dans le filtre global) :**
```typescript
const [granularite, setGranularite] = useState<'heure' | 'jour'>('heure');
```

**Passer `granularite` à `getTraficHoraire` :**
```typescript
const load = useCallback(async () => {
  // ...
  const result = await getTraficHoraire(selectedPeriod, dateFrom, dateTo, granularite);
  // ...
}, [selectedPeriod, dateFrom, dateTo, granularite]);   // ← ajouter granularite
```

**Composant `GranulariteToggle` (local au fichier) :**
```tsx
function GranulariteToggle({
  value, onChange,
}: { value: 'heure' | 'jour'; onChange: (v: 'heure' | 'jour') => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
      {(['heure', 'jour'] as const).map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
            value === g
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {g === 'heure' ? '⏱ Par heure' : '📅 Par jour'}
        </button>
      ))}
    </div>
  );
}
```

**Intégration dans `PageHeader` — le toggle est placé juste sous le titre :**
```tsx
// Dans le rendu principal, entre PageHeader et KpiGrid :
<div className="flex items-center justify-between">
  <GranulariteToggle value={granularite} onChange={setGranularite} />
  {data && (
    <span className="text-xs text-gray-400">
      {granularite === 'heure' ? '24 tranches horaires' : '7 jours de la semaine'}
      {data.statistiques.mode === 'periode' && ` · moyenne sur ${data.meta.nb_jours}j`}
    </span>
  )}
</div>
```

**Adapter `TrafficBarChart` — renommer `horaire` → `points` :**
```tsx
interface TrafficBarChartProps {
  points:         TraficPoint[];        // ← renommé
  granularite:    'heure' | 'jour';     // ← nouveau (remplace mode='heure'|'periode')
  nbJours:        number;
  selectedPeriod: string;
}

function TrafficBarChart({ points, granularite, nbJours, selectedPeriod }) {
  // Transformation : en mode période, les barres affichent avg_par_unite
  const isMoyenne = granularite === 'heure'
    ? nbJours > 1   // mode heure + plusieurs jours → moyennes
    : nbJours > 6;  // mode jour + moins d'1 semaine → totaux réels

  const chartData = isMoyenne
    ? points.map(p => ({
        ...p,
        messages_in:  Math.round((p.messages_in  / (granularite === 'jour' ? Math.max(1, Math.floor(nbJours/7)) : nbJours)) * 10) / 10,
        messages_out: Math.round((p.messages_out / (granularite === 'jour' ? Math.max(1, Math.floor(nbJours/7)) : nbJours)) * 10) / 10,
      }))
    : points;

  // Titre dynamique
  const titre = granularite === 'heure'
    ? (nbJours <= 1 ? "Trafic heure par heure — aujourd'hui" : `Moyenne horaire sur ${nbJours}j`)
    : (nbJours <= 6 ? 'Trafic par jour de la semaine' : `Moyenne par jour sur ${Math.floor(nbJours/7)} semaine(s)`);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-800">{titre}</h3>
        {isMoyenne && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200
                        rounded px-2 py-1 inline-flex items-center gap-1 mt-1">
            <Info size={12} />
            Valeurs = moyennes (données sur {nbJours} jours)
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"                        {/* ← était heureLabel */}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            interval={0}                           {/* toujours afficher tous les labels */}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            width={40}
            allowDecimals={isMoyenne}              {/* décimales seulement pour moyennes */}
          />
          <Tooltip content={<CustomTooltip isMoyenne={isMoyenne} />} />
          <Legend />
          <Bar dataKey="messages_in"  name="Entrants" fill="#10b981" radius={[3,3,0,0]} maxBarSize={28} />
          <Bar dataKey="messages_out" name="Sortants"  fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**TopHeures** — adapter le titre selon la granularité :
```tsx
// Titre dynamique
const tableTitle = granularite === 'heure'
  ? 'Top 5 heures de pic'
  : 'Top 5 jours de pic';
```

---

## 5. Séquence d'implémentation

```
Étape 1 — Migration BDD (US-1)                  ~45min
  ├── Créer AddTrafficGroupingIndexes1748995200001.ts
  ├── Enregistrer dans datasource (ormconfig / app.module)
  └── ⚠️ Exécuter en heure creuse (ALTER TABLE online mais peut prendre 5-10min)

Étape 2 — Entité (US-2.1)                       ~15min
  └── whatsapp_message.entity.ts : +hourOfDay, +dayOfWeekN

Étape 3 — DTOs (US-2.2)                         ~20min
  └── create-metrique.dto.ts : +TraficPointDto, +TraficResponseDto, alias

Étape 4 — Service (US-2.3)                      ~1h
  ├── getTraficHoraire() : ajouter param granularite
  ├── Utiliser groupCol (hourOfDay / dayOfWeekN)
  ├── Fusionner Q2 en sous-requête scalaire (N3)
  └── Labels DOW_LABELS pour mode jour

Étape 5 — Controller (US-2.4)                   ~10min
  └── Ajouter @Query('granularite')

Étape 6 — Frontend types + API (US-3.1/3.2)     ~20min
  ├── definitions.ts : TraficPoint, TraficResponse, alias
  └── api.ts : ajouter granularite param

Étape 7 — Composant (US-3.3)                    ~2h
  ├── MessageTrafficView.tsx : state granularite + useCallback dep
  ├── GranulariteToggle (local)
  ├── Adapter TrafficBarChart (points, isMoyenne, titre)
  ├── Adapter TopHeures (titre dynamique)
  └── Auto-refresh : dépend maintenant aussi de granularite

Étape 8 — Tests manuels                         ~30min
  ├── mode heure + today → 24 barres réelles
  ├── mode heure + week → 24 barres, moyennes journalières
  ├── mode jour + today → 7 barres, seul le jour courant non-nul
  ├── mode jour + week → 7 barres, totaux sur 7 jours
  ├── mode jour + month → 7 barres, moyennes sur 4 semaines
  └── Vérifier EXPLAIN sur la requête SQL (doit utiliser IDX_msg_trafic_hour/dow)
```

**Durée totale estimée : ~5h**

---

## 6. Fichiers créés / modifiés — récapitulatif

### Backend

| Fichier | Action | Détail |
|---|---|---|
| `src/database/migrations/AddTrafficGroupingIndexes1748995200001.ts` | **CRÉER** | 3 index + 2 colonnes générées |
| `src/whatsapp_message/entities/whatsapp_message.entity.ts` | Modifier | +`hourOfDay`, +`dayOfWeekN` |
| `src/metriques/dto/create-metrique.dto.ts` | Modifier | +`TraficPointDto`, +`TraficResponseDto` |
| `src/metriques/metriques.service.ts` | Modifier | `getTraficHoraire()` refactoré |
| `src/metriques/metriques.controller.ts` | Modifier | +`@Query('granularite')` |

### Frontend

| Fichier | Action | Détail |
|---|---|---|
| `admin/src/app/lib/definitions.ts` | Modifier | `TraficPoint`, `TraficResponse`, alias |
| `admin/src/app/lib/api.ts` | Modifier | +`granularite` param |
| `admin/src/app/ui/MessageTrafficView.tsx` | Modifier | toggle + adapter barChart + TopHeures |

**Total : 2 créés + 6 modifiés**

---

## 7. Gains de performance estimés

| Scénario | Avant (sans index) | Après (avec index) | Gain |
|---|---|---|---|
| 1M rows, `today` (24h) | ~50ms | ~8ms | **-84%** |
| 10M rows, `today` | ~350ms | ~25ms | **-93%** |
| 10M rows, `week` (7j) | ~1 200ms | ~80ms | **-93%** |
| 50M rows, `month` (30j) | ~8s | ~350ms | **-96%** |
| 100M rows, `year` | >30s | ~1.5s | **-95%** |

> Estimations basées sur les gains typiques de l'index couvrant + colonnes générées
> en InnoDB MySQL 8.0. Valeurs à valider avec `EXPLAIN ANALYZE` en production.

### Requête `EXPLAIN` attendue après migration

```sql
EXPLAIN
SELECT hour_of_day, COUNT(*), SUM(direction='IN'), SUM(direction='OUT')
FROM whatsapp_message
WHERE deletedAt IS NULL AND createdAt >= '2026-05-25' AND createdAt <= '2026-05-25 23:59:59'
GROUP BY hour_of_day;
```

**Résultat attendu :**
```
type  : range
key   : IDX_msg_trafic_hour
Extra : Using index   ← ✅ index-only scan, 0 row lookup
```

---

## 8. Règle : mode `jour` + période `today`

Quand `granularite=jour` et `selectedPeriod=today`, seul le jour courant
(ex: mercredi) aura des valeurs non-nulles. Les 6 autres barres afficheront `0`.

**Comportement attendu :** c'est correct et informatif — cela montre visuellement
que la journée en cours représente 100% de l'activité de la semaine courante.

**Recommandation UI :** En mode `jour`, pousser l'utilisateur à sélectionner `week`
ou une plage personnalisée pour que les 7 barres soient significatives. Afficher
un hint discret si `selectedPeriod=today` et `granularite=jour` :

```tsx
{granularite === 'jour' && selectedPeriod === 'today' && (
  <p className="text-xs text-blue-500 bg-blue-50 rounded px-2 py-1 inline-flex items-center gap-1">
    <Info size={12} />
    Sélectionnez "7 derniers jours" pour voir les 7 barres actives
  </p>
)}
```

---

## 9. Évolutions futures (hors scope v2)

- **Filtres secondaires** : par canal (`channelId`) ou par poste (`posteId`) → ajouter WHERE + indexes composites
- **Heatmap 7j × 24h** : matrice jours/heures pour visualiser les patterns complets
- **Export CSV** des points (heure ou jour)
- **Snapshot cache** pour `trafic-horaire` dans `AnalyticsSnapshotService`
  (TTL 5min pour `today`, 30min pour `week`)

---

*Plan rédigé le 2026-05-25 — dépend de `PLAN_TRAFIC_MESSAGES.md` (v1)*
