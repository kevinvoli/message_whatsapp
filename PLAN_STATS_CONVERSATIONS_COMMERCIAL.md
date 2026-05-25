# Plan — Statistiques conversations commercial (mode Conversations)

> **Branche :** `production`  
> **Date :** 2026-05-25  
> **Dépend de :** `ActivityPanel.tsx` + `CommercialStatsService` existants  
> **Statut :** 📋 À implémenter

---

## 1. Contexte

### État actuel — mode "Messages" (`ActivityPanel.tsx`)

Le panneau latéral affiche aujourd'hui 4 métriques **centrées sur les messages** :

| Card | Source |
|---|---|
| Messages reçus | `messagesRead` — nb de messages IN lus par le commercial |
| Traités | `messagesHandled` — nb de premières réponses du commercial (`isFirstReply = true`) |
| Conversations | `activeConversations` — conversations ACTIF du poste |
| Dernière act. | `lastActivityAt` |
| Barre taux de réponse | `responseRate = messagesHandled / messagesRead` |

API : `GET /auth/me/stats?periode=today|week|month|year&dateFrom=&dateTo=`  
Service : `CommercialStatsService.getStats()` — 2 requêtes en `Promise.all`

### Objectif

Ajouter un **toggle "Messages / Conversations"** dans le panneau.  
Le mode **Conversations** affiche des métriques centrées sur les conversations :

| Métrique | Définition exacte |
|---|---|
| **Conversations reçues** | Conversations que le commercial a ouvertes/lues (au moins un message IN marqué lu par lui dans la période) |
| **Conversations répondues** | Conversations auxquelles le commercial a envoyé au moins un message OUT dans la période |
| **Conversations traitées** | Conversations dont le commercial a envoyé le **dernier message global** du chat (pas de message plus récent d'un autre) |
| **Taux de réponse** | `conversationsReplied / conversationsReceived × 100` — calculé côté client |
| **Taux de traitement** | `conversationsHandled / conversationsReplied × 100` — calculé côté client |

---

## 2. Définition SQL des 3 métriques

### 2.1 `conversationsReceived` — conversations lues

```sql
SELECT COUNT(DISTINCT m.chat_id) AS cnt
FROM whatsapp_message m
WHERE m.read_by_commercial_id = :commercialId
  AND m.direction = 'IN'
  AND m.read_by_commercial_at >= :dateStart
  AND m.read_by_commercial_at <= :dateEnd
  AND m.deletedAt IS NULL
```

> Utilise l'index `IDX_msg_commercial_dir_time` ou le scan partiel sur
> `read_by_commercial_id`. Le `DISTINCT chat_id` agrège sans row lookup
> si on ajoute un index (voir section migration optionnelle).

### 2.2 `conversationsReplied` — conversations où le commercial a répondu

```sql
SELECT COUNT(DISTINCT m.chat_id) AS cnt
FROM whatsapp_message m
WHERE m.commercial_id = :commercialId
  AND m.direction = 'OUT'
  AND m.createdAt >= :dateStart
  AND m.createdAt <= :dateEnd
  AND m.deletedAt IS NULL
```

> Utilise `IDX_msg_commercial_dir_time (commercial_id, direction, createdAt)`.
> Index existant — pas de migration nécessaire.

### 2.3 `conversationsHandled` — le commercial a le dernier message

```sql
SELECT COUNT(*) AS cnt
FROM (
  SELECT m.chat_id
  FROM whatsapp_message m
  WHERE m.commercial_id = :commercialId
    AND m.direction = 'OUT'
    AND m.createdAt >= :dateStart
    AND m.createdAt <= :dateEnd
    AND m.deletedAt IS NULL
  GROUP BY m.chat_id
  HAVING MAX(m.createdAt) = (
    SELECT MAX(m2.createdAt)
    FROM whatsapp_message m2
    WHERE m2.chat_id = m.chat_id
      AND m2.deletedAt IS NULL
  )
) AS sub
```

> **Lecture :** pour chaque conversation travaillée dans la période, le `HAVING`
> vérifie que le dernier message du commercial est aussi le dernier message du chat toutes
> directions confondues. Si un client a répondu après, la conversation est exclue.
>
> La sous-requête corrélée `MAX(m2.createdAt)` est évaluée par `chat_id` et utilise
> `IDX_msg_response_time (chat_id, direction, timestamp)`. Acceptable pour quelques
> dizaines de conversations par commercial.

---

## 3. Aucune migration SQL nécessaire

Toutes les colonnes utilisées existent :
- `whatsapp_message.read_by_commercial_id` — renseigné par `MessageReadService`
- `whatsapp_message.read_by_commercial_at` — renseigné par `MessageReadService`
- `whatsapp_message.commercial_id` — renseigné à l'envoi du message OUT
- `whatsapp_message.direction` — IN / OUT
- Index `IDX_msg_commercial_dir_time (commercial_id, direction, createdAt)` déjà présent

---

## 4. User Stories

### US-1 — Backend : enrichir `CommercialStatsDto` [DTO]

**Fichier :** `message_whatsapp/src/whatsapp_commercial/dto/commercial-stats.dto.ts`

```typescript
export class CommercialStatsDto {
  // ── Métriques messages (existantes) ────────────────────────────────────────
  messagesRead:          number;
  messagesHandled:       number;
  activeConversations:   number;
  responseRate:          number;   // % = messagesHandled / messagesRead
  lastActivityAt:        Date | null;
  isOnline:              boolean;

  // ── Métriques conversations (NOUVELLES) ────────────────────────────────────
  /** Conversations dont au moins un message IN a été lu par ce commercial */
  conversationsReceived:  number;

  /** Conversations auxquelles ce commercial a envoyé au moins un message OUT */
  conversationsReplied:   number;

  /** Conversations dont ce commercial a envoyé le dernier message global */
  conversationsHandled:   number;
}
```

---

### US-2 — Backend : enrichir `CommercialStatsService.getStats()` [SERVICE]

**Fichier :** `message_whatsapp/src/whatsapp_commercial/commercial-stats.service.ts`

Ajouter les 3 nouvelles requêtes dans le `Promise.all` existant :

```typescript
const [
  messagesRead,
  messagesHandled,
  conversationsReceived,
  conversationsReplied,
  conversationsHandledRows,
] = await Promise.all([

  // ── Index 0 : messagesRead — INCHANGÉ (COUNT individuel de messages lus) ──
  // ⚠️ NE PAS remplacer par COUNT DISTINCT chat_id — ce compteur mesure les
  // messages vus, pas les conversations. Les deux métriques coexistent.
  this.messageRepository
    .createQueryBuilder('m')
    .where('m.readByCommercialId = :id', { id: commercialId })
    .andWhere('m.direction = :dir', { dir: MessageDirection.IN })
    .andWhere('m.readByCommercialAt >= :dateStart', { dateStart })
    .andWhere('m.readByCommercialAt <= :dateEnd',   { dateEnd })
    .getCount(),

  // ── Index 1 : messagesHandled — INCHANGÉ ─────────────────────────────────
  this.messageRepository
    .createQueryBuilder('m')
    .where('m.commercial_id = :id', { id: commercialId })
    .andWhere('m.isFirstReply = :isFirstReply', { isFirstReply: true })
    .andWhere('m.createdAt >= :dateStart', { dateStart })
    .andWhere('m.createdAt <= :dateEnd',   { dateEnd })
    .getCount(),

  // ── Index 2 : NOUVEAU — conversations reçues (lues) ───────────────────────
  // COUNT DISTINCT chat_id ≠ messagesRead (index 0) :
  // messagesRead = nb de messages individuels vus
  // conversationsReceived = nb de conversations distinctes dans lesquelles au
  //   moins un message IN a été lu dans la période
  this.messageRepository
    .createQueryBuilder('m')
    .select('COUNT(DISTINCT m.chat_id)', 'cnt')
    .where('m.readByCommercialId = :id', { id: commercialId })
    .andWhere('m.direction = :dir', { dir: MessageDirection.IN })
    .andWhere('m.readByCommercialAt >= :dateStart', { dateStart })
    .andWhere('m.readByCommercialAt <= :dateEnd',   { dateEnd })
    .getRawOne<{ cnt: string }>(),

  // ── Index 3 : NOUVEAU — conversations répondues ───────────────────────────
  this.messageRepository
    .createQueryBuilder('m')
    .select('COUNT(DISTINCT m.chat_id)', 'cnt')
    .where('m.commercial_id = :id', { id: commercialId })
    .andWhere('m.direction = :dir', { dir: MessageDirection.OUT })
    .andWhere('m.createdAt >= :dateStart', { dateStart })
    .andWhere('m.createdAt <= :dateEnd',   { dateEnd })
    .getRawOne<{ cnt: string }>(),

  // ── Index 4 : NOUVEAU — conversations traitées (dernier message) — raw SQL ─
  this.messageRepository.query(
    `SELECT COUNT(*) AS cnt
     FROM (
       SELECT m.chat_id
       FROM whatsapp_message m
       WHERE m.commercial_id = ?
         AND m.direction = 'OUT'
         AND m.createdAt >= ?
         AND m.createdAt <= ?
         AND m.deletedAt IS NULL
       GROUP BY m.chat_id
       HAVING MAX(m.createdAt) = (
         -- Pas de filtre de date sur m2 : on cherche le DERNIER message global
         -- du chat (toutes périodes confondues), pas seulement dans la période.
         -- Si un client a répondu après la fin de la période, la conversation
         -- sort du compteur "traitées" — comportement voulu.
         SELECT MAX(m2.createdAt)
         FROM whatsapp_message m2
         WHERE m2.chat_id = m.chat_id
           AND m2.deletedAt IS NULL
       )
     ) AS sub`,
    [commercialId, dateStart, dateEnd],
  ) as Promise<Array<{ cnt: string }>>,
]);

const dto = new CommercialStatsDto();
dto.messagesRead           = messagesRead;           // inchangé — COUNT messages individuels
dto.messagesHandled        = messagesHandled;        // inchangé
dto.activeConversations    = activeConversations;    // inchangé
dto.responseRate           = responseRate;           // inchangé

dto.conversationsReceived  = parseInt(conversationsReceived?.cnt  ?? '0');
dto.conversationsReplied   = parseInt(conversationsReplied?.cnt   ?? '0');
dto.conversationsHandled   = parseInt(conversationsHandledRows?.[0]?.cnt ?? '0');
```

> **`messagesRead` vs `conversationsReceived`** : deux métriques distinctes.
> - `messagesRead` (index 0) = `getCount()` — nombre de **messages** individuels lus (affiché en mode Messages)
> - `conversationsReceived` (index 2) = `COUNT(DISTINCT chat_id)` — nombre de **conversations** uniques lues (affiché en mode Conversations)
>
> Les deux requêtes s'exécutent en parallèle dans le même `Promise.all` — pas de surcoût réseau.

> **Performance `conversationsHandled`** : la sous-requête corrélée `MAX(m2.createdAt)`
> est évaluée une fois par `chat_id`. Pour 20-50 conversations/jour, le coût est
> négligeable (<10ms). Au-delà, un index couvrant sur `(chat_id, createdAt, deletedAt)`
> pourrait être ajouté (migration optionnelle future).

---

### US-3 — Frontend : types + toggle + affichage [FRONT]

#### 3.1 — `front/src/types/chat.ts` — enrichir `CommercialStatsDto`

```typescript
/** Réponse de GET /auth/me/stats */
export type CommercialStatsDto = {
  // Mode messages (existant)
  messagesRead:         number;
  messagesHandled:      number;
  activeConversations:  number;
  responseRate:         number;
  lastActivityAt:       string | null;
  isOnline:             boolean;

  // Mode conversations (NOUVEAU)
  conversationsReceived: number;
  conversationsReplied:  number;
  conversationsHandled:  number;
};
```

#### 3.2 — `front/src/components/sidebar/ActivityPanel.tsx` — toggle + nouveau mode

**Nouveau state local :**
```typescript
const [mode, setMode] = useState<'messages' | 'conversations'>('messages');
```

**Toggle composant (local au fichier) :**
```tsx
function ModeToggle({
  value, onChange,
}: { value: 'messages' | 'conversations'; onChange: (v: 'messages' | 'conversations') => void }) {
  return (
    <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-100 p-0.5 gap-0.5">
      {(['messages', 'conversations'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
            value === m
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {m === 'messages' ? 'Messages' : 'Conversations'}
        </button>
      ))}
    </div>
  );
}
```

**Grille conversations (rendu conditionnel) :**
```tsx
{mode === 'conversations' && stats && (
  <>
    <div className="grid grid-cols-2 gap-3">
      {/* Conversations reçues */}
      <div className="bg-blue-50 rounded-lg p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-blue-600">
          <Inbox className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium truncate">Conv. reçues</span>
        </div>
        <p className="text-2xl font-bold text-blue-800">
          {stats.conversationsReceived}
        </p>
      </div>

      {/* Conversations répondues */}
      <div className="bg-green-50 rounded-lg p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-green-600">
          <Reply className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium truncate">Répondues</span>
        </div>
        <p className="text-2xl font-bold text-green-800">
          {stats.conversationsReplied}
        </p>
      </div>

      {/* Conversations traitées */}
      <div className="bg-emerald-50 rounded-lg p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-emerald-600">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium truncate">Traitées</span>
        </div>
        <p className="text-2xl font-bold text-emerald-800">
          {stats.conversationsHandled}
        </p>
      </div>

      {/* Conversations actives (réutilisé) */}
      <div className="bg-purple-50 rounded-lg p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-purple-600">
          <Activity className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium truncate">Actives</span>
        </div>
        <p className="text-2xl font-bold text-purple-800">
          {stats.activeConversations}
        </p>
      </div>
    </div>

    {/* Taux de réponse conversations */}
    {stats.conversationsReceived > 0 && (
      <ConvRateBar
        label="Taux de réponse"
        value={Math.min(
          Math.round((stats.conversationsReplied / stats.conversationsReceived) * 1000) / 10,
          100,
        )}
      />
    )}

    {/* Taux de traitement */}
    {stats.conversationsReplied > 0 && (
      <ConvRateBar
        label="Taux de traitement"
        value={Math.min(
          Math.round((stats.conversationsHandled / stats.conversationsReplied) * 1000) / 10,
          100,
        )}
      />
    )}
  </>
)}
```

**Composant `ConvRateBar` (local, réutilise le style de la barre existante) :**
```tsx
function ConvRateBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-orange-400' : 'bg-red-400';
  const textColor = value >= 80 ? 'text-green-600' : value >= 60 ? 'text-orange-500' : 'text-red-500';
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className={`text-sm font-bold ${textColor}`}>{value.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`}
             style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
```

**Icônes à importer depuis `lucide-react` :**
```typescript
import { Inbox, Reply, CheckCircle, /* ... existants */ } from 'lucide-react';
```

**Intégration du toggle** — placer entre l'en-tête et les cards :
```tsx
{/* Toggle mode */}
<ModeToggle value={mode} onChange={setMode} />

{/* Grille messages (existante, conditionnelle) */}
{mode === 'messages' && stats && (
  <>
    {/* ... code existant inchangé ... */}
  </>
)}

{/* Grille conversations (nouvelle) */}
{mode === 'conversations' && stats && (
  <>
    {/* ... nouveau code ... */}
  </>
)}
```

---

## 5. Récapitulatif des métriques — mode Conversations

| Métrique | Calcul | Interprétation |
|---|---|---|
| **Conv. reçues** | `COUNT(DISTINCT chat_id)` des messages IN lus par le commercial | "Combien de clients m'ont contacté aujourd'hui ?" |
| **Conv. répondues** | `COUNT(DISTINCT chat_id)` des messages OUT envoyés | "Combien de clients ai-je répondu ?" |
| **Conv. traitées** | Conversations dont j'ai le dernier message | "Combien de conversations ai-je 'fermées' de mon côté ?" |
| **Conversations actives** | Status ACTIF du poste (existant) | "Combien de clients attendent encore ?" |
| **Taux de réponse** | `répondues / reçues × 100` | "Ai-je répondu à tous mes clients ?" |
| **Taux de traitement** | `traitées / répondues × 100` | "Dans mes réponses, ai-je eu le dernier mot ?" |

---

## 6. Séquence d'implémentation

```
Étape 1 — CommercialStatsDto (backend)                        ~10 min
  └── Ajouter conversationsReceived, conversationsReplied, conversationsHandled

Étape 2 — CommercialStatsService.getStats() (backend)         ~45 min
  ├── Restructurer Promise.all pour 5 requêtes parallèles
  ├── Requêtes 3 et 4 : COUNT DISTINCT chat_id via QueryBuilder
  ├── Requête 5 : raw SQL HAVING MAX + sous-requête corrélée
  └── Mapper les résultats dans le DTO

Étape 3 — CommercialStatsDto type (frontend)                  ~5 min
  └── front/src/types/chat.ts : +3 champs

Étape 4 — ActivityPanel.tsx (frontend)                        ~45 min
  ├── Ajouter state mode + ModeToggle
  ├── Conditionner le rendu existant sur mode === 'messages'
  ├── Ajouter grille conversations + 2 barres taux
  ├── Importer Inbox, Reply, CheckCircle depuis lucide-react
  └── Vérifier que le rafraîchissement fonctionne pour les deux modes

Total estimé : ~1h45
```

---

## 7. Fichiers créés / modifiés

| Fichier | Action | Détail |
|---|---|---|
| `src/whatsapp_commercial/dto/commercial-stats.dto.ts` | Modifier | `+conversationsReceived`, `+conversationsReplied`, `+conversationsHandled` |
| `src/whatsapp_commercial/commercial-stats.service.ts` | Modifier | Restructurer `Promise.all` + 3 nouvelles requêtes |
| `front/src/types/chat.ts` | Modifier | `+3 champs` dans `CommercialStatsDto` |
| `front/src/components/sidebar/ActivityPanel.tsx` | Modifier | Toggle `ModeToggle` + grille conversations + `ConvRateBar` |

**Total : 0 créé + 4 modifiés — Aucune migration SQL**

---

## 8. Tests manuels

| Scénario | Attendu |
|---|---|
| Toggle "Messages" → "Conversations" | Grille bascule sans rechargement |
| Période `today`, aucune activité | Tous les compteurs à `0`, barres de taux absentes |
| Commercial a lu 5 conv, répondu à 3, a le dernier mot dans 2 | `reçues=5`, `répondues=3`, `traitées=2` |
| Taux de réponse = 3/5 | `60.0%` en orange |
| Taux de traitement = 2/3 | `66.7%` en orange |
| Client répond après le commercial | La conversation sort du compteur `traitées` |
| Changement de période (week → today) | Rechargement et mise à jour des 6 métriques |

---

*Plan rédigé le 2026-05-25 — s'appuie sur `ActivityPanel.tsx` et `CommercialStatsService` existants.*
