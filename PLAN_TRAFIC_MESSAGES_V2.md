# Plan d'implémentation — Trafic Messages & Conversations (V2)

> **Branche :** `production`  
> **Date de rédaction :** 2026-05-25  
> **Priorité :** P1  
> **Statut :** 📋 À implémenter  
> **Prérequis :** `PLAN_TRAFIC_MESSAGES.md` entièrement livré ✅

---

## 1. Contexte & Objectif

### Demande
1. **Renommer** l'entrée de menu « Trafic Messages » → **« Trafic Messages & Conversations »**
2. **Ajouter un onglet « Conversations »** dans `MessageTrafficView` qui présente les
   mêmes angles d'analyse que l'onglet « Messages » existant, mais appliqués aux
   **conversations** (`whatsapp_chat`) plutôt qu'aux messages (`whatsapp_message`).

### Résultat attendu
La page `MessageTrafficView` sera transformée en une vue à **deux onglets** :

```
┌──────────────────────────────────────────┐
│  Trafic Messages & Conversations         │
│                                          │
│  [ Messages ]  [ Conversations ]         │  ← tabs
│  ──────────────────────────────────────  │
│  (contenu existant OU nouveau selon tab) │
└──────────────────────────────────────────┘
```

---

## 2. Ce qui existe — récapitulatif

| Élément | Fichier | Statut |
|---|---|---|
| Composant principal | `admin/src/app/ui/MessageTrafficView.tsx` | ✅ Livré |
| Endpoint messages | `GET /api/metriques/trafic-horaire` | ✅ Livré |
| Entrée menu | `admin/src/app/data/admin-data.ts` | ✅ `'message-traffic'` |
| Types TS | `admin/src/app/lib/definitions.ts` | ✅ `TraficResponse`, `TraficPoint`… |
| Fonction API | `admin/src/app/lib/api.ts` | ✅ `getTraficHoraire()` |

---

## 3. Architecture cible

```
MessageTrafficView.tsx                   (~350 lignes — orchestration + TabBar)
│
├── TabBar
│   ├── [Messages]       → onglet existant (contenu inchangé)
│   └── [Conversations]  → NOUVEL onglet
│
├── Onglet Messages  (activeTab === 'messages')
│   └── contenu V1 intouché (KpiGrid + BarChart + Repartition + TopHeures)
│
└── Onglet Conversations  (activeTab === 'conversations')
    └── <ConversationsTrafficTab />      ← fichier séparé (voir §5.5)
        ├── KpiGridConversations  (8 cartes — voir §6)
        ├── ConversationBarChart  (ouvertures/heure ou /jour)
        ├── RepartitionStatuts   (active / en attente / fermée)
        └── TopCreneauxConversations  (top 5 créneaux)
             │ fetch
             ▼
        GET /api/metriques/trafic-conversations
        ?periode=&dateFrom=&dateTo=&granularite=heure|jour
```

> **Décision d'architecture :** tous les sous-composants de l'onglet Conversations
> sont extraits dans `ConversationsTrafficTab.tsx` (fichier distinct). Sans cette
> extraction, `MessageTrafficView.tsx` dépasserait ~900 lignes. Chaque fichier
> reste auto-contenu et lisible indépendamment.

---

## 4. User Stories

### US-R1 — Renommage de l'entrée menu [FRONTEND]

**Fichiers modifiés :**
- `admin/src/app/data/admin-data.ts`
- `admin/src/app/ui/MessageTrafficView.tsx` (titre `<h2>` dans PageHeader)

**Changements :**

```typescript
// admin-data.ts — changer le name
{ id: 'message-traffic', name: 'Trafic Messages & Conversations', icon: BarChart2, badge: null }
```

```tsx
// MessageTrafficView.tsx — sous-composant PageHeader, ligne du <h2>
<h2 className="text-xl font-bold text-gray-900">Trafic Messages & Conversations</h2>
```

> Aucun impact sur le routing (`id` reste `'message-traffic'`) ni sur
> `VALID_VIEWS` dans `page.tsx`.

---

### US-B2 — Backend : endpoint `trafic-conversations` [BACKEND]

**Fichiers modifiés :**
1. `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
2. `message_whatsapp/src/metriques/metriques.service.ts`
3. `message_whatsapp/src/metriques/metriques.controller.ts`

#### 4.2.1 DTOs à ajouter dans `create-metrique.dto.ts`

```typescript
/** Un point horaire/journalier du graphique conversations */
export class TraficConversationsPointDto {
  index:         number;   // heure 0-23 ou jour 0-6
  label:         string;   // "00:00" ou "Lun"
  total:         number;   // conversations ouvertes sur ce créneau
  fermees:       number;   // fermées créées sur ce créneau
  actives:       number;   // encore actives créées sur ce créneau
  avg_par_unite: number;   // moyenne par jour (mode multi-jours)
}

/** Statistiques conversations calculées sur la période */
export class TraficConversationsStatistiquesDto {
  // ── Volumes ──────────────────────────────────────────────────────────────
  total:           number;   // conversations ouvertes dans la période
  actives:         number;   // conversations non fermées
  fermees:         number;   // conversations fermées
  en_attente:      number;   // conversations status='waiting'

  // ── Ratios ───────────────────────────────────────────────────────────────
  taux_cloture:    number;   // fermees / total * 100 (%)
  taux_actives:    number;   // actives / total * 100 (%)

  // ── Moyennes ─────────────────────────────────────────────────────────────
  moy_par_heure:   number;   // total / nb_unites_actives
  moy_par_jour:    number;   // total / nb_jours_distincts (min 1)

  // ── Pics ─────────────────────────────────────────────────────────────────
  unite_pic:         number; // index (heure 0-23 ou jour 0-6) avec le plus d'ouvertures
  conversations_pic: number; // nb conversations à l'unité de pic

  // ── Infos période ────────────────────────────────────────────────────────
  unites_actives:  number;   // nb de créneaux avec ≥ 1 conversation ouverte
  nb_jours:        number;   // nb jours distincts dans la période
  mode:            'journee' | 'periode';
}

/** Réponse complète de l'endpoint trafic-conversations */
export class TraficConversationsResponseDto {
  granularite:   'heure' | 'jour';
  points:        TraficConversationsPointDto[];
  statistiques:  TraficConversationsStatistiquesDto;
  meta: {
    periode:   string;
    dateStart: string;
    dateEnd:   string;
    nb_unites: number;
    nb_jours:  number;
  };
}
```

#### 4.2.2 Méthode `getTraficConversations()` dans `metriques.service.ts`

Symétrique à `getTraficHoraire()` mais sur `whatsapp_chat`.

> **⚠️ Avant d'implémenter — vérifications obligatoires (voir §10) :**
> - Confirmer le nom de l'entité et du repository
> - Confirmer les valeurs exactes de `status` dans la BDD
> - Vérifier si `chatRepository` est déjà injecté dans `MetriquesService`
> - Confirmer que `createdAt` représente l'ouverture de la conversation
>
> **Risque critique :** si les valeurs de `status` sont incorrectes, les compteurs
> `actives`/`fermees`/`en_attente` retournent **tous 0 sans erreur** — l'endpoint
> répond 200 OK avec des KPIs silencieusement faux. Vérifier avant de coder.

```typescript
async getTraficConversations(
  periode      = 'today',
  dateFrom?:   string,
  dateTo?:     string,
  granularite: 'heure' | 'jour' = 'heure',
): Promise<TraficConversationsResponseDto> {
  const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

  const nbUnites = granularite === 'heure' ? 24 : 7;
  const groupCol = granularite === 'heure'
    ? 'HOUR(chat.createdAt)'
    : 'WEEKDAY(chat.createdAt)';

  // ── Q1 : agrégation par créneau ───────────────────────────────────────
  const rows = await this.chatRepository
    .createQueryBuilder('chat')
    .select(groupCol, 'groupe')
    .addSelect('COUNT(*)', 'total')
    .addSelect(
      "SUM(CASE WHEN chat.status = 'closed'  THEN 1 ELSE 0 END)", 'fermees',
    )
    .addSelect(
      "SUM(CASE WHEN chat.status = 'active'  THEN 1 ELSE 0 END)", 'actives',
    )
    .addSelect(
      "SUM(CASE WHEN chat.status = 'waiting' THEN 1 ELSE 0 END)", 'en_attente',
    )
    .where('chat.deletedAt IS NULL')
    .andWhere('chat.createdAt >= :dateStart', { dateStart })
    .andWhere('chat.createdAt <= :dateEnd',   { dateEnd })
    .groupBy(groupCol)
    .getRawMany();

  // ── Q2 : stats globales ───────────────────────────────────────────────
  const globRaw = await this.chatRepository
    .createQueryBuilder('chat')
    .select('COUNT(*)',                                           'total')
    .addSelect("SUM(CASE WHEN chat.status = 'closed'  THEN 1 ELSE 0 END)", 'fermees')
    .addSelect("SUM(CASE WHEN chat.status = 'active'  THEN 1 ELSE 0 END)", 'actives')
    .addSelect("SUM(CASE WHEN chat.status = 'waiting' THEN 1 ELSE 0 END)", 'en_attente')
    .addSelect('COUNT(DISTINCT DATE(chat.createdAt))',             'nb_jours')
    .where('chat.deletedAt IS NULL')
    .andWhere('chat.createdAt >= :dateStart', { dateStart })
    .andWhere('chat.createdAt <= :dateEnd',   { dateEnd })
    .getRawOne();

  const totalGlob     = parseInt(globRaw?.total)       || 0;
  const fermeesGlob   = parseInt(globRaw?.fermees)     || 0;
  const activesGlob   = parseInt(globRaw?.actives)     || 0;
  const enAttenteGlob = parseInt(globRaw?.en_attente)  || 0;
  const nbJoursGlobal = parseInt(globRaw?.nb_jours)    || 1;

  const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const nbSemaines = Math.max(1, Math.floor(nbJoursGlobal / 7));

  // ── Construction des points (créneaux sans données → 0) ───────────────
  const dataMap = new Map<number, { total: number; fermees: number; actives: number }>();
  for (const row of rows) {
    dataMap.set(parseInt(row.groupe), {
      total:   parseInt(row.total)   || 0,
      fermees: parseInt(row.fermees) || 0,
      actives: parseInt(row.actives) || 0,
    });
  }

  const points: TraficConversationsPointDto[] = Array.from({ length: nbUnites }, (_, i) => {
    const d = dataMap.get(i) ?? { total: 0, fermees: 0, actives: 0 };
    const label = granularite === 'heure'
      ? `${String(i).padStart(2, '0')}:00`
      : DOW_LABELS[i];
    // avg_par_unite : utilisé côté frontend en mode 'periode' pour afficher des
    // moyennes journalières sur le graphique (comme trafic-horaire fait pour les messages).
    // En mode 'journee' (1 seul jour), avg_par_unite === total.
    const avgParUnite = granularite === 'heure'
      ? (nbJoursGlobal > 1 ? Math.round((d.total / nbJoursGlobal) * 10) / 10 : d.total)
      : (nbJoursGlobal > 6 ? Math.round((d.total / nbSemaines)    * 10) / 10 : d.total);
    return { index: i, label, total: d.total, fermees: d.fermees,
             actives: d.actives, avg_par_unite: avgParUnite };
  });

  // ── Calcul statistiques ───────────────────────────────────────────────
  const unitesActives   = points.filter(p => p.total > 0);
  const nbUnitesActives = unitesActives.length || 1;
  const picPoint        = points.reduce((max, p) => p.total > max.total ? p : max, points[0]);
  const isSameDay       = dateStart.toDateString() === dateEnd.toDateString();
  const pct = (v: number) => totalGlob > 0 ? Math.round((v / totalGlob) * 100) : 0;

  const statistiques: TraficConversationsStatistiquesDto = {
    total:             totalGlob,
    actives:           activesGlob,
    fermees:           fermeesGlob,
    en_attente:        enAttenteGlob,
    taux_cloture:      pct(fermeesGlob),
    taux_actives:      pct(activesGlob),
    moy_par_heure:     Math.round((totalGlob / nbUnitesActives) * 10) / 10,
    moy_par_jour:      Math.round((totalGlob / nbJoursGlobal)   * 10) / 10,
    unite_pic:         picPoint.index,
    conversations_pic: picPoint.total,
    unites_actives:    nbUnitesActives,
    nb_jours:          nbJoursGlobal,
    mode:              isSameDay ? 'journee' : 'periode',
  };

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

#### 4.2.3 Route à ajouter dans `metriques.controller.ts`

```typescript
@Get('trafic-conversations')
@ApiOperation({ summary: 'Trafic conversations par heure ou par jour' })
@ApiResponse({ status: 200, type: TraficConversationsResponseDto })
async getTraficConversations(
  @Query('periode')     periode: string = 'today',
  @Query('dateFrom')    dateFrom?: string,
  @Query('dateTo')      dateTo?: string,
  @Query('granularite') granularite: 'heure' | 'jour' = 'heure',
): Promise<TraficConversationsResponseDto> {
  return this.metriquesService.getTraficConversations(
    periode, dateFrom, dateTo, granularite,
  );
}
```

> Placer immédiatement après `@Get('trafic-horaire')`.

---

### US-F3 — Types TypeScript conversations [FRONTEND]

**Fichier :** `admin/src/app/lib/definitions.ts`

Ajouter à la suite des types `TraficResponse` existants :

```typescript
export type TraficConversationsPoint = {
  index:         number;
  label:         string;
  total:         number;
  fermees:       number;
  actives:       number;
  avg_par_unite: number;
};

export type TraficConversationsStatistiques = {
  total:             number;
  actives:           number;
  fermees:           number;
  en_attente:        number;
  taux_cloture:      number;
  taux_actives:      number;
  moy_par_heure:     number;
  moy_par_jour:      number;
  unite_pic:         number;
  conversations_pic: number;
  unites_actives:    number;
  nb_jours:          number;
  mode:              'journee' | 'periode';
};

export type TraficConversationsResponse = {
  granularite:  'heure' | 'jour';
  points:       TraficConversationsPoint[];
  statistiques: TraficConversationsStatistiques;
  meta: {
    periode:   string;
    dateStart: string;
    dateEnd:   string;
    nb_unites: number;
    nb_jours:  number;
  };
};
```

---

### US-F4 — Fonction API `getTraficConversations` [FRONTEND]

**Fichier :** `admin/src/app/lib/api.ts`

Ajouter immédiatement après `getTraficHoraire()` :

```typescript
export async function getTraficConversations(
  periode      = 'today',
  dateFrom?:   string,
  dateTo?:     string,
  granularite: 'heure' | 'jour' = 'heure',
): Promise<TraficConversationsResponse> {
  const params = new URLSearchParams({ periode, granularite });
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo)   params.set('dateTo',   dateTo);
  const response = await fetch(
    `${API_BASE_URL}/api/metriques/trafic-conversations?${params.toString()}`,
    { method: 'GET', credentials: 'include' },
  );
  return handleResponse<TraficConversationsResponse>(response);
}
```

---

### US-F5 — Refactoring de `MessageTrafficView.tsx` + création de `ConversationsTrafficTab.tsx` [FRONTEND]

**Fichiers :**
- `admin/src/app/ui/MessageTrafficView.tsx` — modifier (orchestration + TabBar + états)
- `admin/src/app/ui/ConversationsTrafficTab.tsx` — **créer** (tous les sous-composants conversations)

#### Principe

On ajoute un état local `activeTab` et une `TabBar` juste sous le `PageHeader`.
Le contenu V1 (messages) est conservé **intégralement** quand `activeTab === 'messages'`.
Le nouveau contenu conversations est importé depuis `ConversationsTrafficTab.tsx` et
s'affiche quand `activeTab === 'conversations'`.

#### Nouveaux imports à ajouter dans `MessageTrafficView.tsx`

```typescript
import ConversationsTrafficTab from '@/app/ui/ConversationsTrafficTab';
import { getTraficConversations } from '@/app/lib/api';
import { TraficConversationsResponse } from '@/app/lib/definitions';
import { MessagesSquare } from 'lucide-react';
```

> `ConversationsTrafficTab` encapsule tous ses propres sous-composants et imports —
> `MessageTrafficView` n'a besoin que des types de données et de la fonction API.

#### Modifications dans le composant principal

```tsx
export default function MessageTrafficView({ selectedPeriod, dateFrom, dateTo }) {

  // ── Onglet actif ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'messages' | 'conversations'>('messages');

  // ── États messages (inchangés) ───────────────────────────────────────────
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState<TraficResponse | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // ... granularite existant ...

  // ── États conversations (nouveaux) ───────────────────────────────────────
  const [loadingConv, setLoadingConv]         = useState(false);
  const [dataConv, setDataConv]               = useState<TraficConversationsResponse | null>(null);
  const [errorConv, setErrorConv]             = useState<string | null>(null);
  const [lastRefreshConv, setLastRefreshConv] = useState<Date | null>(null);
  const [granulariteConv, setGranulariteConv] = useState<'heure' | 'jour'>('heure');

  // ── Chargement conversations ─────────────────────────────────────────────
  const loadConv = useCallback(async () => {
    setLoadingConv(true);
    setErrorConv(null);
    try {
      const result = await getTraficConversations(
        selectedPeriod, dateFrom, dateTo, granulariteConv,
      );
      setDataConv(result);
      setLastRefreshConv(new Date());
    } catch {
      setErrorConv('Erreur lors du chargement du trafic conversations');
    } finally {
      setLoadingConv(false);
    }
  }, [selectedPeriod, dateFrom, dateTo, granulariteConv]);

  // Charger conversations quand l'onglet devient actif ou que les filtres changent
  useEffect(() => {
    if (activeTab === 'conversations') void loadConv();
  }, [activeTab, loadConv]);

  // Auto-refresh conversations (today seulement)
  useEffect(() => {
    if (activeTab !== 'conversations' || selectedPeriod !== 'today') return;
    const silentRefresh = async () => {
      try {
        const result = await getTraficConversations(
          selectedPeriod, dateFrom, dateTo, granulariteConv,
        );
        setDataConv(result);
        setLastRefreshConv(new Date());
      } catch { /* silencieux */ }
    };
    const interval = setInterval(silentRefresh, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeTab, selectedPeriod, dateFrom, dateTo, granulariteConv]);

  return (
    <div className="space-y-6">
      {/* En-tête commun : bouton refresh pointe vers l'onglet actif */}
      <PageHeader
        onRefresh={activeTab === 'messages' ? load : loadConv}
        loading={activeTab === 'messages' ? loading : loadingConv}
        lastRefresh={activeTab === 'messages' ? lastRefresh : lastRefreshConv}
        isLive={selectedPeriod === 'today'}
      />

      {/* Barre d'onglets */}
      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      {/* Contenu onglet Messages — V1 inchangé */}
      {activeTab === 'messages' && (
        /* … contenu existant intouché … */
      )}

      {/* Contenu onglet Conversations — délégué au fichier dédié */}
      {activeTab === 'conversations' && (
        <ConversationsTrafficTab
          loading={loadingConv}
          data={dataConv}
          error={errorConv}
          granularite={granulariteConv}
          onGranulariteChange={setGranulariteConv}
          selectedPeriod={selectedPeriod}
        />
      )}
    </div>
  );
}
```

#### Sous-composant `TabBar` (local dans `MessageTrafficView.tsx`)

```tsx
function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: 'messages' | 'conversations';
  onChange:  (tab: 'messages' | 'conversations') => void;
}) {
  const tabs = [
    { id: 'messages'      as const, label: 'Messages',      Icon: MessageCircle  },
    { id: 'conversations' as const, label: 'Conversations', Icon: MessagesSquare },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={[
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium',
            'border-b-2 -mb-px transition-colors',
            activeTab === id
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
          ].join(' ')}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}
```

#### Contenu de `ConversationsTrafficTab.tsx` (fichier à créer)

Le composant racine de ce fichier reprend exactement ce qui était `ConversationsTabContent`.
Tous les sous-composants (`KpiGridConversations`, `ConversationBarChart`, `RepartitionStatuts`,
`TopCreneauxConversations`) sont définis dans ce même fichier.

```tsx
"use client";
// Imports : getTraficConversations, types, Recharts, Lucide, GranulariteToggle, Spinner

export default function ConversationsTrafficTab({
  loading,
  data,
  error,
  granularite,
  onGranulariteChange,
  selectedPeriod,
}: {
  loading:             boolean;
  data:                TraficConversationsResponse | null;
  error:               string | null;
  granularite:         'heure' | 'jour';
  onGranulariteChange: (g: 'heure' | 'jour') => void;
  selectedPeriod:      string;
}) {
  const isEmpty = data !== null && data.statistiques.total === 0;

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        {granularite === 'jour' && selectedPeriod === 'today' ? (
          <p className="text-sm text-amber-600">
            ⚠️ Mode jour indisponible pour aujourd&apos;hui — données sur 7 jours
          </p>
        ) : <span />}
        <GranulariteToggle value={granularite} onChange={onGranulariteChange} />
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center h-48"><Spinner /></div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isEmpty && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-10
                        flex flex-col items-center justify-center text-center gap-3">
          <MessagesSquare size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">Aucune conversation sur cette période</p>
          <p className="text-xs text-gray-400">
            Essayez une plage de dates différente ou vérifiez que les canaux sont actifs.
          </p>
        </div>
      )}

      {data && !isEmpty && (
        <>
          <KpiGridConversations stats={data.statistiques} />
          <ConversationBarChart
            points={data.points}
            granularite={data.granularite}
            mode={data.statistiques.mode}
            nbJours={data.statistiques.nb_jours}
            selectedPeriod={selectedPeriod}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RepartitionStatuts stats={data.statistiques} />
            <TopCreneauxConversations
              points={data.points}
              total={data.statistiques.total}
              granularite={data.granularite}
            />
          </div>
        </>
      )}
    </div>
  );
}
```

---

## 6. Les 8 KPIs — onglet Conversations

| # | Titre | Valeur | Icône | Couleur | Sous-titre |
|---|---|---|---|---|---|
| 1 | Total conversations | `stats.total` | `MessagesSquare` | `bg-indigo-50 text-indigo-600` | Ouvertes sur la période |
| 2 | Conversations actives | `stats.actives` | `MessageCircle` | `bg-green-50 text-green-600` | `stats.taux_actives`% du total |
| 3 | Conversations fermées | `stats.fermees` | `CheckCircle` | `bg-blue-50 text-blue-600` | `stats.taux_cloture`% du total |
| 4 | En attente | `stats.en_attente` | `Clock` | `bg-yellow-50 text-yellow-600` | Attente de réponse |
| 5 | Taux de clôture | `stats.taux_cloture`% | `TrendingUp` | `bg-teal-50 text-teal-600` | Fermées / Ouvertes |
| 6 | Moy. / heure | `stats.moy_par_heure` conv/h | `Zap` | `bg-orange-50 text-orange-600` | `stats.unites_actives` créneaux actifs |
| 7 | Moy. / jour | `stats.moy_par_jour` conv/j | `CalendarDays` | `bg-purple-50 text-purple-600` | Sur `stats.nb_jours` jour(s) |
| 8 | Créneau de pic | label du créneau | `BarChart2` | `bg-rose-50 text-rose-600` | `stats.conversations_pic` conversations |

---

## 7. Sous-composants de l'onglet Conversations

### `ConversationBarChart`

Identique à `TrafficBarChart` avec couleurs et dataKeys adaptés :

```tsx
// dataKeys : 'actives' (vert) + 'fermees' (bleu) au lieu de messages_in/out
<Bar dataKey="actives"  name="Actives"  fill="#10b981" radius={[3,3,0,0]} maxBarSize={28} />
<Bar dataKey="fermees"  name="Fermées"  fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={28} />
```

Titre dynamique : `"Conversations ouvertes heure par heure"` (journée)
ou `"Moyenne ouvertures/heure sur N jours"` (période multi-jours).

### `RepartitionStatuts`

Barres de progression horizontales pour les 3 statuts :

```
● Actives    |█████████░| 62%   93 conv
⏳ En attente |███░░░░░░░| 23%   34 conv
✅ Fermées   |███░░░░░░░| 15%   22 conv
```

### `TopCreneauxConversations`

Tableau des 5 créneaux avec le plus de conversations ouvertes :

```
┌──────────────┬────────┬─────────┬─────────┬────────┐
│ Créneau      │ Total  │ Actives │ Fermées │ % tot  │
├──────────────┼────────┼─────────┼─────────┼────────┤
│ 🔥 10:00     │   18   │   11    │    7    │  22%   │
│    09:00     │   15   │    9    │    6    │  18%   │
│    14:00     │   12   │    8    │    4    │  15%   │
│    11:00     │   11   │    7    │    4    │  13%   │
│    16:00     │    9   │    6    │    3    │  11%   │
└──────────────┴────────┴─────────┴─────────┴────────┘
```

---

## 8. Séquence d'implémentation recommandée

```
Étape 0 — Vérifications préalables (obligatoires)        ~15min
  ├── Grep entité conversation :
  │     grep -r "whatsapp_chat\|WhatsappChat" message_whatsapp/src/ --include="*.ts" -l
  ├── Lire l'entité trouvée : confirmer le nom du repository + champ createdAt
  ├── Vérifier les valeurs de status en BDD :
  │     grep -r "status.*=.*['\"]" message_whatsapp/src/ --include="*.ts" | grep -i chat
  │     (ou SELECT DISTINCT status FROM whatsapp_chat LIMIT 10 en SQL)
  └── Vérifier si chatRepository déjà injecté dans MetriquesService :
        grep "chatRepository\|WhatsappChat" message_whatsapp/src/metriques/metriques.service.ts

Étape 1 — Backend (US-B2)                               ~1h30
  ├── Adapter les valeurs de status dans les CASE WHEN selon résultat étape 0
  ├── Ajouter DTOs dans create-metrique.dto.ts
  ├── Injecter chatRepository dans MetriquesService si absent
  │     (@InjectRepository(WhatsappChat) + import dans MetriquesModule)
  ├── Ajouter getTraficConversations() dans metriques.service.ts
  └── Ajouter @Get('trafic-conversations') dans metriques.controller.ts

Étape 2 — Types & API frontend (US-F3 + US-F4)          ~20min
  ├── definitions.ts : ajouter 3 nouveaux types conversations
  └── api.ts : ajouter getTraficConversations()

Étape 3 — Créer ConversationsTrafficTab.tsx (US-F5)      ~2h30
  ├── Créer admin/src/app/ui/ConversationsTrafficTab.tsx
  ├── Composant racine : ConversationsTrafficTab (props identiques au plan §5.5)
  ├── Créer KpiGridConversations (8 cartes)
  ├── Créer ConversationBarChart + ConvTooltip
  ├── Créer RepartitionStatuts
  └── Créer TopCreneauxConversations

Étape 4 — Modifier MessageTrafficView.tsx (US-F5)        ~45min
  ├── Ajouter imports (ConversationsTrafficTab, getTraficConversations, types)
  ├── Ajouter état activeTab + 5 nouveaux états conv
  ├── Ajouter loadConv() + useEffect conversations
  ├── Ajouter useEffect auto-refresh conversations
  ├── Modifier rendu : PageHeader commun + TabBar + switch activeTab
  └── Créer sous-composant TabBar (local)

Étape 5 — Renommage menu (US-R1)                         ~5min
  ├── admin-data.ts : name → 'Trafic Messages & Conversations'
  └── MessageTrafficView.tsx : PageHeader <h2> → 'Trafic Messages & Conversations'

Étape 6 — Tests manuels                                  ~30min
  ├── Onglet Messages : comportement V1 inchangé
  ├── Onglet Conversations : graphique + KPIs + répartition statuts
  ├── Vérifier que actives + fermees + en_attente == total (si statuts exhaustifs)
  ├── Changement granularité dans chaque onglet indépendamment
  ├── Auto-refresh (today) dans chaque onglet
  ├── Nouveau nom affiché dans le menu et dans le titre
  └── 0 warning TypeScript
```

**Durée totale estimée : ~5h30** (dont 15min de vérifications bloquantes en amont)

---

## 9. Fichiers créés / modifiés — récapitulatif

### Backend

| Fichier | Action | Détail |
|---|---|---|
| `message_whatsapp/src/metriques/dto/create-metrique.dto.ts` | Modifier | +3 classes DTO conversations |
| `message_whatsapp/src/metriques/metriques.service.ts` | Modifier | +`getTraficConversations()` (~60 lignes) + injection chatRepository |
| `message_whatsapp/src/metriques/metriques.controller.ts` | Modifier | +1 route `@Get('trafic-conversations')` |

### Frontend (Admin)

| Fichier | Action | Détail |
|---|---|---|
| `admin/src/app/data/admin-data.ts` | Modifier | Renommage label menu |
| `admin/src/app/lib/definitions.ts` | Modifier | +3 types conversations |
| `admin/src/app/lib/api.ts` | Modifier | +`getTraficConversations()` |
| `admin/src/app/ui/MessageTrafficView.tsx` | Modifier | +TabBar + états conv + orchestration (~+80 lignes) |
| `admin/src/app/ui/ConversationsTrafficTab.tsx` | **CRÉER** | Tous les sous-composants conversations (~450 lignes) |

**Total :** 3 fichiers backend modifiés + 4 fichiers frontend modifiés + 1 fichier frontend créé. Aucune migration SQL.

---

## 10. Points d'attention avant implémentation

### A. Vérifications bloquantes (étape 0 — à faire avant tout code)

**A1 — Nom de l'entité conversation**
```bash
grep -r "whatsapp_chat\|WhatsappChat" message_whatsapp/src/ --include="*.ts" -l
```
Lire le fichier entité trouvé pour confirmer : nom de la classe, nom du repository,
et champ qui représente l'ouverture (probablement `createdAt`).

**A2 — Valeurs de `status` — risque critique**
```bash
grep -rn "status.*=.*['\"]" message_whatsapp/src/ --include="*.ts" | grep -i "chat\|conv"
# ou en SQL :
# SELECT DISTINCT status FROM whatsapp_chat LIMIT 10;
```
> ⚠️ **Risque silencieux :** si les valeurs dans les `CASE WHEN` du service ne correspondent
> pas aux vraies valeurs BDD, les compteurs `actives`/`fermees`/`en_attente` retournent
> **tous 0 sans erreur** — l'API répond 200 OK avec des KPIs faux. C'est non détectable
> sans vérification manuelle. Adapter les valeurs dans le code selon ce que le grep retourne.

**A3 — `chatRepository` déjà injecté dans `MetriquesService` ?**
```bash
grep "chatRepository\|WhatsappChat" message_whatsapp/src/metriques/metriques.service.ts
```
Si absent : ajouter `@InjectRepository(WhatsappChat)` dans le constructeur ET
importer l'entité dans `MetriquesModule` (tableau `TypeOrmModule.forFeature([…])`).

**A4 — `createdAt` = ouverture de la conversation**
Vérifier dans l'entité que `createdAt` est bien la date à laquelle la conversation
a démarré (premier message reçu), et non la date de synchronisation dans le système
ou d'import depuis Whapi. Si ces deux dates diffèrent, utiliser le bon champ.

### B. Clarification sémantique des stats globales

Les KPIs `actives` / `fermees` / `en_attente` dans Q2 reflètent le **statut actuel**
des conversations *ouvertes pendant la période*. Une conversation ouverte hier et
toujours active aujourd'hui sera comptée en `actives`. C'est le comportement attendu
(état courant de la période), mais il faut que le label dans l'UI soit clair :
> "Actives" = conversations ouvertes sur la période **encore en cours**  
> "Fermées" = conversations ouvertes sur la période **déjà clôturées**

### C. `avg_par_unite` dans les points

Ce champ est calculé mais n'est pas utilisé directement comme `dataKey` dans Recharts.
Il sert de base au calcul des moyennes dans `ConversationBarChart` en mode `periode` :
le graphique divise `fermees` et `actives` par `nbJours` pour afficher des moyennes,
exactement comme `TrafficBarChart` le fait pour `messages_in`/`messages_out`.
Ne pas supprimer ce champ — il sert de garde-fou pour des calculs futurs côté frontend.

### D. Pas de migration SQL
L'endpoint lit `whatsapp_chat` en lecture seule sur colonnes existantes
(`createdAt`, `status`, `deletedAt`). Aucun index nouveau pour la v1.

---

*Plan rédigé le 2026-05-25 — branche `production`*
