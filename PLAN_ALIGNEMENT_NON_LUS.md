# Plan — Alignement du critère "Messages non lus"

**Date :** 2026-05-26 (mis à jour après revue)
**Statut :** ✅ Validé — prêt à implémenter
**Priorité :** P0 — cohérence des données de prise de décision

---

## Problème

Quatre critères différents coexistent pour identifier une conversation non lue :

| Endroit | Critère | Fiable ? |
|---|---|---|
| Overview KPI `chatsNonLus` | `chat.unread_count > 0` | NON — colonne cache désync possible |
| Overview KPI `chatsLusSansReponse` | `chat.unread_count = 0 AND last_poste_message_at IS NULL` | NON — même problème |
| Overview KPI `chatsLusAvecReponse` | `chat.unread_count = 0 AND last_poste_message_at IS NOT NULL` | NON — même problème |
| `findAll()` filtre date | `last_activity_at >= X OR chat.unread_count > 0` | NON — même problème |
| `findAll()` filtre non lus | `EXISTS(message.from_me=0 AND status IN sent/delivered)` | OUI |
| `findAll()` stats `totalUnread` | `EXISTS(...)` | OUI |
| `findByPosteId()` commercial | `EXISTS(...)` | OUI |

### Cause racine de la désynchronisation de `unread_count`

```
Client envoie message
  → whatsapp_chat.unread_count += 1         ✅ incrémenté
  
Commercial ouvre la conversation
  → whatsapp_chat.unread_count = 0          ← reset immédiat
  → whatsapp_message.status reste "delivered" ← pas encore READ

Fenêtre de désync : unread_count=0 mais messages encore sent/delivered
```

### Conséquences actuelles

1. **Overview KPI `chatsNonLus`** erroné → peut sous-compter des dettes actives
2. **Overview KPI `chatsLusSansReponse`/`chatsLusAvecReponse`** erronés par symétrie — basés sur `unread_count = 0` qui n'est pas fiable non plus
3. **Admin filtre "Non lus" + status "actif"** → conversations fermées avec messages non lus invisibles
4. **Admin filtre "Non lus" + filtre date** → conversations hors période mais non lues invisibles
5. **DedicatedChannelsView KPI "Non lus"** → hérite du même problème de l'Overview

---

## Décision métier

**"Non lu" = à traiter peu importe le statut de la conversation.**

Une conversation fermée, convertie ou en attente avec un message non lu reste une dette active. Elle doit apparaître dans tous les affichages "Non lus" — Overview KPI, filtre admin, front commercial. Le front commercial conserve son propre filtrage via `excludeStatuses` pour la file active, mais le mode `unreadOnly=true` l'ignore.

---

## Solution : source de vérité unique

**Critère canonique "est non lu" :**
```sql
EXISTS (
  SELECT 1 FROM whatsapp_message m
  WHERE m.chat_id = chat.chat_id
    AND m.from_me = 0
    AND m.status IN ('sent', 'delivered')
    AND m.deletedAt IS NULL
)
```

**Critère canonique "est lu" (inverse) :**
```sql
NOT EXISTS (
  SELECT 1 FROM whatsapp_message m
  WHERE m.chat_id = chat.chat_id
    AND m.from_me = 0
    AND m.status IN ('sent', 'delivered')
    AND m.deletedAt IS NULL
)
```

Ce critère est :
- Toujours exact — reflète l'état réel des messages
- Déjà utilisé pour `totalUnread` (admin stats) et `findByPosteId` (commercial)
- Indépendant du statut de la conversation
- Couvert par l'index existant `IDX_msg_chat_status (chat_id, from_me, status, deletedAt)`

**Règle temporelle unifiée :**
> Non lu = conversation avec au moins un message non lu dont la **`last_activity_at` est dans la période sélectionnée**.

Utiliser `last_activity_at` et non `createdAt` : une conversation créée il y a 3 mois avec un message non lu reçu aujourd'hui doit compter dans le KPI d'aujourd'hui. `createdAt` masquerait exactement ces dettes récentes sur d'anciennes conversations.

Cette règle s'applique à tous les affichages :
| Endroit | Colonne période |
|---|---|
| KPI `chatsNonLus` (Overview/Dedicated) | `chat.last_activity_at` |
| `findAll()` liste en mode `unreadOnly` | `chat.last_activity_at` |
| `findAll().totalUnread` (badge) | `chat.last_activity_at` |

---

## Corrections à apporter

### US-1 — Aligner les trois KPIs `chatsNonLus`, `chatsLusSansReponse`, `chatsLusAvecReponse`

**Fichier :** `message_whatsapp/src/metriques/metriques.service.ts`
**Méthode :** `getMetriquesChats(dateStart, dateEnd, options)`

**Problème actuel :**
```typescript
.addSelect('SUM(CASE WHEN chat.unread_count > 0       THEN 1 ELSE 0 END)', 'non_lus')
// ...
.addSelect('SUM(CASE WHEN chat.unread_count = 0 AND chat.last_poste_message_at IS NULL THEN 1 ELSE 0 END)', 'lus_sans_reponse')
.addSelect('SUM(CASE WHEN chat.unread_count = 0 AND chat.last_poste_message_at IS NOT NULL THEN 1 ELSE 0 END)', 'lus_avec_reponse')
```

Les trois catégories sont basées sur `unread_count` — si on ne corrige que `non_lus`, les catégories "lus" restent incohérentes (une conv non lue selon EXISTS serait comptée dans "lus").

**Fix — trois requêtes dédiées en parallèle (INNER JOIN / LEFT JOIN) :**

Toutes les trois filtrent par `chat.last_activity_at` (même fenêtre que `statsQb` après correction) et utilisent une jointure plutôt que des sous-requêtes corrélées — évite N appels EXISTS par ligne.

```typescript
// --- nonLusQb : INNER JOIN → ne retourne que les chats avec au moins 1 msg non lu
const nonLusQb = this.chatRepository
  .createQueryBuilder('chat')
  .select('COUNT(DISTINCT chat.id)', 'cnt')
  .innerJoin(
    'whatsapp_message', 'unread_msg',
    `unread_msg.chat_id = chat.chat_id AND unread_msg.from_me = 0
     AND unread_msg.status IN ('sent','delivered') AND unread_msg.deletedAt IS NULL`,
  )
  .where('chat.deletedAt IS NULL')
  .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
  .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
this.applyPosteFilter(nonLusQb, 'chat', options);

// --- lusSansQb : LEFT JOIN + unread_msg.id IS NULL → chats sans msg non lu ET sans réponse poste
const lusSansQb = this.chatRepository
  .createQueryBuilder('chat')
  .select('COUNT(DISTINCT chat.id)', 'cnt')
  .leftJoin(
    'whatsapp_message', 'unread_msg',
    `unread_msg.chat_id = chat.chat_id AND unread_msg.from_me = 0
     AND unread_msg.status IN ('sent','delivered') AND unread_msg.deletedAt IS NULL`,
  )
  .where('chat.deletedAt IS NULL')
  .andWhere('unread_msg.id IS NULL')                 // pas de message non lu
  .andWhere('chat.last_poste_message_at IS NULL')    // aucune réponse envoyée
  .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
  .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
this.applyPosteFilter(lusSansQb, 'chat', options);

// --- lusAvecQb : LEFT JOIN + unread_msg.id IS NULL → chats sans msg non lu ET avec réponse poste
const lusAvecQb = this.chatRepository
  .createQueryBuilder('chat')
  .select('COUNT(DISTINCT chat.id)', 'cnt')
  .leftJoin(
    'whatsapp_message', 'unread_msg',
    `unread_msg.chat_id = chat.chat_id AND unread_msg.from_me = 0
     AND unread_msg.status IN ('sent','delivered') AND unread_msg.deletedAt IS NULL`,
  )
  .where('chat.deletedAt IS NULL')
  .andWhere('unread_msg.id IS NULL')                     // pas de message non lu
  .andWhere('chat.last_poste_message_at IS NOT NULL')    // au moins une réponse
  .andWhere('chat.last_activity_at >= :dateStart', { dateStart })
  .andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd });
this.applyPosteFilter(lusAvecQb, 'chat', options);

const [nonLusResult, lusSansResult, lusAvecResult] = await Promise.all([
  nonLusQb.getRawOne(),
  lusSansQb.getRawOne(),
  lusAvecQb.getRawOne(),
]);
const chatsNonLus        = parseInt(nonLusResult?.cnt)   || 0;
const chatsLusSansReponse = parseInt(lusSansResult?.cnt) || 0;
const chatsLusAvecReponse = parseInt(lusAvecResult?.cnt) || 0;
```

**Retirer complètement les trois `addSelect` basés sur `unread_count` de `statsQb` :**

```typescript
// SUPPRIMER ces trois lignes de statsQb :
// .addSelect('SUM(CASE WHEN chat.unread_count > 0 ...',       'non_lus')
// .addSelect('SUM(CASE WHEN chat.unread_count = 0 AND ...',   'lus_sans_reponse')
// .addSelect('SUM(CASE WHEN chat.unread_count = 0 AND ...',   'lus_avec_reponse')
// Ne pas référencer stats?.non_lus / stats?.lus_sans_reponse / stats?.lus_avec_reponse
```

**Retourner** les trois valeurs depuis les requêtes dédiées :
```typescript
return {
  ...
  chatsNonLus,          // INNER JOIN EXISTS
  chatsLusSansReponse,  // LEFT JOIN IS NULL + last_poste_message_at IS NULL
  chatsLusAvecReponse,  // LEFT JOIN IS NULL + last_poste_message_at IS NOT NULL
  ...
};
```

**Fix complémentaire — basculer `statsQb` de `getMetriquesChats()` sur `last_activity_at` :**

`statsQb` (qui calcule `totalChats`, `chatsActifs`, `chatsFermes`, etc.) filtre actuellement sur `chat.createdAt`. Il faut le basculer sur `chat.last_activity_at` pour que tous les KPIs de la méthode soient cohérents sur la même fenêtre :

```typescript
// Remplacer dans statsQb :
// .andWhere('chat.createdAt >= :dateStart', { dateStart })
// .andWhere('chat.createdAt <= :dateEnd',   { dateEnd })
// Par :
.andWhere('chat.last_activity_at >= :dateStart', { dateStart })
.andWhere('chat.last_activity_at <= :dateEnd',   { dateEnd })
```

> Après ces corrections, `chatsNonLus + chatsLusSansReponse + chatsLusAvecReponse` ≈ `totalChats`
> de la période — tous filtrés par la même fenêtre `last_activity_at`.

---

### US-2 — Corriger le fallback date dans `findAll()`

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`
**Méthode :** `findAll()`

**Problème actuel :**
```typescript
if (dateStart) {
  qb.andWhere(
    '(chat.last_activity_at >= :dateStart OR chat.unread_count > 0)',
    { dateStart },
  );
}
```

**Fix — règle unique `last_activity_at` dans les deux modes :**

```typescript
// Filtre date : identique en mode normal et en mode unreadOnly
if (dateStart) {
  qb.andWhere('chat.last_activity_at >= :dateStart', { dateStart });
}

// Filtre non lus : s'ajoute au filtre date si unreadOnly
if (unreadOnly) {
  qb.andWhere(
    `EXISTS (
      SELECT 1 FROM whatsapp_message m
      WHERE m.chat_id = chat.chat_id
        AND m.from_me = 0
        AND m.status IN ('sent','delivered')
        AND m.deletedAt IS NULL
    )`,
  );
}
```

Le fallback `OR EXISTS(...)` est supprimé. Il n'est plus nécessaire : si un message non lu a été reçu aujourd'hui sur une conversation ancienne, sa `last_activity_at` est aujourd'hui — elle sera incluse normalement par le filtre de date.

**Fix complémentaire — aligner `statsQb.totalUnread` sur la même règle :**

`statsQb` (lignes 439+) calcule `totalUnread` sans filtre date. Actuellement intentionnel (badge global du poste), mais incohérent avec le KPI et la liste. Ajouter le filtre `last_activity_at` pour aligner les trois :

```typescript
// Dans statsQb, après le .where('chat.deletedAt IS NULL') :
if (dateStart) {
  statsQb.andWhere('chat.last_activity_at >= :dateStart', { dateStart });
}
```

> **Effet de bord assumé :** `totalAll`, `totalActifs`, `totalEnAttente`, `totalFermes` sont aussi dans `statsQb` — ils deviendront eux aussi filtrés par période. C'est cohérent : tous les compteurs du badge reflètent la même fenêtre. Le badge "12 non lus" signifiera "12 conversations non lues actives sur la période" et non plus "12 non lus depuis toujours".
>
> **Note `dateEnd` :** `findAll()` ne reçoit pas `dateEnd` dans son API actuelle — le filtre est donc `[dateStart, maintenant]` (période ouverte). `getMetriquesChats()` borne avec `dateEnd`. Les deux sont cohérents dès lors qu'on compare sur la même période ouverte, ce qui est le cas en pratique (l'admin sélectionne une période qui se termine maintenant).

---

### US-3 — Ignorer le filtre statut quand `unreadOnly = true` (backend + front)

**Contexte :** "Non lu" signifie à traiter peu importe le statut → le filtre statut ne doit jamais masquer une conversation non lue.

#### 3a — Backend `findAll()`

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

**Problème actuel :**
```typescript
if (status) {
  qb.andWhere('chat.status = :status', { status });
}

if (unreadOnly) {
  qb.andWhere(`EXISTS (...)`);
}
```

Ces deux conditions s'appliquent simultanément → une conversation `fermé` avec messages non lus disparaît si `status='actif'` est actif.

**Fix :**
```typescript
// Le filtre statut ne s'applique pas en mode non lus
if (status && !unreadOnly) {
  qb.andWhere('chat.status = :status', { status });
}

if (unreadOnly) {
  qb.andWhere(
    `EXISTS (
      SELECT 1 FROM whatsapp_message m
      WHERE m.chat_id = chat.chat_id
        AND m.from_me = 0
        AND m.status IN ('sent','delivered')
        AND m.deletedAt IS NULL
    )`,
  );
}
```

#### 3b — Frontend `ConversationsView.tsx`

**Aucune modification de code nécessaire.**

Le filtre est déjà un état unique mutuellement exclusif :

```typescript
// État réel dans ConversationsView.tsx
type StatusFilter = 'actif' | 'en attente' | 'fermé' | 'unread' | null;
const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
```

`'unread'` est une valeur du même état que `'actif'` / `'fermé'` — impossible d'en avoir deux actifs simultanément. L'appel API est déjà correct (lignes 119-120) :

```typescript
statusFilter !== 'unread' ? (statusFilter ?? undefined) : undefined,  // status
statusFilter === 'unread',                                              // unreadOnly
```

Quand `statusFilter === 'unread'` : `status = undefined`, `unreadOnly = true`. Le backend reçoit bien `unreadOnly` sans filtre statut.

> Aucun `setUnreadOnly` séparé à ajouter — ne pas modifier ce composant.

---

### US-4 — `findByPosteId()` commercial (défensif, P2)

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`
**Méthode :** `findByPosteId()`

**Contexte :** Non critique aujourd'hui. `findByPosteId()` utilise déjà `EXISTS(...)` pour le critère `unreadOnly`. La gateway passe `excludeStatuses = []`, donc l'exclusion de statuts ne bloque pas le front commercial en pratique.

**Changement défensif :**
```typescript
// excludeStatuses ne s'applique pas en mode non lus
if (excludeStatuses.length > 0 && !unreadOnly) {
  qb.andWhere('chat.status NOT IN (:...excludeStatuses)', { excludeStatuses });
}
```

Ce changement protège contre une future évolution où `excludeStatuses` serait non vide côté gateway. À faire après US-1/2/3.

---

### US-5 — Subtitle KPI "Non lus" dans le dashboard admin

Les KPIs `chatsNonLus` respectent maintenant la fenêtre de dates. Aucune mention "Toutes périodes" n'est nécessaire. Vérifier / aligner le subtitle dans les deux fichiers qui affichent ce KPI :

**Fichier 1 :** `admin/src/app/ui/OverviewView.tsx`
**Fichier 2 :** `admin/src/app/ui/DedicatedChannelsView.tsx` (subtitle déjà correct : `"Conversations avec messages non lus"`)

Subtitle cible dans les deux :
```tsx
subtitle="Conversations avec messages non lus"
```

Supprimer toute mention `"Toutes périodes"` ou `"dette active"` si elle avait été ajoutée.

---

### US-6 — Index MySQL (aucune migration nécessaire)

**L'index existe déjà.**

Fichier : `message_whatsapp/src/database/migrations/20260409_add_scale_indexes.ts`
Index : `IDX_msg_chat_status ON whatsapp_message (chat_id, from_me, status, deletedAt)`

Ce sont exactement les colonnes utilisées par le critère EXISTS canonique. **Ne pas créer `IDX_msg_unread_lookup` — ce serait un doublon inutile.**

Action à faire : aucune migration. Optionnel : ajouter l'annotation `@Index` dans l'entité `WhatsappMessage` pour documenter côté code que cet index supporte les requêtes non lus, si ce n'est pas déjà présent.

---

## Récapitulatif des fichiers à modifier

| Fichier | US | Changement |
|---|---|---|
| `metriques.service.ts` | US-1 | 3 requêtes dédiées INNER/LEFT JOIN avec filtre `last_activity_at` ; basculer `statsQb` de `createdAt` → `last_activity_at` |
| `whatsapp_chat.service.ts` | US-2 | Filtre date simplifié : `last_activity_at >= dateStart` dans les deux modes ; `statsQb` : ajouter `last_activity_at` pour aligner tous les badges |
| `whatsapp_chat.service.ts` | US-3a | `if (status && !unreadOnly)` — backend ignore statut en mode non lus |
| `ConversationsView.tsx` | US-3b | **Aucune modification** — `StatusFilter` union déjà mutuellement exclusif |
| `whatsapp_chat.service.ts` | US-4 | `unreadOnly=true` → ignorer `excludeStatuses` dans `findByPosteId` (défensif) |
| `OverviewView.tsx` | US-5 | Subtitle KPI "Non lus" → `"Conversations avec messages non lus"` |
| ~~Migration SQL~~ | ~~US-6~~ | ~~Index~~ — **index déjà existant** `IDX_msg_chat_status` |

---

## Comportement attendu après correction

| Scénario | Avant | Après |
|---|---|---|
| Conv. fermée avec message non lu + filtre "Non lus" | Disparaît si statut "actif" sélectionné | Backend ignore statut (US-3a) ; UI déjà mutuellement exclusif |
| Conv. créée il y a 3 mois non lue, inactive depuis | Hors période, invisible | Invisible (`last_activity_at` ancienne, hors période) |
| Conv. créée il y a 3 mois non lue, active aujourd'hui | Hors période, invisible dans liste | Visible dans liste (`last_activity_at` récent) |
| `unread_count=0` mais message sent/delivered | Invisible dans Overview KPI | Visible (critère EXISTS) |
| Overview KPI = Admin totalUnread = filtre liste | ❌ Valeurs différentes | ✅ Identiques (tous filtrés par `last_activity_at`) |
| `chatsLusSansReponse` + `chatsNonLus` | Peuvent se chevaucher si désync | Mutuellement exclusifs (EXISTS / NOT EXISTS) |
| Conversation rouverte après fermeture | Peut disparaître de la liste | Toujours présente si non lue |

---

## Ordre d'implémentation

```
US-1 (metriques.service.ts)
  → US-2 (findAll date fallback)
    → US-3a (backend findAll — ignorer statut si unreadOnly)
    → US-3b (UI ConversationsView — no-op, déjà correct)
    → US-5 (subtitle OverviewView.tsx)
      → US-4 (findByPosteId défensif — P2)
```

US-6 (ex-US-5) supprimé (index déjà existant). US-3 inclut backend (`findAll`) + pas de changement UI (déjà correct). US-5 (subtitle) et US-4 (défensif) restent les derniers.

> Décision métier actée : "non lu = à traiter peu importe le statut" → US-3a backend inclus.
