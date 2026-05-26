# Plan — Séparation des données des canaux dédiés dans le dashboard admin

**Date :** 2026-05-26  
**Statut :** À implémenter  
**Priorité :** P1

---

## Problème

Les postes avec **canaux dédiés** (`WhapiChannel.poste_id IS NOT NULL`) sont à usage purement administratif. Leurs conversations et messages se mélangent aux données des postes pool dans l'Overview et l'Analytique, faussant tous les KPIs de prise de décision :
- Taux de réponse gonflé ou artificiellement bas
- Volume de messages biaisé
- Nombre de conversations actives trompeur
- Temps de réponse moyen non représentatif
- Performances commerciales des agents affectés à ces postes faussées dans la vue Commerciaux

## Définition — Poste dédié

Un **poste est dit « dédié »** si et seulement s'il a au moins un canal dont `WhapiChannel.poste_id IS NOT NULL` pointant vers ce poste.

Une **conversation est « dédiée »** si son `chat.poste_id` correspond à un poste dédié.

Un **message est « dédié »** si la conversation à laquelle il appartient est dédiée.

Un **commercial est « dédié »** si son poste actuel est un poste dédié.

**Requête SQL d'identification :**
```sql
-- Poste dédié : a au moins un canal dédié
SELECT DISTINCT p.id FROM whatsapp_poste p
INNER JOIN whapi_channels ch ON ch.poste_id = p.id

-- Conversation dédiée
SELECT c.* FROM whatsapp_chat c
WHERE EXISTS (
    SELECT 1 FROM whapi_channels ch WHERE ch.poste_id = c.poste_id
)
```

---

## Solution cible

```
Dashboard Admin
└─ Overview
    ├─ Section globale    → données postes POOL uniquement   (postes sans canal dédié)
    ├─ [NOUVEAU] Section canaux dédiés  → données postes DÉDIÉS uniquement
    └─ ...reste identique

└─ Analytique
    └─ données postes POOL uniquement  (postes sans canal dédié)
         └─ GET /metriques/performance-temporelle → filtre excludeDedicated: true

└─ Commerciaux
    └─ agents postes POOL uniquement  (commerciaux sans poste dédié)

└─ [NOUVEAU] Canaux dédiés
    ├─ KPIs messagerie postes dédiés
    └─ Performances des commerciaux affectés aux postes dédiés
```

---

## Architecture technique

### Couche Backend — Filtre `excludeDedicated` / `dedicatedOnly`

Toutes les méthodes de `metriques.service.ts` recevront un paramètre optionnel :
```typescript
interface MetriquesFiltreOptions {
  periode?: string;
  dateFrom?: Date;
  dateTo?: Date;
  excludeDedicated?: boolean;   // true = exclure les postes dédiés (pool only)
  dedicatedOnly?: boolean;      // true = uniquement les postes dédiés
  dedicatedPosteIds?: string[]; // pré-calculé en amont pour éviter N requêtes DB
}
```

La logique de filtrage repose sur une **liste de poste IDs dédiés** récupérée **une seule fois** dans `getMetriquesGlobales`, puis propagée à toutes les sous-méthodes via `options.dedicatedPosteIds`. Les sous-méthodes ne rappellent jamais `getDedicatedPosteIds()` directement.

```typescript
// Helper centralisé — appelé une seule fois par requête de haut niveau
private async getDedicatedPosteIds(): Promise<string[]> {
  const rows = await this.channelRepository
    .createQueryBuilder('ch')
    .select('DISTINCT ch.poste_id', 'posteId')
    .where('ch.poste_id IS NOT NULL')
    .getRawMany<{ posteId: string }>();
  return rows.map(r => r.posteId).filter(Boolean);
}
```

---

## User Stories

---

### US-1 — Backend : helper `getDedicatedPosteIds()` + filtre dans les méthodes stats

**Fichiers :**
- `message_whatsapp/src/metriques/metriques.service.ts`

**Changements :**

#### 1.1 — Nouvelle méthode helper

```typescript
private async getDedicatedPosteIds(): Promise<string[]> {
  const rows = await this.channelRepository
    .createQueryBuilder('ch')
    .select('DISTINCT ch.poste_id', 'posteId')
    .where('ch.poste_id IS NOT NULL')
    .getRawMany<{ posteId: string }>();
  return rows.map(r => r.posteId).filter(Boolean);
}
```

#### 1.2 — Modifier `getMetriquesMessages(dateStart, dateEnd, options?)`

Appliquer le filtre via `options.dedicatedPosteIds` (pré-calculé en amont) :

```typescript
const dedicatedPosteIds = options?.dedicatedPosteIds ?? [];

if (options?.excludeDedicated && dedicatedPosteIds.length > 0) {
  qb.andWhere('(message.poste_id IS NULL OR message.poste_id NOT IN (:...dedicated))',
    { dedicated: dedicatedPosteIds });
}
if (options?.dedicatedOnly && dedicatedPosteIds.length > 0) {
  qb.andWhere('message.poste_id IN (:...dedicated)',
    { dedicated: dedicatedPosteIds });
}
```

> **Note :** Le filtre passe par `message.poste_id` (FK directe sur `whatsapp_message`).
> Si `poste_id` est NULL sur le message, on le classe comme "pool" (non dédié).

#### 1.3 — Modifier `getMetriquesChats(dateStart, dateEnd, options?)`

Appliquer le filtre via `options.dedicatedPosteIds` :

```typescript
const dedicatedPosteIds = options?.dedicatedPosteIds ?? [];

if (options?.excludeDedicated && dedicatedPosteIds.length > 0) {
  qb.andWhere('(chat.poste_id IS NULL OR chat.poste_id NOT IN (:...dedicated))',
    { dedicated: dedicatedPosteIds });
}
if (options?.dedicatedOnly && dedicatedPosteIds.length > 0) {
  qb.andWhere('chat.poste_id IN (:...dedicated)',
    { dedicated: dedicatedPosteIds });
}
```

#### 1.4 — Modifier `getPerformanceCommerciaux(dateStart, dateEnd, options?)`

Appliquer le filtre sur le poste du commercial :

```typescript
const dedicatedPosteIds = options?.dedicatedPosteIds ?? [];

if (options?.excludeDedicated && dedicatedPosteIds.length > 0) {
  qb.andWhere('(commercial.poste_id IS NULL OR commercial.poste_id NOT IN (:...dedicated))',
    { dedicated: dedicatedPosteIds });
}
if (options?.dedicatedOnly && dedicatedPosteIds.length > 0) {
  qb.andWhere('commercial.poste_id IN (:...dedicated)',
    { dedicated: dedicatedPosteIds });
}
```

#### 1.5 — Modifier `getMetriquesGlobales(periode, dateFrom?, dateTo?, options?)` — appel unique de `getDedicatedPosteIds()`

C'est ici que `getDedicatedPosteIds()` est appelé **une seule et unique fois**, puis injecté dans `options` avant la propagation aux sous-méthodes :

```typescript
async getMetriquesGlobales(
  periode = 'today',
  dateFrom?: Date,
  dateTo?: Date,
  options?: MetriquesFiltreOptions,
): Promise<MetriquesGlobalesDto> {
  const { dateStart, dateEnd } = resolvePeriode(periode, dateFrom, dateTo);

  // Pré-calcul unique des IDs dédiés — évite N requêtes DB dans les sous-méthodes
  const dedicatedPosteIds = (options?.excludeDedicated || options?.dedicatedOnly)
    ? await this.getDedicatedPosteIds()
    : [];
  const enrichedOptions = { ...options, dedicatedPosteIds };

  const [msgs, chats, commerciaux, contacts, postes, channels, charge, convs] = await Promise.all([
    this.getMetriquesMessages(dateStart, dateEnd, enrichedOptions),
    this.getMetriquesChats(dateStart, dateEnd, enrichedOptions),
    this.getPerformanceCommerciaux(dateStart, dateEnd, enrichedOptions),
    // ...autres sous-méthodes avec enrichedOptions
  ]);
  // ...
}
```

#### 1.6 — Nouvelle méthode `getMetriquesDedicated(periode, dateFrom?, dateTo?)`

```typescript
async getMetriquesDedicated(
  periode = 'today',
  dateFrom?: Date,
  dateTo?: Date,
): Promise<MetriquesGlobalesDto> {
  return this.getMetriquesGlobales(periode, dateFrom, dateTo, { dedicatedOnly: true });
}
```

---

### US-2 — Backend : nouveaux endpoints controller

**Fichier :** `message_whatsapp/src/metriques/metriques.controller.ts`

#### 2.1 — Modifier `GET /metriques/globales` pour exclure les postes dédiés

```typescript
@Get('globales')
@UseGuards(AdminGuard)
async getGlobales(@Query('periode') periode = 'today', ...) {
  return this.metriquesService.getMetriquesGlobales(
    periode, dateFrom, dateTo,
    { excludeDedicated: true },  // NOUVEAU
  );
}
```

#### 2.2 — Nouveau endpoint `GET /metriques/globales-dedie`

```typescript
@Get('globales-dedie')
@UseGuards(AdminGuard)
async getGlobalesDedie(
  @Query('periode') periode = 'today',
  @Query('dateFrom') dateFrom?: string,
  @Query('dateTo') dateTo?: string,
) {
  return this.metriquesService.getMetriquesDedicated(
    periode,
    dateFrom ? new Date(dateFrom) : undefined,
    dateTo ? new Date(dateTo) : undefined,
  );
}
```

#### 2.3 — Modifier le secteur `overview` pour passer `excludeDedicated: true`

Dans `GET /metriques/overview`, quand `section === 'globales'` ou non précisé, passer le flag :
```typescript
case 'globales':
  return this.metriquesService.getMetriquesGlobales(
    periode, dateFrom, dateTo, { excludeDedicated: true }
  );
```

#### 2.4 — Modifier `GET /metriques/performance-temporelle` pour exclure les postes dédiés

Ce endpoint alimente la vue **Analytique** — sans ce filtre, l'Analytique continuera d'afficher les données des postes dédiés malgré le filtre sur `/globales`.

```typescript
@Get('performance-temporelle')
@UseGuards(AdminGuard)
async getPerformanceTemporelle(@Query('periode') periode = 'today', ...) {
  return this.metriquesService.getPerformanceTemporelle(
    periode, dateFrom, dateTo,
    { excludeDedicated: true },  // NOUVEAU
  );
}
```

La méthode `getPerformanceTemporelle()` dans le service doit également accepter `options?: MetriquesFiltreOptions` et appliquer le filtre via `dedicatedPosteIds` (même pattern que 1.2 / 1.3).

---

### US-3 — Frontend API : nouvelles fonctions

**Fichier :** `admin/src/app/lib/api.ts`

#### 3.1 — `getMetriquesDedicated()`

```typescript
export async function getMetriquesDedicated(
  periode = 'today',
  dateFrom?: string,
  dateTo?: string,
): Promise<MetriquesGlobales> {
  const params = new URLSearchParams({ periode });
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const response = await fetch(`${API_BASE_URL}/metriques/globales-dedie?${params}`, {
    credentials: 'include',
  });
  return handleResponse<MetriquesGlobales>(response);
}
```

---

### US-4 — Frontend Admin : nouveau composant `DedicatedChannelsView.tsx`

**Fichier :** `admin/src/app/ui/DedicatedChannelsView.tsx`

Nouvelle vue affichant exclusivement les métriques des postes à canaux dédiés ainsi que les performances des commerciaux qui y sont affectés.

**Section 1 — KPIs messagerie (postes dédiés)**

| KPI | Source | Description |
|-----|--------|-------------|
| Total messages | `metriques.totalMessages` | Messages des postes dédiés uniquement |
| Conversations actives | `metriques.chatsActifs` | Conversations des postes dédiés |
| Messages entrants | `metriques.messagesEntrants` | Entrants sur postes dédiés |
| Messages sortants | `metriques.messagesSortants` | Sortants sur postes dédiés |
| Taux de réponse | `metriques.tauxReponse` | Calculé sur les postes dédiés |
| Temps de réponse | `metriques.tempsReponseMoyen` | Calculé sur les postes dédiés |
| Conversations fermées | `metriques.chatsFermes` | Postes dédiés |
| Non lus | `metriques.chatsNonLus` | Postes dédiés |

**Section 2 — Performances commerciaux dédiés**

Les commerciaux affectés à un poste dédié sont **exclus de la vue Commerciaux globale** et apparaissent uniquement ici. Les données proviennent du même endpoint `/metriques/globales-dedie` (champ `commerciaux` de `MetriquesGlobalesDto`).

**Structure du composant :**
```typescript
export default function DedicatedChannelsView({
  selectedPeriod,
  dateFrom,
  dateTo,
}: { selectedPeriod: string; dateFrom?: string; dateTo?: string }) {
  const [metriques, setMetriques] = useState<MetriquesGlobales | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMetriquesDedicated(selectedPeriod, dateFrom, dateTo)
      .then(setMetriques)
      .finally(() => setLoading(false));
  }, [selectedPeriod, dateFrom, dateTo]);

  // Section 1 : grille KPI cards identique à OverviewView
  // Section 2 : tableau performances commerciaux (identique CommerciauxView mais filtré dédié)
  // + bandeau d'information en haut des deux sections
}
```

**UX :**
- Bandeau informatif en haut : _« Ces métriques concernent uniquement les postes à canaux dédiés (usage administratif). Elles sont exclues de la vue Globale, de l'Analytique et de la vue Commerciaux. »_
- Même design que l'Overview (KPI cards, même palette de couleurs)
- Auto-refresh toutes les 90s (même pattern que OverviewView)

---

### US-5 — Frontend Admin : intégration dans le dashboard

**Fichier :** `admin/src/app/dashboard/commercial/page.tsx`

#### 5.1 — Ajouter `'canaux-dedies'` aux ViewMode valides

```typescript
const VALID_VIEWS: ViewMode[] = [
  'overview', 'commerciaux', ...,
  'canaux-dedies',  // NOUVEAU
];
```

#### 5.2 — Ajouter le case dans `renderContent()`

```typescript
case 'canaux-dedies':
  return <DedicatedChannelsView
    selectedPeriod={selectedPeriod}
    dateFrom={dateFrom}
    dateTo={dateTo}
  />;
```

#### 5.3 — Ajouter l'entrée dans la navigation

**Fichier :** `admin/src/app/data/admin-data.ts`

```typescript
{
  id: 'canaux-dedies',
  label: 'Canaux dédiés',
  icon: 'ShieldCheck',
  description: 'Métriques et commerciaux des postes administratifs à canal dédié',
}
```

#### 5.4 — Ajouter le type dans `definitions.ts`

```typescript
export type ViewMode =
  | 'overview' | 'commerciaux' | ... | 'canaux-dedies';
```

---

### US-6 — Vérification et tests manuels

**Tests à effectuer :**

| Scénario | Résultat attendu |
|----------|-----------------|
| Overview sans postes dédiés | Données identiques à avant le changement |
| Overview avec postes dédiés | Données des postes dédiés absentes |
| Vue "Canaux dédiés" — KPIs | Affiche uniquement les données des postes dédiés |
| Vue "Canaux dédiés" — Commerciaux | Affiche uniquement les commerciaux des postes dédiés |
| Vue Commerciaux globale | Plus de commerciaux des postes dédiés |
| Analytique (`performance-temporelle`) | Plus de données des postes dédiés |
| Pas de postes dédiés en BDD | Vue "Canaux dédiés" affiche des zéros proprement, pas d'erreur |
| Période personnalisée | Filtre fonctionne dans les deux vues |

---

## Ordre d'implémentation

```
US-1  (Backend service)       — getDedicatedPosteIds() + filtres (appel unique)
  ↓
US-2  (Backend controller)    — endpoints existants + /globales-dedie + performance-temporelle
  ↓
US-3  (API frontend)          — getMetriquesDedicated()
  ↓
US-4  (Composant UI)          — DedicatedChannelsView.tsx (KPIs + commerciaux dédiés)
  ↓
US-5  (Navigation dashboard)  — ViewMode + nav + case renderContent
  ↓
US-6  (Tests manuels)
```

---

## Points d'attention

| Point | Détail |
|-------|--------|
| `getDedicatedPosteIds()` appelé une seule fois | Calculé dans `getMetriquesGlobales`, injecté via `options.dedicatedPosteIds` — les sous-méthodes ne rappellent jamais le helper directement |
| `message.poste_id` peut être NULL | Les messages sans poste_id sont considérés "pool" — ne jamais les inclure dans `dedicatedOnly` |
| `performance-temporelle` doit aussi filtrer | Sans US-2.4, l'Analytique continue d'afficher les données dédiées — ne pas oublier ce endpoint |
| Pas de migration SQL | Aucune modification de schéma nécessaire — tout repose sur `whapi_channels.poste_id` existant |
| Commerciaux dédiés exclus de la vue Commerciaux | `getPerformanceCommerciaux` doit recevoir `excludeDedicated: true` depuis le controller existant et `dedicatedOnly: true` depuis `getMetriquesDedicated` |
| Endpoint uniforme `/globales-dedie` | Orthographe sans "d" final — à utiliser partout (API, controller, frontend) |

---

## Fichiers à modifier / créer

| Fichier | Action |
|---------|--------|
| `message_whatsapp/src/metriques/metriques.service.ts` | Modifier — `getDedicatedPosteIds()` appelé une fois dans `getMetriquesGlobales` + option propagée + filtre commerciaux |
| `message_whatsapp/src/metriques/metriques.controller.ts` | Modifier — `excludeDedicated: true` sur endpoints existants + `/globales-dedie` + `performance-temporelle` filtrée |
| `admin/src/app/lib/api.ts` | Modifier — ajouter `getMetriquesDedicated()` |
| `admin/src/app/lib/definitions.ts` | Modifier — ajouter `'canaux-dedies'` à `ViewMode` |
| `admin/src/app/ui/DedicatedChannelsView.tsx` | Créer — KPIs messagerie + tableau commerciaux dédiés |
| `admin/src/app/data/admin-data.ts` | Modifier — ajouter entrée navigation |
| `admin/src/app/dashboard/commercial/page.tsx` | Modifier — ajouter case + VALID_VIEWS |
