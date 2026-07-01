# Plan d'implémentation — BreakPrompt + Planning commercial

**Date** : 2026-07-01  
**Branche** : `production`  
**Périmètre** : Frontend commercial (`front/`) + Backend NestJS (`message_whatsapp/`)

---

## Contexte

Deux fonctionnalités à livrer :

1. **Corriger le BreakPromptModal** — le cycle Socket fonctionne mais 3 bugs empêchent le bon fonctionnement (timezone, persistance, audio silencieux).
2. **Vue planning personnel** — le commercial doit pouvoir consulter son planning du jour (absence, créneau) depuis l'interface commercial. Le backend admin existe déjà ; il manque des endpoints `AuthGuard jwt` + tout le côté frontend.

---

## Partie 1 — Correction BreakPromptModal

### Diagnostic des bugs

#### Bug 1 — Timezone mismatch `expiresAt` (CRITIQUE)

**Fichier** : `message_whatsapp/src/commercial-group/break-schedule-engine.service.ts`

```typescript
// Code actuel — INCORRECT
buildExpiresAt(todayStr: string, endHHmm: string): string {
  return `${todayStr}T${endHHmm}:00.000Z`;  // ← .000Z = UTC, mais todayStr = locale
}
```

`todayStr` est construit via `getTodayLocalString(tz)` (date locale du commercial), mais le suffixe `.000Z` dit à JavaScript que c'est UTC. Résultat : le countdown est décalé d'1h à 4h selon la timezone du serveur.

**Fix** : Construire un vrai timestamp UTC à partir de la date locale + timezone.

```typescript
// Remplacer buildExpiresAt par :
buildExpiresAt(todayStr: string, endHHmm: string, tz: string): string {
  // "2026-07-01" + "14:30" + "Europe/Paris" → ISO UTC correct
  const [h, m] = endHHmm.split(':').map(Number);
  const [year, month, day] = todayStr.split('-').map(Number);
  // Construire via Intl pour respecter le DST
  const dt = new Date(Date.UTC(year, month - 1, day, h, m, 0));
  // Ajuster pour la timezone (offset en minutes)
  const offsetMs = getTimezoneOffsetMs(tz, dt);
  return new Date(dt.getTime() - offsetMs).toISOString();
}

// Helper timezone offset
function getTimezoneOffsetMs(tz: string, date: Date): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  return utcDate.getTime() - tzDate.getTime();
}
```

> Si le projet n'a pas de timezone configurée par commercial (champ absent), utiliser `Europe/Paris` comme valeur par défaut et documenter l'hypothèse.

---

#### Bug 2 — `lastPromptSentAt` Map non persistée (MOYEN)

**Fichier** : `message_whatsapp/src/commercial-group/break-schedule-engine.service.ts`

```typescript
// Map in-memory → reset à chaque restart NestJS
private readonly lastPromptSentAt = new Map<PromptKey, number>();
```

**Impact** : Si le backend redémarre en pleine journée (déploiement, crash), le cron renvoie immédiatement un prompt à tous les commerciaux connectés, même si la pause venait d'être affichée.

**Fix** : Ajouter une colonne `last_break_prompt_sent_at` sur `break_session` OU persister dans une table dédiée. Approche minimale : utiliser `break_session` existant.

```typescript
// Dans checkAndSendPrompts(), avant d'émettre :
const recentSession = await this.breakSessionRepo.findOne({
  where: {
    commercialId,
    breakScheduleId,
    createdAt: MoreThan(new Date(Date.now() - reminderIntervalMs)),
  },
});
if (recentSession) continue; // déjà envoyé récemment, skip
```

---

#### Bug 3 — Erreur audio avalée silencieusement (BAS)

**Fichier** : `front/src/hooks/useBreakPrompt.ts`

```typescript
// Actuel — erreur ignorée
audioRef.current.play().catch(() => {});
```

**Fix** : Logger en console.warn pour faciliter le debug (pas d'affichage UI nécessaire).

```typescript
audioRef.current.play().catch((err) => {
  console.warn('[BreakPrompt] Lecture audio bloquée (autoplay policy) :', err.message);
});
```

---

### Checklist Bug fixes

- [ ] **BE** : Corriger `buildExpiresAt` dans `break-schedule-engine.service.ts`
- [ ] **BE** : Ajouter filtre `break_session` dans `checkAndSendPrompts()` pour éviter le spam au restart
- [ ] **FE** : Remplacer `.catch(() => {})` par `.catch(warn)` dans `useBreakPrompt.ts`
- [ ] **TEST** : Vérifier le mode `?testBreak=1` dans `front/src/app/whatsapp/page.tsx:62` affiche bien le modal avec countdown correct

---

## Partie 2 — Vue planning personnel commercial

### Architecture cible

```
Commercial (JWT)
  → GET /commercial-self/planning/today          → planning du jour
  → GET /commercial-self/planning/:year/:month   → planning du mois (vue calendrier)

Frontend
  → hook usePlanningJour()                       → chargement du jour courant
  → PlanningVueCommercial (composant)            → calendrier mensuel + badge jour
  → Intégration dans whatsapp/page.tsx ou sidebar
```

---

### US-P1 — Backend : endpoints `AuthGuard jwt` pour le planning

**Fichier à créer** : `message_whatsapp/src/commercial-group/commercial-self-planning.controller.ts`

```typescript
@Controller('commercial-self/planning')
@UseGuards(AuthGuard('jwt'))
export class CommercialSelfPlanningController {
  constructor(private readonly planningService: CommercialPlanningService) {}

  // Jour courant
  @Get('today')
  async getPlanningToday(@Request() req: JwtRequest) {
    const today = new Date().toISOString().slice(0, 10);
    return this.planningService.findByCommercialAndDate(req.user.userId, today);
  }

  // Jour spécifique
  @Get('date/:date')
  async getPlanningByDate(
    @Param('date') date: string,
    @Request() req: JwtRequest,
  ) {
    return this.planningService.findByCommercialAndDate(req.user.userId, date);
  }

  // Vue mois (calendrier)
  @Get('month/:year/:month')
  async getPlanningMonth(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Request() req: JwtRequest,
  ) {
    return this.planningService.findMonthByCommercial(req.user.userId, year, month);
  }
}
```

**Méthode à ajouter dans `CommercialPlanningService`** :

```typescript
// Récupérer planning d'un commercial pour un mois donné (lecture seule)
async findMonthByCommercial(
  commercialId: string,
  year: number,
  month: number,
): Promise<CommercialPlanning[]> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10); // dernier jour du mois
  return this.planningRepo.find({
    where: {
      commercialId,
      date: Between(from, to),
      deletedAt: IsNull(),
    },
    order: { date: 'ASC' },
  });
}
```

**Enregistrer le controller dans `CommercialGroupModule`** :
```typescript
controllers: [...existingControllers, CommercialSelfPlanningController],
```

---

### US-P2 — Frontend : types + API client

**Fichier** : `front/src/lib/definitions.ts`

Ajouter à la fin :

```typescript
export interface CommercialPlanningEntry {
  id: string;
  date: string;                              // YYYY-MM-DD
  type: 'absence' | 'exceptional';
  timeSlot: 'full' | 'morning' | 'afternoon';
  reason: string | null;
  linkedCommercialId: string | null;         // ID remplaçant si applicable
}
```

**Fichier** : `front/src/lib/api.ts`

Ajouter les fonctions suivantes :

```typescript
// Planning du jour
export async function getPlanningToday(): Promise<CommercialPlanningEntry | null> {
  const res = await apiFetch('/commercial-self/planning/today');
  if (res.status === 404) return null;
  return handleResponse<CommercialPlanningEntry>(res);
}

// Planning par date
export async function getPlanningByDate(date: string): Promise<CommercialPlanningEntry | null> {
  const res = await apiFetch(`/commercial-self/planning/date/${date}`);
  if (res.status === 404) return null;
  return handleResponse<CommercialPlanningEntry>(res);
}

// Planning mensuel
export async function getPlanningMonth(
  year: number,
  month: number,
): Promise<CommercialPlanningEntry[]> {
  const res = await apiFetch(`/commercial-self/planning/month/${year}/${month}`);
  return handleResponse<CommercialPlanningEntry[]>(res);
}
```

---

### US-P3 — Frontend : hook + composants

#### Hook `usePlanningCommercial`

**Fichier à créer** : `front/src/hooks/usePlanningCommercial.ts`

```typescript
import { useState, useEffect } from 'react';
import { getPlanningToday, getPlanningMonth, CommercialPlanningEntry } from '@/lib/api';

export function usePlanningJour() {
  const [planning, setPlanning] = useState<CommercialPlanningEntry | null | 'loading'>('loading');

  useEffect(() => {
    getPlanningToday()
      .then(setPlanning)
      .catch(() => setPlanning(null));
  }, []);

  return { planning };
}

export function usePlanningMois(year: number, month: number) {
  const [entries, setEntries] = useState<CommercialPlanningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPlanningMonth(year, month)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [year, month]);

  return { entries, loading };
}
```

---

#### Composant — Badge absence du jour

**Fichier à créer** : `front/src/components/planning/PlanningBadgeJour.tsx`

Affiche un bandeau discret si le commercial est en absence ou en mission exceptionnelle aujourd'hui.

```tsx
import { usePlanningJour } from '@/hooks/usePlanningCommercial';

const SLOT_LABELS: Record<string, string> = {
  full: 'Journée complète',
  morning: 'Matin',
  afternoon: 'Après-midi',
};

export function PlanningBadgeJour() {
  const { planning } = usePlanningJour();

  if (planning === 'loading' || planning === null) return null;

  const label = planning.type === 'absence' ? 'Absent' : 'Mission exceptionnelle';
  const slot = SLOT_LABELS[planning.timeSlot] ?? '';

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-1 rounded-md">
      {label} — {slot}
      {planning.reason && <span className="ml-1 text-amber-600">({planning.reason})</span>}
    </div>
  );
}
```

---

#### Composant — Vue calendrier mensuel planning

**Fichier à créer** : `front/src/components/planning/PlanningVueCommercial.tsx`

Vue calendrier : grille mensuelle avec navigation mois précédent/suivant. Chaque jour coloré selon le type de planning.

```
┌──────────────────────────────────────────────────────┐
│  < Juin 2026                                    >    │
│  Lun  Mar  Mer  Jeu  Ven  Sam  Dim               │
│   1    2    3    4    5    6    7                │
│   8    9   10   11   12   13   14                │
│  15   16   17  [18]  19   20   21  ← aujourd'hui │
│  22   23   24   25   26   27   28                │
│  29   30                                         │
│                                                  │
│  Légende:  🟡 Absence   🔵 Exceptionnel           │
└──────────────────────────────────────────────────────┘
```

**Implémentation** :

```tsx
'use client';
import { useState } from 'react';
import { usePlanningMois } from '@/hooks/usePlanningCommercial';
import { formatDate } from '@/lib/dateUtils';

const TYPE_CLASSES: Record<string, string> = {
  absence: 'bg-amber-100 text-amber-800',
  exceptional: 'bg-blue-100 text-blue-800',
};

export function PlanningVueCommercial() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const { entries, loading } = usePlanningMois(year, month);

  const entryByDate = Object.fromEntries(entries.map((e) => [e.date, e]));

  function navigate(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=dim
  const daysInMonth = new Date(year, month, 0).getDate();
  // Ajuster pour semaine lundi-dimanche
  const offset = (firstDay + 6) % 7;

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 w-full max-w-sm">
      {/* Header mois */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 px-2">
          ‹
        </button>
        <span className="font-medium text-gray-800 capitalize">
          {new Date(year, month - 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => navigate(1)} className="text-gray-400 hover:text-gray-600 px-2">
          ›
        </button>
      </div>

      {/* En-têtes jours */}
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      {/* Grille jours */}
      {loading ? (
        <div className="text-center text-gray-400 py-4 text-sm">Chargement…</div>
      ) : (
        <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entry = entryByDate[dateStr];
            const isToday = dateStr === today.toISOString().slice(0, 10);
            return (
              <span
                key={i}
                title={entry ? `${entry.type} — ${entry.timeSlot}` : undefined}
                className={[
                  'rounded-full w-7 h-7 flex items-center justify-center mx-auto',
                  isToday ? 'ring-2 ring-gray-800 font-bold' : '',
                  entry ? TYPE_CLASSES[entry.type] : 'text-gray-700',
                ].join(' ')}
              >
                {day}
              </span>
            );
          })}
        </div>
      )}

      {/* Légende */}
      <div className="flex gap-3 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-amber-100 inline-block" /> Absence
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-100 inline-block" /> Exceptionnel
        </span>
      </div>
    </div>
  );
}
```

---

### US-P4 — Intégration dans la page commerciale

**Fichier** : `front/src/app/whatsapp/page.tsx`

Deux points d'intégration :

**4a. Badge absence en haut de page** (si commercial est absent aujourd'hui) :
```tsx
// Importer et placer dans le header
import { PlanningBadgeJour } from '@/components/planning/PlanningBadgeJour';

// Dans le JSX, sous le header principal :
<PlanningBadgeJour />
```

**4b. Vue calendrier dans une modale ou onglet "Mon planning"** :
- Ajouter un bouton "Mon planning" dans la sidebar ou le menu du commercial
- Ouvrir une modale/drawer avec `<PlanningVueCommercial />`
- Emplacement suggéré : à côté du bouton déconnexion dans le header commercial

---

## Corrections après vérification du code réel

### Angle mort 1 — `CommercialSelfPlanningController` existe déjà

Le fichier `message_whatsapp/src/commercial-group/commercial-self-planning.controller.ts` existe et est **déjà enregistré** dans `commercial-group.module.ts`. Il a uniquement `POST /planning/self/absence`. Il faut **ajouter les GET** dans ce fichier existant, pas en créer un nouveau.

Route actuelle : `/planning/self`  
→ Nouveaux endpoints : `GET /planning/self/today`, `GET /planning/self/date/:date`, `GET /planning/self/month/:year/:month`

### Angle mort 2 — `timeSlot` est `select: false` dans l'entité

```typescript
// commercial-planning.entity.ts:26
@Column({ name: 'time_slot', ..., select: false })
timeSlot: 'full' | 'morning' | 'afternoon';
```

Toute requête `find()` ou `findOne()` sans sélection explicite ne retourne **pas** `timeSlot`. Les nouvelles méthodes du service doivent forcer la sélection avec `addSelect('p.timeSlot')` dans un QueryBuilder.

### Angle mort 3 — Le module n'a PAS besoin d'être modifié

`CommercialSelfPlanningController` est déjà dans `controllers: [...]` ligne 49 du module. Aucune modification du module nécessaire.

### Angle mort 4 — Pas de `apiFetch` dans `api.ts`

Le pattern réel est `fetch(${API_BASE_URL}/..., { method, credentials: 'include' })` + `handleResponse<T>()`. Utiliser ce pattern directement — pas de wrapper `apiFetch`.

### Angle mort 5 — `CommercialPlanningService` : méthodes à ajouter

`findByDate()` et `findByMonth()` existent mais retournent TOUS les commerciaux avec leurs relations (lourd). Ajouter des méthodes légères sans relations inutiles :
- `findByCommercialAndDate(commercialId, date)` → `CommercialPlanning | null`
- `findByCommercialAndMonth(commercialId, year, month)` → `CommercialPlanning[]`

### Angle mort 6 — Cause réelle du BreakPrompt infonctionnel

Le cycle Socket est intact (event names synchronisés, modal rendu en ligne 194 de `whatsapp/page.tsx`, hook correctement câblé). Le prompt ne s'affiche pas car le **moteur évalue des conditions qui ne sont probablement pas remplies** :
1. Le commercial doit avoir un `subGroup` actif avec des `breakSchedules`
2. Le sous-groupe doit avoir un `parentGroupId` valide
3. L'heure actuelle doit être dans la plage `[startTime, endTime[`

Le bug `buildExpiresAt` (timezone) ne **bloque pas** l'affichage — il affiche juste un countdown erroné. C'est quand même à corriger.

---

## Ordre d'implémentation (corrigé)

```
Sprint A — Corrections BreakPrompt (1h)
  1. BE : Fix buildExpiresAt (timezone)
  2. FE : Fix audio catch silencieux

Sprint B — Backend planning self (1h)
  3. BE : Ajouter findByCommercialAndDate + findByCommercialAndMonth dans CommercialPlanningService
           (avec addSelect explicite de timeSlot)
  4. BE : Ajouter GET /today, /date/:date, /month/:year/:month dans CommercialSelfPlanningController

Sprint C — Frontend planning (3h)
  5. FE : Types CommercialPlanningEntry dans definitions.ts
  6. FE : Fonctions API dans api.ts (pattern fetch direct)
  7. FE : Hook usePlanningCommercial.ts
  8. FE : PlanningBadgeJour.tsx
  9. FE : PlanningVueCommercial.tsx
  10. FE : Intégration dans whatsapp/page.tsx
```

---

## Fichiers touchés (corrigé)

| Fichier | Action | Sprint |
|---------|--------|--------|
| `message_whatsapp/src/commercial-group/break-schedule-engine.service.ts` | Modifier `buildExpiresAt` | A |
| `front/src/hooks/useBreakPrompt.ts` | Modifier `.catch` audio | A |
| `message_whatsapp/src/commercial-group/commercial-planning.service.ts` | Ajouter 2 méthodes self (avec `addSelect timeSlot`) | B |
| `message_whatsapp/src/commercial-group/commercial-self-planning.controller.ts` | Ajouter 3 routes GET | B |
| `front/src/lib/definitions.ts` | Ajouter `CommercialPlanningEntry` | C |
| `front/src/lib/api.ts` | Ajouter 3 fonctions planning | C |
| `front/src/hooks/usePlanningCommercial.ts` | Créer | C |
| `front/src/components/planning/PlanningBadgeJour.tsx` | Créer | C |
| `front/src/components/planning/PlanningVueCommercial.tsx` | Créer | C |
| `front/src/app/whatsapp/page.tsx` | Intégrer badge + bouton planning | C |

---

## Points d'attention

- **`select: false` sur `timeSlot`** : utiliser `.addSelect('p.timeSlot')` dans les QueryBuilders self, sinon le champ est absent de la réponse.
- **AdminGuard vs AuthGuard** : Les endpoints existants `/commercial-groups/planning*` sont `AdminGuard`. Les nouveaux `GET /planning/self/*` doivent rester `AuthGuard('jwt')`.
- **Pas de N+1** : `findByCommercialAndMonth` retourne toutes les entrées en une seule requête `Between(from, to)`.
- **Timezone frontend** : Le calendrier compare des strings `YYYY-MM-DD` directement — ne pas passer par `new Date()` pour éviter le décalage UTC/locale.
- **`buildExpiresAt`** : La fix timezone s'applique uniquement si `APP_TIMEZONE` n'est pas UTC+0. Pour `Africa/Abidjan` (défaut), le bug est dormant mais la correction reste nécessaire pour d'autres timezones.
