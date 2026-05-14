# Plan d'implémentation — Mode de dispatch configurable (LEAST_LOADED / ROUND_ROBIN)

**Date :** 2026-05-14  
**Scope :** Backend NestJS + Admin React  
**Effort estimé :** ~3h  

---

## Contexte et objectif

### Mode actuel — Charge minimale (`LEAST_LOADED`)
Le `QueueService.getNextInQueue()` compte les conversations `ACTIF + EN_ATTENTE` par poste,
exclut ceux ayant atteint le quota (`CAPACITY_QUOTA_ACTIVE`, défaut 10), et sélectionne
celui avec le **moins de conversations actives**.  
Le poste sélectionné est ensuite déplacé en fin de queue (`moveToEndInternal()`).

### Nouveau mode — Rotation stricte (`ROUND_ROBIN`)
Chaque poste reçoit un message **à son tour**, quelle que soit sa charge.  
Aucun comptage de conversations. Aucun quota vérifié.  
Le premier de la queue reçoit, est déplacé en fin, le suivant prend sa place, etc.

### Où configurer
Onglet **"File d'attente"** du menu Dispatch → section "Mode de dispatch"  
(même endroit que la liste des postes en queue, pour cohérence opérationnelle).

---

## Architecture de la solution

```
dispatch_settings (table)
  └── + dispatch_mode VARCHAR(20) DEFAULT 'LEAST_LOADED'

DispatchSettings (entity)
  └── + dispatch_mode: 'LEAST_LOADED' | 'ROUND_ROBIN'

UpdateDispatchSettingsDto
  └── + dispatch_mode?: 'LEAST_LOADED' | 'ROUND_ROBIN'

DispatchSettingsService.DEFAULTS
  └── + dispatch_mode: 'LEAST_LOADED'

QueueService.getNextInQueue()
  ├── lit dispatch_mode depuis DispatchSettingsService
  ├── ROUND_ROBIN  → candidates[0] + moveToEnd (pas de comptage)
  └── LEAST_LOADED → logique existante inchangée

Admin QueueView (onglet "File d'attente")
  └── + DispatchModeSelector (radio, sauvegarde via updateDispatchSettings)
```

---

## Étapes détaillées

---

### Étape 1 — Migration BDD

**Fichier à créer :**  
`src/database/migrations/DispatchModeColumn1747267200001.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchModeColumn1747267200001 implements MigrationInterface {
  name = 'DispatchModeColumn1747267200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Vérifier si la colonne existe déjà (idempotent)
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'dispatch_settings'
         AND COLUMN_NAME = 'dispatch_mode'`,
    );
    if (parseInt(rows[0]?.cnt ?? '0', 10) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`dispatch_settings\`
         ADD COLUMN \`dispatch_mode\` VARCHAR(20) NOT NULL DEFAULT 'LEAST_LOADED'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dispatch_settings\` DROP COLUMN IF EXISTS \`dispatch_mode\``,
    );
  }
}
```

> **Note :** Le timestamp `1747267200001` correspond au 2026-05-14. Respecte la convention
> `NomClasse{timestamp13chiffres}`.

---

### Étape 2 — Entité `DispatchSettings`

**Fichier :** `src/dispatcher/entities/dispatch-settings.entity.ts`

Ajouter après la colonne `offline_reinject_cron` :

```typescript
@Column({
  name: 'dispatch_mode',
  type: 'varchar',
  length: 20,
  default: 'LEAST_LOADED',
})
dispatch_mode: 'LEAST_LOADED' | 'ROUND_ROBIN';
```

---

### Étape 3 — DTO `UpdateDispatchSettingsDto`

**Fichier :** `src/dispatcher/dto/update-dispatch-settings.dto.ts`

Ajouter les imports `IsIn` et le champ :

```typescript
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Dans la classe :
@IsOptional()
@IsIn(['LEAST_LOADED', 'ROUND_ROBIN'])
dispatch_mode?: 'LEAST_LOADED' | 'ROUND_ROBIN';
```

---

### Étape 4 — `DispatchSettingsService` — ajouter la valeur par défaut

**Fichier :** `src/dispatcher/services/dispatch-settings.service.ts`

Dans l'objet `DEFAULTS` (ligne ~8), ajouter :

```typescript
const DEFAULTS = {
  no_reply_reinject_interval_minutes: 5,
  read_only_check_interval_minutes: 10,
  offline_reinject_cron: '0 9 * * *',
  dispatch_mode: 'LEAST_LOADED' as const,   // ← ajouter
};
```

---

### Étape 5 — `QueueService` — logique conditionnelle

**Fichier :** `src/dispatcher/services/queue.service.ts`

#### 5a — Injecter `DispatchSettingsService`

Ajouter l'import et l'injection dans le constructeur :

```typescript
import { DispatchSettingsService } from './dispatch-settings.service';

// Dans le constructeur, après les autres injections :
@Optional()
private readonly dispatchSettingsService: DispatchSettingsService,
```

> `@Optional()` évite tout risque de dépendance circulaire au boot.

#### 5b — Modifier `getNextInQueue()`

Remplacer le commentaire `// ─── ÉTAPE 1 : stratégie normale` et la logique qui suit
par la version conditionnelle. Juste après la construction de `candidates` (ligne ~229) :

```typescript
// ─── Lire le mode de dispatch configuré ──────────────────────────────────
const settings = await this.dispatchSettingsService?.getSettings();
const dispatchMode = settings?.dispatch_mode ?? 'LEAST_LOADED';

// ─── ÉTAPE 1a : ROUND_ROBIN ───────────────────────────────────────────────
if (dispatchMode === 'ROUND_ROBIN') {
  const candidate = candidates[0]; // premier dans la queue = prochain à servir
  this.logger.debug(
    `ROUND_ROBIN → poste ${candidate.poste.name} (${candidate.poste_id})`,
  );
  await this.moveToEndInternal(candidate.poste_id);
  return candidate.poste;
}

// ─── ÉTAPE 1b : LEAST_LOADED (comportement actuel, inchangé) ─────────────
const quotaRaw = this.systemConfig
  ? await this.systemConfig.get('CAPACITY_QUOTA_ACTIVE')
  : null;
// … reste du code existant inchangé …
```

#### 5c — Fallback BDD (Étape 2 du code actuel)

Dans le fallback (queue vide), appliquer la même logique :

```typescript
// Après construction de allPostes et fallbackCountMap :

if (dispatchMode === 'ROUND_ROBIN') {
  this.logger.warn(`Fallback BDD ROUND_ROBIN → poste ${allPostes[0].name}`);
  return allPostes[0];
}

// Sinon : logique LEAST_LOADED existante (bestFallback)
let bestFallback = allPostes[0];
// … code existant inchangé …
```

> **Attention :** Pour que `dispatchMode` soit accessible dans le bloc fallback, déclarer
> la variable **avant** le bloc `if (candidates.length > 0)` existant.

---

### Étape 6 — Vérification du module dispatcher

**Fichier :** `src/dispatcher/dispatcher.module.ts`

Vérifier que `DispatchSettingsService` est bien dans les `providers` du module.
Si `QueueService` et `DispatchSettingsService` sont déjà dans le même module, aucun changement
n'est nécessaire — NestJS résout automatiquement les injections intra-module.

---

### Étape 7 — Types Admin

**Fichier :** `admin/src/app/lib/definitions.ts`

Dans l'interface `DispatchSettings` (ou où elle est définie), ajouter :

```typescript
export interface DispatchSettings {
  no_reply_reinject_interval_minutes: number;
  read_only_check_interval_minutes: number;
  offline_reinject_cron: string;
  dispatch_mode: 'LEAST_LOADED' | 'ROUND_ROBIN';  // ← ajouter
}
```

---

### Étape 8 — Composant UI dans `QueueView`

**Fichier :** `admin/src/app/modules/dispatch/components/QueueView.tsx`  
(ou `admin/src/app/ui/QueueView.tsx` selon l'import dans `DispatchTabsView.tsx`)

#### Comportement attendu
- Au chargement de l'onglet "File d'attente", charger `getDispatchSettings()`
- Afficher deux options radio en haut de la vue :
  - **Charge minimale** — poste avec le moins de conversations actives
  - **Rotation stricte** — chaque poste à son tour, quelle que soit sa charge
- Au changement de mode : appeler `updateDispatchSettings({ dispatch_mode: ... })` immédiatement
- Feedback visuel : badge vert "Mode actif" sur le mode sélectionné

#### Code à intégrer (section à ajouter en haut du JSX de `QueueView`)

```tsx
// État supplémentaire à ajouter dans QueueView :
const [dispatchMode, setDispatchMode] = useState<'LEAST_LOADED' | 'ROUND_ROBIN'>('LEAST_LOADED');
const [savingMode, setSavingMode] = useState(false);

// Charger le mode au montage (indépendamment du polling de la queue) :
useEffect(() => {
  getDispatchSettings()
    .then((s) => setDispatchMode(s.dispatch_mode ?? 'LEAST_LOADED'))
    .catch(() => {});
}, []);

const handleModeChange = async (mode: 'LEAST_LOADED' | 'ROUND_ROBIN') => {
  setSavingMode(true);
  try {
    await updateDispatchSettings({ dispatch_mode: mode });
    setDispatchMode(mode);
    addToast({ type: 'success', message: `Mode de dispatch mis à jour` });
  } catch {
    addToast({ type: 'error', message: 'Erreur lors de la sauvegarde du mode' });
  } finally {
    setSavingMode(false);
  }
};
```

#### Rendu du sélecteur (insérer avant la table des postes en queue)

```tsx
{/* Mode de dispatch */}
<div className="bg-white border border-gray-200 rounded-xl p-4">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-gray-800">Mode de dispatch</h3>
    {savingMode && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
  </div>
  <div className="grid grid-cols-2 gap-3">
    {([
      {
        value: 'LEAST_LOADED',
        label: 'Charge minimale',
        description: 'Le poste avec le moins de conversations actives reçoit le message en priorité.',
      },
      {
        value: 'ROUND_ROBIN',
        label: 'Rotation stricte',
        description: 'Chaque poste reçoit à son tour, quelle que soit sa charge actuelle.',
      },
    ] as const).map((opt) => (
      <button
        key={opt.value}
        onClick={() => void handleModeChange(opt.value)}
        disabled={savingMode}
        className={`text-left p-4 rounded-lg border-2 transition-colors ${
          dispatchMode === opt.value
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300 bg-white'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-900">{opt.label}</span>
          {dispatchMode === opt.value && (
            <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded-full">
              Actif
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">{opt.description}</p>
      </button>
    ))}
  </div>
</div>
```

> Les imports `Loader2` (lucide-react), `getDispatchSettings`, `updateDispatchSettings`
> sont déjà disponibles ou à ajouter depuis `dispatch.api.ts`.

---

## Ordre d'exécution recommandé

| # | Tâche | Fichier | Durée |
|---|-------|---------|-------|
| 1 | Migration BDD | `migrations/DispatchModeColumn1747267200001.ts` | 10 min |
| 2 | Entité TypeORM | `dispatch-settings.entity.ts` | 5 min |
| 3 | DTO validation | `update-dispatch-settings.dto.ts` | 5 min |
| 4 | DEFAULTS service | `dispatch-settings.service.ts` | 2 min |
| 5 | Logique QueueService | `queue.service.ts` | 20 min |
| 6 | Vérif module | `dispatcher.module.ts` | 5 min |
| 7 | Type Admin | `definitions.ts` | 5 min |
| 8 | UI QueueView | `QueueView.tsx` | 30 min |
| 9 | `npx tsc --noEmit` backend + admin | — | 5 min |

**Total estimé : ~90 min**

---

## Points d'attention

### Concurrence
`getNextInQueue()` est déjà protégé par un `Mutex` + verrou Redis distribué (`dispatcher:queue`).
L'ajout du `await dispatchSettingsService.getSettings()` est à l'intérieur du verrou →
pas de race condition possible entre la lecture du mode et l'attribution.

### Changement de mode en cours d'activité
- Passer de `LEAST_LOADED` → `ROUND_ROBIN` : le prochain message entrant utilise immédiatement
  le nouveau mode. Les conversations déjà attribuées ne bougent pas (règle du poste permanent).
- Passer de `ROUND_ROBIN` → `LEAST_LOADED` : idem, effet immédiat sur le prochain dispatch.

### Mode ROUND_ROBIN et quota
En rotation stricte, le quota `CAPACITY_QUOTA_ACTIVE` est **ignoré** délibérément
("quelle que soit sa charge"). L'admin qui active ce mode assume la responsabilité de la charge.
Un log `warn` est émis si le poste sélectionné dépasse le quota, pour visibilité dans les logs.

### Audit
Le changement de `dispatch_mode` passe par `updateSettings()` → tracé automatiquement dans
`dispatch_settings_audit` comme n'importe quel autre paramètre.

### Fallback BDD (queue vide)
En `ROUND_ROBIN`, le fallback retourne `allPostes[0]` (premier poste actif en base, ordre non garanti).
Ce cas est rare (queue vide = démarrage ou reset forcé). Si la garantie d'ordre est critique
dans ce cas, l'amélioration peut être faite dans un second temps.

---

## Résultat attendu après implémentation

| Scenario | LEAST_LOADED | ROUND_ROBIN |
|----------|-------------|-------------|
| 3 postes, charges 2/5/8 | Poste A (2 conv) reçoit | Poste A (prochain dans queue) reçoit |
| Poste A saturé (quota=10) | Poste A exclu, Poste B reçoit | Poste A reçoit quand même |
| Changement de mode | Effectif dès le message suivant | Effectif dès le message suivant |
| Audit du changement | Tracé dans dispatch_settings_audit | Tracé dans dispatch_settings_audit |
