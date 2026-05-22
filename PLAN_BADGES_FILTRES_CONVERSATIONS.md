# Plan — Badges de statut → Filtres cliquables (ConversationsView)

**Date :** 2026-05-22  
**Statut :** À implémenter  
**Priorité :** P1

---

## Contexte fonctionnel

Dans la vue **Conversations** du panel admin, quand on sélectionne un poste, des badges statistiques apparaissent :

| Badge | Valeur | Source |
|-------|--------|--------|
| `X total` | Toutes les conversations du poste | `totalAll` |
| `X actifs` | `status = 'actif'` | `totalActifs` |
| `X en attente` | `status = 'en attente'` | `totalEnAttente` |
| `X fermés` | `status = 'fermé'` | `totalFermes` |
| `X non lus` | `unread_count > 0` | `totalUnread` |

**Objectif :** Rendre ces badges cliquables → cliquer sur un badge filtre la liste de conversations affichée en dessous.

---

## Architecture actuelle

```
PostesView
  └─ [clic "Voir conversations"] → setViewMode('conversations') + initialPosteId
       └─ ConversationsView
            ├─ loadChats() → GET /chats?poste_id=xxx
            ├─ Badges <span> (affichage seul)
            └─ Liste paginée des conversations
```

**Endpoint backend :** `GET /chats?limit=&offset=&periode=&poste_id=&commercial_id=`  
**Manque :** paramètre `status` et `unread_only` pour filtrer la liste

---

## Ce qui change

```
ConversationsView
  ├─ Badges <button> (cliquables, toggle, état actif visible)
  ├─ statusFilter state : 'actif' | 'en attente' | 'fermé' | 'unread' | null
  └─ loadChats() → GET /chats?poste_id=xxx&status=actif  (ou &unread_only=true)
```

---

## User Stories

### US-1 — Backend : filtre par statut sur `GET /chats`

**Fichiers :**
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts`
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

#### Controller — nouveaux query params

```typescript
@Get()
async findAll(
    @Query('chat_id') chat_id?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('periode') periode?: string,
    @Query('poste_id') poste_id?: string,
    @Query('commercial_id') commercial_id?: string,
    @Query('status') status?: string,          // NOUVEAU : 'actif' | 'en attente' | 'fermé'
    @Query('unread_only') unread_only?: string, // NOUVEAU : 'true'
) {
    // ...
    return this.chatService.findAll(
        chat_id,
        limit ? Math.min(parseInt(limit, 10), 200) : 50,
        offset ? parseInt(offset, 10) : 0,
        dateStart,
        poste_id,
        commercial_id,
        status,                          // NOUVEAU
        unread_only === 'true',          // NOUVEAU
    );
}
```

#### Service — modifier `findAll`

Signature :
```typescript
async findAll(
    chat_id?: string,
    limit = 50,
    offset = 0,
    dateStart?: Date,
    posteId?: string,
    commercialId?: string,
    status?: string,        // NOUVEAU
    unreadOnly = false,     // NOUVEAU
): Promise<{ data, total, totalAll, totalActifs, totalEnAttente, totalUnread, totalFermes }>
```

Filtres à ajouter dans la **requête principale** (pas dans les stats) :

```typescript
// Filtre par statut
if (status) {
    qb.andWhere('chat.status = :status', { status });
}

// Filtre "non lus uniquement"
if (unreadOnly) {
    qb.andWhere('chat.unread_count > 0');
}
```

> **Important :** Les statistiques des badges (`totalActifs`, `totalEnAttente`, etc.) sont calculées par `statsQb` qui n'inclut PAS ces nouveaux filtres — elles représentent toujours le total du poste, pas le sous-ensemble filtré. C'est le comportement attendu : les badges montrent le contexte global, pas le sous-total.

---

### US-2 — Frontend API : exposer les nouveaux paramètres

**Fichier :** `admin/src/app/lib/api.ts`

Modifier la signature de `getChats` :

```typescript
export async function getChats(
    limit = 50,
    offset = 0,
    periode = 'today',
    posteId?: string,
    commercialId?: string,
    status?: string,        // NOUVEAU
    unreadOnly?: boolean,   // NOUVEAU
): Promise<{ data: WhatsappChat[]; total: number; totalAll: number; ... }> {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        periode,
    });
    if (posteId)     params.set('poste_id', posteId);
    if (commercialId) params.set('commercial_id', commercialId);
    if (status)      params.set('status', status);         // NOUVEAU
    if (unreadOnly)  params.set('unread_only', 'true');    // NOUVEAU
    // ...
}
```

---

### US-3 — Frontend UI : badges → boutons filtres

**Fichier :** `admin/src/app/ui/ConversationsView.tsx`

#### 3.1 — Nouveau state

```typescript
type StatusFilter = 'actif' | 'en attente' | 'fermé' | 'unread' | null;
const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
```

Reset automatique quand le poste change :
```typescript
useEffect(() => {
    setStatusFilter(null);
}, [selectedPosteId, selectedCommercialId]);
```

#### 3.2 — Passer le filtre à `loadChats`

```typescript
const loadChats = useCallback(async (l: number, o: number) => {
    setLoadingChats(true);
    try {
        const periodeEffective = (selectedPosteId || selectedCommercialId) ? 'all' : selectedPeriod;
        const result = await getChats(
            l, o,
            periodeEffective,
            selectedPosteId || undefined,
            selectedCommercialId || undefined,
            statusFilter !== 'unread' ? (statusFilter ?? undefined) : undefined,  // NOUVEAU
            statusFilter === 'unread',                                              // NOUVEAU
        );
        // ... setChats, setTotal, etc.
    } finally {
        setLoadingChats(false);
    }
}, [selectedPeriod, selectedPosteId, selectedCommercialId, statusFilter]); // statusFilter en dépendance
```

#### 3.3 — Handler toggle

```typescript
const handleStatusFilter = (filter: StatusFilter) => {
    setStatusFilter(prev => prev === filter ? null : filter); // toggle
};
```

#### 3.4 — Badges → boutons cliquables

Remplacer les `<span>` par des `<button>` avec style actif/inactif.

**Avant :**
```jsx
<span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
    {totalActifs} actifs
</span>
```

**Après :**
```jsx
<button
    onClick={() => handleStatusFilter('actif')}
    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors
        ${statusFilter === 'actif'
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
        }`}
>
    {totalActifs} actifs
</button>
```

**Mapping complet des badges :**

| Badge | Filter value | Couleur inactive | Couleur active |
|-------|-------------|-----------------|---------------|
| Total | `null` (reset) | `bg-slate-100 text-slate-600` | `bg-slate-600 text-white` |
| Actifs | `'actif'` | `bg-emerald-50 text-emerald-700` | `bg-emerald-600 text-white` |
| En attente | `'en attente'` | `bg-amber-50 text-amber-700` | `bg-amber-500 text-white` |
| Fermés | `'fermé'` | `bg-slate-100 text-slate-700` | `bg-slate-500 text-white` |
| Non lus | `'unread'` | `bg-rose-50 text-rose-700` | `bg-rose-600 text-white` |

> Le badge **Total** remet le filtre à zéro (affiche toutes les conversations).

#### 3.5 — Indicateur contextuel (UX)

Quand un filtre est actif, afficher un label sous les badges pour indiquer ce qui est filtré :

```jsx
{statusFilter && (
    <p className="text-[11px] text-slate-400 mt-1">
        Filtre actif : <span className="font-medium text-slate-600">
            {statusFilter === 'unread' ? 'non lus' : statusFilter}
        </span>
        {' · '}
        <button onClick={() => setStatusFilter(null)} className="underline hover:text-slate-800">
            tout afficher
        </button>
    </p>
)}
```

---

## Flux complet après implémentation

```
1. Admin ouvre ConversationsView avec poste "GICOP-01"
2. Badges affichent : [120 total] [45 actifs] [30 en attente] [20 fermés] [8 non lus]
3. Admin clique "8 non lus"
   → statusFilter = 'unread'
   → loadChats() appelle GET /chats?poste_id=xxx&unread_only=true
   → Liste affiche uniquement les 8 conversations non lues
   → Badge "non lus" devient rose foncé (actif)
4. Admin clique à nouveau "8 non lus"
   → statusFilter = null (toggle)
   → Retour à toutes les conversations
5. Admin change de poste → statusFilter reset automatiquement
```

---

## Ordre d'implémentation

1. **US-1** (Backend) — ajouter `status` + `unread_only` dans controller + service
2. **US-2** (API Frontend) — exposer les params dans `getChats`
3. **US-3** (UI) — badges cliquables dans ConversationsView

Chaque US est testable indépendamment.

---

## Points d'attention

| Point | Détail |
|-------|--------|
| Stats fixes | `totalActifs`, `totalEnAttente` etc. ne changent pas quand un filtre est actif — ils montrent toujours le total du poste |
| Toggle | Cliquer sur le badge déjà actif remet le filtre à null (comportement "radio bouton désactivable") |
| Reset au changement de poste | `useEffect` sur `[selectedPosteId, selectedCommercialId]` → `setStatusFilter(null)` |
| `statusFilter` en dépendance de `loadChats` | Le `useCallback` doit l'inclure sinon le rechargement ne se déclenche pas |
| Badge "total" = reset | Cliquer "total" est équivalent à "tout afficher" — c'est le seul badge qui ne passe pas un filtre positif |
| Pas de filtre status sans poste | Les badges n'apparaissent que si `hasFilter` est vrai (poste ou commercial sélectionné) — la logique existante couvre déjà ce cas |
