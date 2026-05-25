# Plan d'implémentation — Onglet « Trafic Messages »

> **Branche :** `production`  
> **Date de rédaction :** 2026-05-25  
> **Priorité :** P1 — Sprint prochain  
> **Statut :** 📋 À implémenter

---

## 1. Contexte & Objectif

### Besoin fonctionnel
Ajouter un nouvel onglet **« Trafic Messages »** dans le groupe de navigation
*Conversations* du dashboard admin. Cette vue permettra de :

1. **Visualiser** le trafic entrant/sortant heure par heure sur 24h via un diagramme
   en barres groupées.
2. **Filtrer** la période analysée (aujourd'hui / 7j / 30j / plage personnalisée) —
   en intégrant le **filtre global** du dashboard.
3. **Comprendre** les KPIs de volume au travers de **cartes métriques** : moyenne
   par minute, par heure, par jour, heure de pic, ratio IN/OUT, répartition
   matin/aprem/soir/nuit, etc.

### Contrainte clé
Le **filtre global** du dashboard (`selectedPeriod`, `dateFrom`, `dateTo`) est géré
dans `page.tsx` et doit être propagé en props à `MessageTrafficView` exactement
comme il l'est pour `ChannelStatsView`, `OverviewView`, etc.

---

## 2. Analyse de l'existant

### 2.1 Frontend — ce qui existe déjà

| Fichier | Rôle | Pertinence |
|---|---|---|
| `admin/src/app/dashboard/commercial/page.tsx` | Orchestre toutes les vues + filtre global | **Modifier** |
| `admin/src/app/lib/definitions.ts` | Type `ViewMode` union | **Modifier** |
| `admin/src/app/data/admin-data.ts` | Navigation groups | **Modifier** |
| `admin/src/app/lib/api.ts` | Fonctions fetch | **Modifier** |
| `admin/src/app/ui/AnalyticsView.tsx` | Pattern KpiCard + BarChart Recharts | Référence style |
| `admin/src/app/ui/ChannelStatsView.tsx` | Pattern onglets + filtre local | Référence style |

**Bibliothèques déjà installées :**
- `recharts@3.7.0` ✅ (BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer)
- `lucide-react@0.563.0` ✅
- `tailwindcss@4` ✅

### 2.2 Backend — ce qui existe déjà

| Endpoint | Données retournées | Granularité |
|---|---|---|
| `GET /api/metriques/globales?periode=` | totalMessages, IN, OUT, taux, temps… | Agrégé |
| `GET /api/metriques/performance-temporelle?jours=` | nb_messages, IN, OUT par **DATE** | **Journalier** |
| `GET /api/metriques/overview?periode=&section=` | Snapshot complet ou section | Agrégé/journalier |

### 2.3 Gap identifié — ce qui MANQUE

> **Le service `getPerformanceTemporelle` agrège par `DATE(createdAt)` (jour).
> Il n'existe aucun endpoint qui agrège par `HOUR(createdAt)` pour produire
> les 24 points du diagramme horaire.**

**Solution :** Créer un nouveau endpoint dédié :
```
GET /api/metriques/trafic-horaire
  ?periode=today|week|month|year
  &dateFrom=YYYY-MM-DD   (optionnel)
  &dateTo=YYYY-MM-DD     (optionnel)
```

---

## 3. Architecture cible

```
┌─────────────────────────────────────────────────────┐
│             dashboard/commercial/page.tsx           │
│  selectedPeriod, dateFrom, dateTo (filtre global)   │
│                     │                               │
│   renderContent() case 'message-traffic':           │
│   <MessageTrafficView                               │
│       selectedPeriod={selectedPeriod}               │
│       dateFrom={dateFrom}                           │
│       dateTo={dateTo}                               │
│   />                                                │
└─────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│          MessageTrafficView.tsx (NOUVEAU)            │
│                                                     │
│  ┌─ FilterBar ──────────────────────────────────┐   │
│  │  Sync automatique avec le filtre global      │   │
│  │  + override local si besoin                  │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─ KPI Grid (8 cartes) ────────────────────────┐   │
│  │  Total │ Entrants │ Sortants │ Moy/min        │   │
│  │  Moy/h │ Pic      │ Ratio    │ Heures actives │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─ BarChart Recharts (24 barres) ──────────────┐   │
│  │  X : 00h 01h … 23h                           │   │
│  │  Bar verte : messages_in                     │   │
│  │  Bar bleue : messages_out                    │   │
│  │  Tooltip : total / IN / OUT / % du total     │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─ Section Répartition ────────────────────────┐   │
│  │  Matin (6h-12h) │ Après-midi │ Soir │ Nuit   │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─ Table Top 5 heures de pic ──────────────────┐   │
│  │  Heure │ Total │ Entrants │ Sortants │ % jour │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                      │ fetch
                      ▼
┌─────────────────────────────────────────────────────┐
│    GET /api/metriques/trafic-horaire                │
│    NestJS → MetriquesController → MetriquesService  │
│                                                     │
│  SQL: GROUP BY HOUR(createdAt) → 24 points          │
│  + calcul statistiques agrégées                     │
└─────────────────────────────────────────────────────┘
```

---

## 4. User Stories

### US-1 — Backend : endpoint `trafic-horaire` [BACKEND]

**Titre :** Créer l'endpoint `GET /api/metriques/trafic-horaire`

**Fichiers à modifier :**
1. `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
2. `message_whatsapp/src/metriques/metriques.service.ts`
3. `message_whatsapp/src/metriques/metriques.controller.ts`

**Détail d'implémentation :**

#### 4.1.1 DTOs à ajouter dans `create-metrique.dto.ts`

```typescript
/** Un point horaire dans le diagramme 24h */
export class TraficHorairePointDto {
  @ApiProperty({ description: 'Heure (0–23)' })
  heure: number;

  @ApiProperty({ description: "Label affiché ('00:00', '01:00', …)" })
  heureLabel: string;

  @ApiProperty({ description: 'Total messages' })
  total: number;

  @ApiProperty({ description: 'Messages entrants (direction=IN)' })
  messages_in: number;

  @ApiProperty({ description: 'Messages sortants (direction=OUT)' })
  messages_out: number;

  @ApiProperty({ description: 'Moyenne par jour (mode multi-jours)' })
  avg_par_jour: number;
}

/** Statistiques calculées sur la période */
export class TraficStatistiquesDto {
  // ─── Volumes ───────────────────────────────────────────────────────────────
  total: number;
  messages_in: number;
  messages_out: number;

  // ─── Moyennes ──────────────────────────────────────────────────────────────
  moy_par_minute: number;   // total / durée en minutes
  moy_par_heure: number;    // total / nb_heures_actives (min 1)
  moy_par_jour: number;     // total / nb_jours_distincts (min 1)

  // ─── Pics & creux ──────────────────────────────────────────────────────────
  heure_pic: number;        // heure (0-23) avec le maximum de messages
  messages_pic: number;     // nb messages à l'heure de pic
  heure_creux: number;      // heure avec le minimum (parmi heures actives)
  heure_pic_in: number;     // heure de pic entrants

  // ─── Ratios ────────────────────────────────────────────────────────────────
  ratio_in_out: number;     // messages_in / messages_out (2 décimales)
  pourcentage_in: number;   // % entrants sur total
  pourcentage_out: number;  // % sortants sur total

  // ─── Répartition journée ───────────────────────────────────────────────────
  concentration_matin: number;  // % messages 06h–12h
  concentration_aprem: number;  // % messages 12h–18h
  concentration_soir: number;   // % messages 18h–24h
  concentration_nuit: number;   // % messages 00h–06h

  // ─── Infos période ─────────────────────────────────────────────────────────
  heures_actives: number;   // nb d'heures ayant ≥ 1 message
  nb_jours: number;         // nb de jours distincts dans la période
  mode: 'journee' | 'periode'; // 'journee' si dateStart=dateEnd, sinon 'periode'
}

/** Réponse complète de l'endpoint trafic-horaire */
export class TraficHoraireResponseDto {
  horaire: TraficHorairePointDto[];      // 24 points (0–23)
  statistiques: TraficStatistiquesDto;
  meta: {
    periode: string;
    dateStart: string;
    dateEnd: string;
    jours: number;
  };
}
```

#### 4.1.2 Méthode `getTraficHoraire()` dans `metriques.service.ts`

```typescript
async getTraficHoraire(
  periode = 'today',
  dateFrom?: string,
  dateTo?: string,
): Promise<TraficHoraireResponseDto> {
  const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

  // ── Q1 : agrégation par heure ─────────────────────────────────────────────
  const rows = await this.messageRepository
    .createQueryBuilder('message')
    .select('HOUR(message.createdAt)', 'heure')
    .addSelect('COUNT(*)', 'total')
    .addSelect('SUM(CASE WHEN message.direction = "IN"  THEN 1 ELSE 0 END)', 'messages_in')
    .addSelect('SUM(CASE WHEN message.direction = "OUT" THEN 1 ELSE 0 END)', 'messages_out')
    .addSelect('COUNT(DISTINCT DATE(message.createdAt))', 'nb_jours')
    .where('message.deletedAt IS NULL')
    .andWhere('message.createdAt >= :dateStart', { dateStart })
    .andWhere('message.createdAt <= :dateEnd', { dateEnd })
    .groupBy('HOUR(message.createdAt)')
    .orderBy('heure', 'ASC')
    .getRawMany();

  // ── Q2 : nb de jours distincts global (dénominateur cohérent pour avg_par_jour) ──
  // ⚠️ IMPORTANT : ne pas utiliser COUNT(DISTINCT DATE) par heure car les heures en
  // bordure de période auraient moins de jours que le centre, faussant la moyenne.
  // Ex : plage mer 15h → ven 10h → l'heure 14 n'existe que sur 1 jour (mer) mais
  // se diviserait par 3 si on prenait le max des heures. Ici on compte globalement.
  const joursResult = await this.messageRepository
    .createQueryBuilder('m')
    .select('COUNT(DISTINCT DATE(m.createdAt))', 'nb_jours')
    .where('m.deletedAt IS NULL')
    .andWhere('m.createdAt >= :dateStart', { dateStart })
    .andWhere('m.createdAt <= :dateEnd', { dateEnd })
    .getRawOne();

  const nbJoursGlobal = parseInt(joursResult?.nb_jours) || 1;

  // ── Construire les 24 points (remplir les heures sans données avec 0) ──────
  const dataMap = new Map<number, { total: number; in: number; out: number }>();

  for (const row of rows) {
    const h = parseInt(row.heure);
    dataMap.set(h, {
      total: parseInt(row.total)        || 0,
      in:    parseInt(row.messages_in)  || 0,
      out:   parseInt(row.messages_out) || 0,
    });
  }

  const horaire: TraficHorairePointDto[] = Array.from({ length: 24 }, (_, h) => {
    const d = dataMap.get(h) ?? { total: 0, in: 0, out: 0 };
    return {
      heure:        h,
      heureLabel:   `${String(h).padStart(2, '0')}:00`,
      total:        d.total,
      messages_in:  d.in,
      messages_out: d.out,
      // avg_par_jour : significatif uniquement en mode multi-jours
      avg_par_jour: nbJoursGlobal > 1
        ? Math.round((d.total / nbJoursGlobal) * 10) / 10
        : d.total,
    };
  });

  // ── Calcul statistiques ───────────────────────────────────────────────────
  const totalMsg  = horaire.reduce((s, h) => s + h.total, 0);
  const totalIn   = horaire.reduce((s, h) => s + h.messages_in, 0);
  const totalOut  = horaire.reduce((s, h) => s + h.messages_out, 0);
  const heuresActives = horaire.filter(h => h.total > 0);
  const nbHeuresActives = heuresActives.length || 1;

  // Durée de la période en minutes (pour moy/minute)
  const dureeMs = dateEnd.getTime() - dateStart.getTime();
  const dureeMins = Math.max(1, Math.round(dureeMs / 60000));

  // Pic et creux
  const picHoraire = horaire.reduce((max, h) => h.total > max.total ? h : max, horaire[0]);
  const picInHoraire = horaire.reduce((max, h) => h.messages_in > max.messages_in ? h : max, horaire[0]);
  const creuxHoraire = heuresActives.length > 0
    ? heuresActives.reduce((min, h) => h.total < min.total ? h : min, heuresActives[0])
    : horaire[0];

  // Répartitions (nuit:0-5, matin:6-11, aprem:12-17, soir:18-23)
  const tranche = (a: number, b: number) =>
    horaire.slice(a, b + 1).reduce((s, h) => s + h.total, 0);
  const tNuit  = tranche(0, 5);
  const tMatin = tranche(6, 11);
  const tAprem = tranche(12, 17);
  const tSoir  = tranche(18, 23);
  const pct = (v: number) => totalMsg > 0 ? Math.round((v / totalMsg) * 100) : 0;

  const isSameDay = dateStart.toDateString() === dateEnd.toDateString();

  const statistiques: TraficStatistiquesDto = {
    total:        totalMsg,
    messages_in:  totalIn,
    messages_out: totalOut,
    moy_par_minute: Math.round((totalMsg / dureeMins) * 100) / 100,
    moy_par_heure:  Math.round((totalMsg / nbHeuresActives) * 10) / 10,
    moy_par_jour:   Math.round((totalMsg / nbJoursGlobal) * 10) / 10,
    heure_pic:      picHoraire.heure,
    messages_pic:   picHoraire.total,
    heure_creux:    creuxHoraire.heure,
    heure_pic_in:   picInHoraire.heure,
    ratio_in_out:   totalOut > 0 ? Math.round((totalIn / totalOut) * 100) / 100 : 0,
    pourcentage_in:  pct(totalIn),
    pourcentage_out: pct(totalOut),
    concentration_nuit:  pct(tNuit),
    concentration_matin: pct(tMatin),
    concentration_aprem: pct(tAprem),
    concentration_soir:  pct(tSoir),
    heures_actives: nbHeuresActives,
    nb_jours:       nbJoursGlobal,
    mode:           isSameDay ? 'journee' : 'periode',
  };

  return {
    horaire,
    statistiques,
    meta: {
      periode,
      dateStart: dateStart.toISOString(),
      dateEnd:   dateEnd.toISOString(),
      jours:     nbJoursGlobal,
    },
  };
}
```

#### 4.1.3 Route à ajouter dans `metriques.controller.ts`

```typescript
@Get('trafic-horaire')
@ApiOperation({ summary: 'Trafic messages par heure (24h)' })
@ApiResponse({ status: 200, type: TraficHoraireResponseDto })
async getTraficHoraire(
  @Query('periode') periode: string = 'today',
  @Query('dateFrom') dateFrom?: string,
  @Query('dateTo')   dateTo?: string,
): Promise<TraficHoraireResponseDto> {
  return this.metriquesService.getTraficHoraire(periode, dateFrom, dateTo);
}
```

> **Note :** Placer cette route AVANT `@Get('overview')` pour éviter les collisions
> de paramètres dans NestJS.

---

### US-2 — Frontend : Types & Navigation [FRONTEND]

**Fichiers à modifier :**

#### 4.2.1 `admin/src/app/lib/definitions.ts`

Ajouter `'message-traffic'` dans le type `ViewMode` :

```typescript
export type ViewMode =
  | 'overview'
  | 'commerciaux'
  | 'performance'
  | 'analytics'
  | 'messages'
  | 'message-traffic'   // ← NOUVEAU
  | 'clients'
  // … reste inchangé
```

Ajouter les types TypeScript côté frontend :

```typescript
/** Un point horaire dans le diagramme 24h */
export type TraficHorairePoint = {
  heure: number;
  heureLabel: string;
  total: number;
  messages_in: number;
  messages_out: number;
  avg_par_jour: number;
};

/** Statistiques calculées sur la période */
export type TraficStatistiques = {
  total: number;
  messages_in: number;
  messages_out: number;
  moy_par_minute: number;
  moy_par_heure: number;
  moy_par_jour: number;
  heure_pic: number;
  messages_pic: number;
  heure_creux: number;
  heure_pic_in: number;
  ratio_in_out: number;
  pourcentage_in: number;
  pourcentage_out: number;
  concentration_matin: number;
  concentration_aprem: number;
  concentration_soir: number;
  concentration_nuit: number;
  heures_actives: number;
  nb_jours: number;
  mode: 'journee' | 'periode';
};

/** Réponse complète de l'endpoint trafic-horaire */
export type TraficHoraireResponse = {
  horaire: TraficHorairePoint[];
  statistiques: TraficStatistiques;
  meta: {
    periode: string;
    dateStart: string;
    dateEnd: string;
    jours: number;
  };
};
```

#### 4.2.2 `admin/src/app/data/admin-data.ts`

Ajouter `BarChart2` dans les imports et un item dans le groupe *Conversations* :

```typescript
import { ..., BarChart2 } from 'lucide-react';

// Dans le groupe 'Conversations' :
{ id: 'message-traffic', name: 'Trafic messages', icon: BarChart2, badge: null },
```

> **Position recommandée :** juste après `{ id: 'messages', … }`.
>
> **Pourquoi `BarChart2` et non `Activity` ?**  
> `Activity` affiche une sinusoïdale (évoque un ECG / monitoring réseau).  
> `BarChart2` affiche un histogramme en barres — cohérent visuellement avec le
> diagramme 24h que l'utilisateur va voir dans la page.

---

### US-3 — Frontend : Fonction API `getTraficHoraire` [FRONTEND]

**Fichier :** `admin/src/app/lib/api.ts`

Ajouter en fin de fichier (avant la dernière ligne si elle existe) :

```typescript
/**
 * Récupère le trafic messages agrégé par heure (diagramme 24h)
 */
export async function getTraficHoraire(
  periode = 'today',
  dateFrom?: string,
  dateTo?: string,
): Promise<TraficHoraireResponse> {
  const params = new URLSearchParams({ periode });
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo)   params.set('dateTo', dateTo);
  const response = await fetch(
    `${API_BASE_URL}/api/metriques/trafic-horaire?${params.toString()}`,
    { method: 'GET', credentials: 'include' },
  );
  return handleResponse<TraficHoraireResponse>(response);
}
```

---

### US-4 — Frontend : Composant `MessageTrafficView.tsx` [FRONTEND]

**Fichier à créer :** `admin/src/app/ui/MessageTrafficView.tsx`

#### 4.4.1 Props

```typescript
interface MessageTrafficViewProps {
  selectedPeriod: string;   // filtre global propagé par page.tsx
  dateFrom?: string;        // filtre global
  dateTo?: string;          // filtre global
}
```

#### 4.4.0 Imports à déclarer dans `MessageTrafficView.tsx`

```typescript
"use client";
import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  RefreshCw, MessageCircle, ArrowDownLeft, ArrowUpRight,
  Zap, Clock, CalendarDays, TrendingUp, ArrowLeftRight,
  Info,           // ← badge amber mode période
  Radio,          // ← icône badge "Live" dans le header
} from 'lucide-react';
import { getTraficHoraire } from '@/app/lib/api';
import { TraficHoraireResponse, TraficHorairePoint, TraficStatistiques } from '@/app/lib/definitions';
import { formatRelativeDate } from '@/app/lib/dateUtils';
import { Spinner } from '@/app/ui/Spinner';   // composant existant (utilisé dans AnalyticsView)
```

> `Info` est utilisé dans le badge amber du graphique.
> `Radio` est utilisé dans le badge "Live" du header (mode today).
> Les deux doivent figurer dans les imports ou le compilateur TypeScript lèvera une erreur.

#### 4.4.0b Sous-composant `PageHeader` (local au fichier)

> `PageHeader` **n'existe pas** dans le projet comme composant partagé — chaque vue
> crée son header inline. Il est défini ici comme sous-composant **local** dans
> `MessageTrafficView.tsx`, juste avant le composant principal.

```tsx
interface PageHeaderProps {
  onRefresh:   () => void;
  loading:     boolean;
  lastRefresh: Date | null;
  isLive:      boolean;   // true si selectedPeriod === 'today'
}

function PageHeader({ onRefresh, loading, lastRefresh, isLive }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Trafic Messages</h2>
          {/* Badge "Live" vert visible uniquement en mode today */}
          {isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-medium
                             text-green-700 bg-green-100 border border-green-200
                             rounded-full px-2 py-0.5">
              <Radio size={10} className="animate-pulse" />
              Live
            </span>
          )}
        </div>
        {/* Dernière mise à jour — essentiel pour l'utilisateur en mode Live */}
        {lastRefresh && (
          <p className="text-xs text-gray-400 mt-0.5">
            Mis à jour {formatRelativeDate(lastRefresh.toISOString())}
            {isLive && <span className="ml-1">(auto-refresh 90s)</span>}
          </p>
        )}
      </div>

      {/* Bouton refresh manuel */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium
                   text-gray-600 bg-white border border-gray-200 rounded-lg
                   hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Chargement…' : 'Actualiser'}
      </button>
    </div>
  );
}
```

#### 4.4.2 Structure du composant (pseudo-code)

```typescript
"use client";

/** Intervalle d'auto-refresh en millisecondes (90s).
 *  Actif UNIQUEMENT quand selectedPeriod === 'today'.
 *  Pour les autres périodes (week/month/year/custom), les données sont
 *  historiques et n'ont pas besoin d'être rafraîchies automatiquement. */
const AUTO_REFRESH_MS = 90_000;

export default function MessageTrafficView({ selectedPeriod, dateFrom, dateTo }) {

  // ── État ────────────────────────────────────────────────────────────────────
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState<TraficHoraireResponse | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ── Chargement ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTraficHoraire(selectedPeriod, dateFrom, dateTo);
      setData(result);
      setLastRefresh(new Date());
    } catch (e) {
      setError('Erreur lors du chargement du trafic messages');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, dateFrom, dateTo]);

  // Chargement initial + rechargement quand le filtre global change
  useEffect(() => { void load(); }, [load]);

  // ── Auto-refresh (période = aujourd'hui uniquement) ─────────────────────────
  // Déclenche un rechargement silencieux toutes les 90 secondes.
  // Le state `loading` n'est PAS remis à true pour éviter de faire clignoter
  // l'UI — on utilise une fonction séparée sans spinner visible.
  useEffect(() => {
    if (selectedPeriod !== 'today') return; // pas d'auto-refresh sur données historiques

    const silentRefresh = async () => {
      try {
        const result = await getTraficHoraire(selectedPeriod, dateFrom, dateTo);
        setData(result);
        setLastRefresh(new Date());
      } catch {
        // Echec silencieux — l'utilisateur peut forcer via le bouton refresh
      }
    };

    const interval = setInterval(silentRefresh, AUTO_REFRESH_MS);
    return () => clearInterval(interval); // cleanup au démontage ou changement de période
  }, [selectedPeriod, dateFrom, dateTo]);

  // ── Rendu ───────────────────────────────────────────────────────────────────
  // État vide : aucun message sur la période
  const isEmpty = data !== null && data.statistiques.total === 0;

  return (
    <div className="space-y-6">
      {/* En-tête : titre + badge auto-refresh + dernière MAJ + bouton refresh */}
      <PageHeader
        onRefresh={load}
        lastRefresh={lastRefresh}
        loading={loading}
        isLive={selectedPeriod === 'today'}  // affiche le badge "Live" vert
      />

      {/* État de chargement initial (première ouverture)
          Utilise <Spinner> existant (cohérent avec AnalyticsView, ChannelStatsView…)
          et non un div inline — le silent refresh ne remet pas loading=true,
          donc ce bloc n'apparaît qu'au tout premier montage. */}
      {loading && !data && (
        <div className="flex items-center justify-center h-48">
          <Spinner />
        </div>
      )}

      {/* État d'erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* État vide : données chargées mais aucun message sur la période */}
      {isEmpty && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-10
                        flex flex-col items-center justify-center text-center gap-3">
          <MessageCircle size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">Aucun message sur cette période</p>
          <p className="text-xs text-gray-400">
            Essayez une plage de dates différente ou vérifiez que les canaux sont actifs.
          </p>
        </div>
      )}

      {/* Contenu principal — masqué si vide */}
      {data && !isEmpty && (
        <>
          {/* Grille KPI */}
          <KpiGrid stats={data.statistiques} />

          {/* Graphique principal 24h */}
          <TrafficBarChart
            horaire={data.horaire}
            mode={data.statistiques.mode}
            nbJours={data.statistiques.nb_jours}
            selectedPeriod={selectedPeriod}
          />

          {/* Section répartition + top heures */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RepartitionJournee stats={data.statistiques} />
            <TopHeures horaire={data.horaire} total={data.statistiques.total} />
          </div>
        </>
      )}
    </div>
  );
}
```

#### 4.4.3 Contenu des 8 cartes KPI

| # | Titre | Valeur | Icône | Couleur | Sous-titre |
|---|---|---|---|---|---|
| 1 | Total messages | `stats.total` | `MessageCircle` | `bg-indigo-50 text-indigo-600` | Sur la période |
| 2 | Messages entrants | `stats.messages_in` | `ArrowDownLeft` | `bg-green-50 text-green-600` | `stats.pourcentage_in`% du total |
| 3 | Messages sortants | `stats.messages_out` | `ArrowUpRight` | `bg-blue-50 text-blue-600` | `stats.pourcentage_out`% du total |
| 4 | Moy. / minute | `stats.moy_par_minute` msg/min | `Zap` | `bg-yellow-50 text-yellow-600` | Sur la durée active |
| 5 | Moy. / heure | `stats.moy_par_heure` msg/h | `Clock` | `bg-orange-50 text-orange-600` | `stats.heures_actives`h actives |
| 6 | Moy. / jour | `stats.moy_par_jour` msg/j | `CalendarDays` | `bg-purple-50 text-purple-600` | Sur `stats.nb_jours` jour(s) |
| 7 | Heure de pic | `${stats.heure_pic}:00` | `TrendingUp` | `bg-rose-50 text-rose-600` | `stats.messages_pic` messages |
| 8 | Ratio IN/OUT | `stats.ratio_in_out` | `ArrowLeftRight` | `bg-teal-50 text-teal-600` | Entrants / Sortants |

#### 4.4.4 Graphique Recharts `TrafficBarChart`

**Props du sous-composant :**
```typescript
interface TrafficBarChartProps {
  horaire:        TraficHorairePoint[];
  mode:           'journee' | 'periode';
  nbJours:        number;
  selectedPeriod: string;
}
```

**Titre dynamique selon le mode** — c'est le point clé pour la clarté UX :
```tsx
function chartTitle(mode: 'journee' | 'periode', nbJours: number, selectedPeriod: string): string {
  if (mode === 'journee') return "Trafic heure par heure — aujourd'hui";
  const labels: Record<string, string> = {
    week:  '7 derniers jours',
    month: '30 derniers jours',
    year:  '12 derniers mois',
  };
  const label = labels[selectedPeriod] ?? `${nbJours} jours`;
  // ⚠️ Indiquer EXPLICITEMENT que ce sont des moyennes, pas des réels
  return `Moyenne horaire sur ${label}`;
}
```

**Sous-titre complémentaire :**
```tsx
{mode === 'periode' && (
  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 
                rounded px-2 py-1 inline-flex items-center gap-1 mt-1">
    <Info size={12} />
    Valeurs = moyenne de messages par heure sur {nbJours} jour{nbJours > 1 ? 's' : ''}
  </p>
)}
```

**Décision `dataKey` selon le mode — point clé d'implémentation :**

> En mode `periode`, les barres affichent les **moyennes par jour** et non les totaux
> bruts, pour rester cohérentes avec le titre "Moyenne horaire sur N jours".
> La transformation se fait côté frontend avant de passer `data` à Recharts :
> les `dataKey` restent `messages_in` / `messages_out` mais leurs valeurs sont
> remplacées par les moyennes — ainsi le tooltip et la légende restent identiques.

```tsx
// Transformation des données selon le mode
// journee  → valeurs brutes (réels du jour)
// periode  → valeurs divisées par nbJours (moyennes journalières)
const chartData = mode === 'periode'
  ? horaire.map(h => ({
      ...h,
      messages_in:  Math.round((h.messages_in  / nbJours) * 10) / 10,
      messages_out: Math.round((h.messages_out / nbJours) * 10) / 10,
    }))
  : horaire;
// ☝️ On réutilise les mêmes dataKey → pas de changement dans le <BarChart>
//    Le tooltip affichera déjà les bonnes valeurs moyennes en mode période.
```

**Rendu complet du composant :**
```tsx
function TrafficBarChart({ horaire, mode, nbJours, selectedPeriod }: TrafficBarChartProps) {
  // Transformer les données selon le mode (cf. décision dataKey ci-dessus)
  const chartData = mode === 'periode'
    ? horaire.map(h => ({
        ...h,
        messages_in:  Math.round((h.messages_in  / nbJours) * 10) / 10,
        messages_out: Math.round((h.messages_out / nbJours) * 10) / 10,
      }))
    : horaire;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {/* Titre adaptatif — critique pour ne pas tromper l'utilisateur */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-800">
          {chartTitle(mode, nbJours, selectedPeriod)}
        </h3>
        {mode === 'periode' && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200
                        rounded px-2 py-1 inline-flex items-center gap-1 mt-1">
            <Info size={12} />
            Valeurs = moyenne par jour sur {nbJours} jour{nbJours > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={chartData}   {/* ← chartData et non horaire directement */}
          margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="heureLabel"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            interval={1}
          />
          {/* allowDecimals :
              - journee → false  : valeurs réelles = entiers, évite "12.5 msg" sur l'axe
              - periode → true   : moyennes journalières = décimales souhaitables (ex: 8.3) */}
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            width={40}
            allowDecimals={mode !== 'journee'}
          />
          <Tooltip content={<CustomTooltip mode={mode} />} />
          <Legend />
          {/* dataKey identiques dans les deux modes — seules les valeurs changent */}
          <Bar dataKey="messages_in"  name="Entrants" fill="#10b981" radius={[3,3,0,0]} maxBarSize={28} />
          <Bar dataKey="messages_out" name="Sortants"  fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Custom Tooltip** (données enrichies, adapté selon le mode) :
```tsx
function CustomTooltip({ active, payload, label, mode }: {
  active?: boolean;
  payload?: any[];
  label?: string;
  mode: 'journee' | 'periode';
}) {
  if (!active || !payload?.length) return null;
  const inVal  = payload[0]?.value ?? 0;
  const outVal = payload[1]?.value ?? 0;
  const total  = inVal + outVal;
  // En mode période, préciser que les valeurs sont des moyennes
  const suffix = mode === 'periode' ? ' (moy/j)' : '';
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold text-gray-800 mb-2">{label}{suffix}</p>
      <p className="text-green-600">↙ Entrants : {inVal}</p>
      <p className="text-blue-600">↗ Sortants : {outVal}</p>
      <p className="text-gray-700 border-t mt-2 pt-2 font-medium">Total : {total}</p>
    </div>
  );
}
```

#### 4.4.5 Section `RepartitionJournee`

Affiche 4 barres de progression horizontales avec icônes :

```
🌙 Nuit    (00h–06h)  |████░░░░░░░|  12%   45 msg
🌅 Matin   (06h–12h)  |████████░░|  38%  142 msg
☀️ Après-midi (12h–18h) |██████████|  42%  157 msg
🌆 Soir    (18h–24h)  |████░░░░░░|   8%   30 msg
```

#### 4.4.6 Section `TopHeures`

Tableau des 5 heures avec le plus de messages :

```
┌────────────┬────────┬──────────┬──────────┬────────┐
│ Heure      │ Total  │ Entrants │ Sortants │ % jour │
├────────────┼────────┼──────────┼──────────┼────────┤
│ 🔥 14:00   │  82    │   51     │   31     │  22%   │
│    10:00   │  68    │   43     │   25     │  18%   │
│    16:00   │  61    │   38     │   23     │  16%   │
│    09:00   │  54    │   34     │   20     │  14%   │
│    11:00   │  49    │   30     │   19     │  13%   │
└────────────┴────────┴──────────┴──────────┴────────┘
```

---

### US-5 — Intégration dans `dashboard/commercial/page.tsx` [FRONTEND]

#### 4.5.1 Import

```typescript
import MessageTrafficView from '@/app/ui/MessageTrafficView';
```

#### 4.5.2 VALID_VIEWS

```typescript
const VALID_VIEWS: ViewMode[] = [
  'overview', 'commerciaux', 'performance', 'analytics', 'messages',
  'message-traffic',  // ← NOUVEAU
  'clients', 'rapports', 'postes', 'canaux', 'templates', 'automessages',
  'conversations', 'queue', 'dispatch', 'lecture-seule', 'crons',
  'observabilite', 'go_no_go', 'notifications', 'alert-config',
  'campaign-links', 'mediatheque', 'settings', 'channel-stats',
];
```

#### 4.5.3 renderContent()

Ajouter le case **avant** le `default` :

```typescript
case 'message-traffic':
  return (
    <MessageTrafficView
      selectedPeriod={selectedPeriod}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  );
```

---

## 5. Séquence d'implémentation recommandée

```
Étape 1 — Backend (US-1)                        ~2h
  ├── Ajouter DTOs dans create-metrique.dto.ts
  ├── Ajouter getTraficHoraire() dans metriques.service.ts
  │     ├── Q1 : agrégation par HOUR(createdAt)
  │     └── Q2 : COUNT(DISTINCT DATE) global (dénominateur avg_par_jour)
  └── Ajouter @Get('trafic-horaire') dans metriques.controller.ts

Étape 2 — Types & Navigation (US-2)             ~15min
  ├── definitions.ts : ajouter 'message-traffic' + 3 types TS
  └── admin-data.ts : ajouter item avec icône BarChart2

Étape 3 — API Frontend (US-3)                   ~15min
  └── api.ts : ajouter getTraficHoraire()

Étape 4 — Composant principal (US-4)            ~5h
  ├── Créer MessageTrafficView.tsx
  │     ├── Imports : RefreshCw, MessageCircle, Info, Radio, … (cf. §4.4.0)
  │     ├── Sous-composant PageHeader (local au fichier, cf. §4.4.0b)
  │     ├── Hook load() + useEffect filtre global
  │     ├── useEffect auto-refresh (setInterval 90s, today seulement)
  │     └── États loading/error/data + état vide (total === 0)
  ├── KpiGrid (8 cartes)
  ├── TrafficBarChart
  │     ├── Transformation chartData (moyennes si mode=periode)
  │     ├── Titre dynamique (journée vs moyenne sur Nj)
  │     ├── Badge amber <Info> "Valeurs = moyenne" en mode période
  │     └── Recharts BarChart (data={chartData})
  ├── CustomTooltip (suffix "(moy/j)" en mode période)
  ├── RepartitionJournee (4 barres de progression)
  └── TopHeures (tableau top 5)

Étape 5 — Intégration (US-5)                    ~10min
  └── page.tsx : import + VALID_VIEWS + case renderContent()

Étape 6 — Tests manuels                         ~45min
  ├── Tester periode=today → 24 barres réelles + badge "Live" + auto-refresh
  ├── Tester periode=week → titre "Moyenne horaire sur 7 derniers jours"
  │     └── Vérifier que les barres affichent des moyennes (pas les totaux bruts)
  ├── Tester plage custom 1 jour → mode=journee (pas de badge amber)
  ├── Tester plage custom multi-jours → mode=periode + badge amber
  ├── Tester période sans aucun message → affichage état vide (pas de NaN/0 bruts)
  ├── Vérifier synchronisation filtre global ↔ vue
  └── Vérifier nettoyage du setInterval au changement de période
```

**Durée totale estimée : ~8–9h**

> ⚠️ L'estimation initiale de 6h était optimiste. Le rendu propre de 5 sous-composants
> avec états loading/error, responsive Tailwind, et la logique auto-refresh/label dynamique
> prend réalistement 8 à 9h de développement soigné.

---

## 6. Règles d'intégration du filtre global

Le filtre global est géré **uniquement dans `page.tsx`** (Header → state →
propagation en props). La `MessageTrafficView` :

1. **Ne gère pas** son propre sélecteur de période (UX cohérente avec les autres vues)
2. **Recharge automatiquement** dès que `selectedPeriod`, `dateFrom` ou `dateTo`
   changent (via `useEffect([selectedPeriod, dateFrom, dateTo])`)
3. **Affiche** la période active dans l'en-tête de la vue (ex: "Aujourd'hui",
   "7 derniers jours", "20 mai → 25 mai")
4. **Auto-refresh silencieux** toutes les 90 secondes si et seulement si
   `selectedPeriod === 'today'` — le `setInterval` est nettoyé (`clearInterval`)
   automatiquement quand la période change ou que le composant se démonte

Comportement du graphique selon la période :

| Filtre global | Comportement du graphique |
|---|---|
| `today` | 24 barres réelles du jour en cours |
| `week` (7j) | 24 barres = moyenne de chaque heure sur les 7 derniers jours |
| `month` (30j) | 24 barres = moyenne de chaque heure sur les 30 derniers jours |
| `year` (365j) | 24 barres = moyenne de chaque heure sur l'année |
| Plage custom | 24 barres = totaux si 1 jour, moyennes si plusieurs jours |

Le label de mode (`statistiques.mode`) retourné par le backend indique
automatiquement si on est en mode "journée" (1 jour) ou "période" (plusieurs jours),
ce qui permet d'adapter les libellés dans l'interface.

---

## 7. Fichiers créés / modifiés — récapitulatif

### Backend

| Fichier | Action | Détail |
|---|---|---|
| `message_whatsapp/src/metriques/dto/create-metrique.dto.ts` | Modifier | +3 classes DTO |
| `message_whatsapp/src/metriques/metriques.service.ts` | Modifier | +méthode `getTraficHoraire()` (~80 lignes) |
| `message_whatsapp/src/metriques/metriques.controller.ts` | Modifier | +1 route `@Get('trafic-horaire')` |

### Frontend (Admin)

| Fichier | Action | Détail |
|---|---|---|
| `admin/src/app/lib/definitions.ts` | Modifier | +'message-traffic' dans ViewMode + 3 types |
| `admin/src/app/data/admin-data.ts` | Modifier | +1 item navigation Conversations |
| `admin/src/app/lib/api.ts` | Modifier | +1 fonction `getTraficHoraire()` |
| `admin/src/app/ui/MessageTrafficView.tsx` | **CRÉER** | Composant + sous-composants locaux (~480–520 lignes) |
| `admin/src/app/dashboard/commercial/page.tsx` | Modifier | +import, +VALID_VIEWS, +case renderContent |

**Total :** 4 fichiers modifiés + 1 créé (backend) ; 4 fichiers modifiés + 1 créé (frontend)

---

## 8. Dépendances & compatibilité

### Aucune nouvelle dépendance npm
- Recharts ✅ déjà installé (`recharts@3.7.0`)
- Lucide React ✅ déjà installé (`lucide-react@0.563.0`)
- Tailwind ✅ déjà installé

### Rétro-compatibilité
- Le nouveau endpoint n'impacte aucun endpoint existant
- Le type `ViewMode` est une union — l'ajout ne casse rien
- `VALID_VIEWS` est un tableau simple — l'ajout ne casse rien
- Le `switch` dans `renderContent()` a déjà un `default: return null` — safe

### Index MySQL existants utilisés
```sql
-- IDX_msg_analytics_time : whatsapp_message(createdAt)
-- IDX_msg_analytics_dir_time : whatsapp_message(direction, createdAt)
-- Ces deux index couvrent la requête GROUP BY HOUR(createdAt)
-- Pas de migration nécessaire
```

---

## 9. KPIs pertinents pour la prise de décision — justification

| KPI | Utilité métier |
|---|---|
| **Moy/minute** | Capacité requise des serveurs en pic |
| **Moy/heure** | Dimensionnement équipe commerciale |
| **Moy/jour** | Prévisions charge hebdomadaire |
| **Heure de pic** | Planification des pauses / renforts |
| **Ratio IN/OUT** | Détecte les files de messages sans réponse |
| **% entrants** | Mesure l'affluence client non sollicitée |
| **Concentration matin/aprem/soir** | Ajuste les horaires de présence commerciale |
| **Heures actives** | Détermine la plage d'activité réelle |
| **Heure de pic entrants** | Moment optimal pour affecter le plus de commerciaux |
| **Top 5 heures** | Revue rapide sans avoir à lire tout le graphique |

---

## 10. Évolutions futures (hors scope v1)

- **Filtres secondaires :** filtre par canal (`channelId`) ou par poste (`posteId`)
  → Ajouter query params sur l'endpoint + sélecteurs dans la vue
- **Export CSV** des données horaires
- **Comparaison** : deux périodes sur le même graphique (bars groupées par 2)
- **Annotations** : marquer les heures avec des événements spéciaux (campagne, incident)
- **Heatmap 7j×24h** : vue alternative pour visualiser les patterns hebdomadaires

---

*Plan rédigé le 2026-05-25 — branche `production`*
