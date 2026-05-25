# Plan — Correction unread_count + filtres/tri conversations (front commercial)

> **Branche :** `production`
> **Date :** 2026-05-25 (v3 — après audit approfondi + recommandations intégrées)
> **Statut :** 📋 À implémenter

---

## 1. Diagnostic complet

### 1.1 Bug A — Discordance unread_count entre admin et front commercial

**Symptôme :** Le badge "N non lus" affiché dans l'admin pour un poste diffère du badge
affiché sur le front du commercial du même poste.

#### Cause racine 1 — `recomputeUnreadCount()` utilise une condition trop large

```typescript
// whatsapp_chat.service.ts ligne ~262
// ❌ Actuel — compte TOUS les messages IN non-read (inclut pending, played, deleted…)
AND m.direction = 'IN'
AND m.status != 'READ'

// ✅ Cible — aligné sur les badges (countUnreadMessagesBulk / getTotalUnreadForPoste)
AND m.from_me = 0
AND m.status IN ('sent', 'delivered')
```

La colonne DB `unread_count` peut être **plus élevée** que ce que les badges retournent.
Exemple : un message audio lu (status='played') reste compté dans la colonne DB mais
absent des badges → le badge global affiche 5, la liste "non lus" n'en montre que 3.

#### Cause racine 2 — `unreadOnly` filtre sur colonne DB potentiellement gonflée

```typescript
// whatsapp_chat.service.ts ligne 79-80
if (unreadOnly) {
  qb.andWhere('chat.unread_count > 0');  // ← colonne DB stale
}
```

Si `unread_count` DB > 0 (à cause de CR1) mais que le comptage live retourne 0,
la conversation passe le filtre serveur et apparaît dans la liste "Non lus" avec
**0 messages non lus affichés**.

#### Cause racine 3 — Conversations **fermées** comptées dans `totalUnread`

`getTotalUnreadForPoste()` (ligne 113-128) et la requête stats de `findAll()` (ligne 416-432)
n'ont pas de filtre `chat.status != 'fermé'`. Une conversation fermée ayant reçu un
message après fermeture gonfle le badge sans jamais apparaître dans la liste active.

---

### 1.2 Bug B — Bugs d'affichage et de tri sur le front commercial

#### Cause 1 — Double filtre incohérent pour "Non lus"

Le serveur filtre avec `unread_count > 0` (DB colonne stale), le client re-filtre avec
`conv.unreadCount > 0` (live). Si DB dit >0 mais live dit 0 → la conversation disparaît
silencieusement de la liste après activation du filtre.

#### Cause 2 — `last_activity_at` peut être null dans un UPSERT → conversation ne remonte pas

Dans `updateConversation` (UPSERT), si le serveur retourne `last_activity_at = null`,
le merge écrase la valeur existante (non nulle) et le tri tombe sur `updatedAt` (souvent
beaucoup plus ancien) → la conversation ne remonte pas en tête de liste.

#### Cause 3 — `totalUnread` badge global pas mis à jour après lecture

Après `conversation:read:ack`, le store remet `unreadCount = 0` ✓ mais le badge
global `totalUnread` reste incorrect jusqu'au prochain `TOTAL_UNREAD_UPDATE` (qui
n'est émis qu'au premier chargement de page ou après `messages:read`).

#### Cause 4 — `TOTAL_UNREAD_UPDATE` unicast dans `messages:read` (ligne 799)

```typescript
// gateway.ts ligne 799 — ❌ seul le lecteur reçoit la mise à jour
client.emit('chat:event', { type: 'TOTAL_UNREAD_UPDATE', payload: { totalUnread } });
```

Pour les postes multi-commerciaux, quand un commercial lit une conversation, les
badges des collègues du même poste ne se mettent jamais à jour.

#### Cause 5 — `CONVERSATION_ASSIGNED` sans `TOTAL_UNREAD_UPDATE`

Quand une nouvelle conversation est assignée (`CONVERSATION_ASSIGNED`), `addConversation`
l'ajoute à la liste avec son badge rouge. Mais `totalUnread` n'est jamais mis à jour →
le badge global ne reflète pas la nouvelle conversation jusqu'au prochain reload.

#### Cause 6 — Filtre "Nouveau" + auto-load : `autoLoadCountRef` non réinitialisé sur recherche

`ConversationList.tsx` ligne 50-53 :
```typescript
useEffect(() => { autoLoadCountRef.current = 0; }, [filterStatus]); // seulement filterStatus
```
Si l'utilisateur tape une recherche **sans changer de filtre**, le compteur d'auto-load
reste épuisé → plus d'auto-load pour la nouvelle requête serveur.

#### Cause 7 — `appendConversations` garde la version stale si une conversation revient en page 2

```typescript
// chatStore.ts ligne 402
const newOnes = normalized.filter((c) => !existingIds.has(c.chat_id));
// ↑ La version fraîche du serveur est jetée si la conversation existe déjà
```

Si une conversation de page 1 a été mise à jour et réapparaît dans la page suivante
(elle a remonté dans l'ordre), la version fraîche est silencieusement ignorée au
profit de l'ancienne. La conversation reste à sa position stale.

---

## 2. Corrections

### US-B0 — Backend : batch fix des données existantes gonflées ✦ DÉPLOIEMENT

**Contexte :** Après déploiement de US-B1, `recomputeUnreadCount` sera correct pour les appels
futurs. Mais les conversations avec un `unread_count` déjà gonflé en base restent incorrectes
jusqu'au prochain déclencheur (nouveau message, lecture). Sans ce fix, les commerciaux voient
une incohérence résiduelle pendant des heures voire des jours après le déploiement.

**Script SQL one-time (à exécuter au déploiement, avant redémarrage du backend) :**

```sql
-- 1. Forcer unread_count = 0 pour toutes les conversations fermées
UPDATE whatsapp_chat
SET unread_count = 0
WHERE status = 'fermé';

-- 2. Recalculer unread_count pour toutes les conversations actives
--    (aligne la colonne DB sur la même logique que US-B1)
UPDATE whatsapp_chat c
SET c.unread_count = (
  SELECT COUNT(*)
  FROM whatsapp_message m
  WHERE m.chat_id = c.chat_id
    AND m.from_me = 0
    AND m.status IN ('sent', 'delivered')
    AND m.deleted_at IS NULL
)
WHERE c.status != 'fermé'
  AND c.deleted_at IS NULL;
```

> Aucune migration TypeORM nécessaire (schéma inchangé). S'exécute une seule fois.
> Durée estimée : quelques secondes à quelques minutes selon le volume de données.

---

### US-B1 — Backend : unifier la condition unread dans `recomputeUnreadCount` ✦ CRITIQUE

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

```typescript
// AVANT
AND m.direction = 'IN'
AND m.status != 'READ'

// APRÈS — aligné sur countUnreadMessagesBulk + getTotalUnreadForPoste
AND m.from_me = 0
AND m.status IN ('sent', 'delivered')
```

**Impact :** Colonne DB `unread_count` cohérente avec tous les comptages live. Résout
automatiquement la discordance admin ↔ front et le filtre `unreadOnly` (CR1 + CR2).

---

### US-B2 — Backend : exclure les conversations fermées des badges unread

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

**1. Dans `getTotalUnreadForPoste()` (ligne 113-128) :**

```typescript
.innerJoin('whatsapp_chat', 'c', 'c.chat_id = m.chat_id')
.where('c.poste_id = :poste_id', { poste_id })
.andWhere('c.deletedAt IS NULL')
.andWhere("c.status != 'fermé'")   // ← AJOUT
.andWhere('m.from_me = :fromMe', { fromMe: false })
.andWhere('m.status IN (:...statuses)', { statuses: ['sent', 'delivered'] })
.andWhere('m.deletedAt IS NULL')
```

**2. Dans `findAll()` — requête stats globales (ligne 421-430) :**

```typescript
SUM(CASE WHEN chat.status != 'fermé' AND EXISTS (   // ← AJOUT : AND chat.status != 'fermé'
  SELECT 1 FROM whatsapp_message m
  WHERE m.chat_id = chat.chat_id
    AND m.from_me = 0
    AND m.status IN ('sent','delivered')
    AND m.deletedAt IS NULL
) THEN 1 ELSE 0 END) AS totalUnread
```

---

### US-B3 — Backend : `TOTAL_UNREAD_UPDATE` broadcast après `messages:read` ✦ IMPORTANT

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Dans le handler `messages:read` (ligne 797-802), passer `client.emit` → broadcast room :

```typescript
// AVANT — unicast : seul le lecteur reçoit la mise à jour
client.emit('chat:event', {
  type: 'TOTAL_UNREAD_UPDATE',
  payload: { totalUnread },
});

// APRÈS — broadcast : tous les commerciaux du poste reçoivent le badge à jour
this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
  type: 'TOTAL_UNREAD_UPDATE',
  payload: { totalUnread },
});
```

---

### US-B4 — Backend : `TOTAL_UNREAD_UPDATE` après `CONVERSATION_ASSIGNED`

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Après chaque émission `CONVERSATION_ASSIGNED` (lignes 1260-1263 et 1295-1298),
émettre un `TOTAL_UNREAD_UPDATE` si la conversation a des messages non lus :

```typescript
// Après CONVERSATION_ASSIGNED, si la conversation a un unread_count > 0
if ((freshChat.unread_count ?? 0) > 0) {
  const totalUnread = await this.chatService.getTotalUnreadForPoste(newPosteId);
  this.server.to(`poste:${newPosteId}`).emit('chat:event', {
    type: 'TOTAL_UNREAD_UPDATE',
    payload: { totalUnread },
  });
}
```

> S'applique aux deux endroits où `CONVERSATION_ASSIGNED` est émis (dispatch classique
> ligne ~1260 et batch emit ligne ~1295).
>
> ⚠️ **À vérifier lors de l'implémentation** : dans le second endroit (batch emit ~1295),
> la variable locale pourrait ne pas s'appeler `freshChat` ou ne pas avoir `unread_count`
> chargé. Adapter le nom et/ou ajouter un `await this.chatService.findOne(chatId)` si
> nécessaire pour obtenir la valeur fraîche.

---

### US-F1 — Backend : `TOTAL_UNREAD_UPDATE` après `conversation:read`

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Dans le handler `conversation:read` (ligne 731-755), après `markConversationAsRead()`,
émettre le `TOTAL_UNREAD_UPDATE` au client :

```typescript
// Après markConversationAsRead(...)
const totalUnread = await this.chatService.getTotalUnreadForPoste(agent.posteId);
client.emit('chat:event', {
  type: 'TOTAL_UNREAD_UPDATE',
  payload: { totalUnread },
});
```

> `client.emit` (unicast) est correct ici : seul le commercial qui a lu la conversation
> met à jour son propre badge. Les collègues reçoivent déjà le badge via US-B3.

---

### US-F2 — Frontend : garder le filtre client "non lus" comme filet de sécurité

**Fichier :** `front/src/app/whatsapp/page.tsx`

Après US-B1, la colonne DB et le comptage live sont cohérents. Le filtre client
`conv.unreadCount > 0` devient un filet de sécurité cohérent (non plus une source
de discordance). **Ne pas le supprimer** — il protège contre les edge cases résiduels.

```typescript
// INCHANGÉ — conserver tel quel
case 'unread': return conv.unreadCount > 0;
```

---

### US-F3 — Frontend : préserver `last_activity_at` dans merge UPSERT

**Fichier :** `front/src/store/chatStore.ts`

Dans `updateConversation`, lors du `map`, préserver `last_activity_at` existante si
l'UPSERT l'envoie à `null` :

```typescript
// Dans updateConversation → map → return { ...conversationWithUnread, ... }
// Ajouter :
last_activity_at:
  conversationWithUnread.last_activity_at   // valeur de l'UPSERT si présente
  ?? c.last_activity_at                      // sinon : valeur locale existante
  ?? conversationWithUnread.updatedAt,       // dernier fallback
```

> ⚠️ **À vérifier lors de l'implémentation** : `conversationWithUnread.updatedAt` doit
> être un objet `Date`. Si `normalizeConversation` le convertit déjà en `Date` : OK.
> Sinon, utiliser `new Date(conversationWithUnread.updatedAt)` comme dernier fallback.

---

### US-F4 — Frontend : `appendConversations` : garder la version la plus fraîche

**Fichier :** `front/src/store/chatStore.ts`

Remplacer la déduplication simple par un merge qui retient la version la plus fraîche :

```typescript
// AVANT
const newOnes = normalized.filter((c) => !existingIds.has(c.chat_id));
const merged = [...state.conversations, ...newOnes];

// APRÈS — si conversation déjà présente, garder la version la plus récente
const existingMap = new Map(state.conversations.map((c) => [c.chat_id, c]));
for (const c of normalized) {
  const existing = existingMap.get(c.chat_id);
  if (!existing) {
    existingMap.set(c.chat_id, c);
  } else {
    // Garder la plus fraîche selon last_activity_at
    const existingTime = existing.last_activity_at?.getTime() ?? existing.updatedAt.getTime();
    const newTime = c.last_activity_at?.getTime() ?? c.updatedAt.getTime();
    if (newTime > existingTime) {
      existingMap.set(c.chat_id, c);
    }
  }
}
const merged = Array.from(existingMap.values());
```

> ⚠️ **À vérifier lors de l'implémentation (1)** : `existing.updatedAt.getTime()` suppose un
> objet `Date`. Vérifier que `normalizeConversation` convertit `updatedAt` en `Date`.
> Si ce n'est pas le cas, remplacer par `new Date(existing.updatedAt).getTime()` et
> `new Date(c.updatedAt).getTime()`.
>
> ⚠️ **À vérifier lors de l'implémentation (2) — ordre du tableau** : `Array.from(existingMap.values())`
> suit l'ordre d'insertion dans le `Map` (existants d'abord, nouveaux à la fin). Si le
> composant trie les conversations à l'affichage (via un `useMemo` ou sélecteur Zustand),
> c'est transparent et aucun tri n'est nécessaire ici. Si `appendConversations` est censé
> retourner un tableau déjà trié par `last_activity_at DESC`, ajouter un `.sort()` final :
>
> ```typescript
> const merged = Array.from(existingMap.values()).sort((a, b) => {
>   const aTime = a.last_activity_at?.getTime() ?? a.updatedAt.getTime();
>   const bTime = b.last_activity_at?.getTime() ?? b.updatedAt.getTime();
>   return bTime - aTime; // DESC
> });
> ```

---

### US-F5 — Frontend : `autoLoadCountRef` réinitialisé sur recherche ET filtre

**Fichier :** `front/src/components/sidebar/ConversationList.tsx` **(seulement)**

`currentSearch` est déjà dans le store Zustand. `ConversationList` le lit directement
depuis le store — **pas de prop à ajouter, pas de `Sidebar.tsx` à modifier**.

```typescript
// 1. Lire currentSearch depuis le store (en haut du composant, avec les autres selectors)
const currentSearch = useChatStore((s) => s.currentSearch);

// 2. Ajouter currentSearch aux dépendances du useEffect de reset
// AVANT — uniquement sur changement de filtre
useEffect(() => {
  autoLoadCountRef.current = 0;
}, [filterStatus]);

// APRÈS — aussi sur changement de recherche
useEffect(() => {
  autoLoadCountRef.current = 0;
}, [filterStatus, currentSearch]);
```

**Aucune modification de `Sidebar.tsx` ou des props de `ConversationList` n'est nécessaire.**

---

### US-F6 — Frontend : filtre "Nouveau" — message vide après auto-load max

**Fichier :** `front/src/components/sidebar/ConversationList.tsx`

```tsx
{filterStatus === 'nouveau' && filteredCount === 0 && autoLoadCountRef.current >= 3 && !hasMoreConversations && (
  <p className="text-xs text-gray-400 text-center py-4 px-3">
    Aucune nouvelle conversation parmi les conversations chargées.
  </p>
)}
```

> ⚠️ **À vérifier lors de l'implémentation (1)** : confirmer que `filteredCount` et
> `hasMoreConversations` existent bien sous ces noms dans le scope de `ConversationList.tsx`.
> Adapter si le composant utilise des noms différents (ex. `filtered.length`, `hasMore`, etc.).
>
> ⚠️ **À vérifier lors de l'implémentation (2) — re-render et useRef** : `autoLoadCountRef`
> est un `useRef` — sa valeur ne déclenche **pas** de re-render. La condition
> `autoLoadCountRef.current >= 3` dans le JSX ne s'évaluera que lors d'un re-render
> provoqué par autre chose (typiquement `hasMoreConversations` passant à `false`).
> En pratique c'est généralement correct. Si le message n'apparaît pas, convertir le
> compteur en état React :
>
> ```typescript
> // Remplacement : useRef → useState (uniquement si le message n'apparaît pas)
> const [autoLoadCount, setAutoLoadCount] = useState(0);
> // Remplacer autoLoadCountRef.current++ par setAutoLoadCount(n => n + 1)
> // et autoLoadCountRef.current = 0 par setAutoLoadCount(0)
> ```

---

## 3. Récapitulatif des fichiers à modifier

| Fichier / Artefact | US | Modification |
|---|---|---|
| Script SQL one-time (déploiement) | B0 | `UPDATE` reset `unread_count` conversations fermées + recalcul conversations actives |
| `src/whatsapp_chat/whatsapp_chat.service.ts` | B1, B2 | `recomputeUnreadCount` → `status IN ('sent','delivered')` ; `getTotalUnreadForPoste` + stats → exclure `status='fermé'` |
| `src/whatsapp_message/whatsapp_message.gateway.ts` | B3, B4, F1 | `messages:read` → broadcast `TOTAL_UNREAD_UPDATE` ; `CONVERSATION_ASSIGNED` → `TOTAL_UNREAD_UPDATE` si unread > 0 ; `conversation:read` → émet `TOTAL_UNREAD_UPDATE` |
| `front/src/app/whatsapp/page.tsx` | F2 | Filtre `unreadCount > 0` conservé (aucun changement) |
| `front/src/store/chatStore.ts` | F3, F4 | `updateConversation` → fallback `last_activity_at` ; `appendConversations` → merge par fraîcheur |
| `front/src/components/sidebar/ConversationList.tsx` | F5, F6 | `currentSearch` lu depuis le store + reset `autoLoadCountRef` ; message vide filtre "nouveau" |

**Total : 1 script SQL + 0 créé + 5 modifiés — Aucune migration TypeORM**

---

## 4. Séquence d'implémentation

```
Étape 0 — Script SQL one-time : batch fix données existantes (B0)     ~5 min
  ├── UPDATE reset unread_count = 0 pour conversations fermées
  └── UPDATE recalcul unread_count pour conversations actives
  (à exécuter AVANT redémarrage du backend)

Étape 1 — Backend : recomputeUnreadCount (B1)                         ~10 min
  └── Aligner sur status IN ('sent','delivered')

Étape 2 — Backend : exclure conversations fermées des badges (B2)     ~10 min
  ├── getTotalUnreadForPoste : +AND c.status != 'fermé'
  └── findAll stats : +AND chat.status != 'fermé' dans le CASE WHEN

Étape 3 — Backend : TOTAL_UNREAD_UPDATE broadcast messages:read (B3)  ~5 min
  └── client.emit → server.to(poste:id).emit

Étape 4 — Backend : TOTAL_UNREAD_UPDATE après CONVERSATION_ASSIGNED (B4) ~10 min
  ├── Émettre si unread_count > 0 dans les 2 endroits
  └── Vérifier nom de variable dans le batch emit (~1295)

Étape 5 — Backend : TOTAL_UNREAD_UPDATE après conversation:read (F1)  ~10 min
  └── Ajouter emit après markConversationAsRead

Étape 6 — Frontend : fallback last_activity_at dans UPSERT (F3)       ~15 min
  ├── chatStore.ts : updateConversation → 3-niveaux fallback
  └── Vérifier que updatedAt est un objet Date dans normalizeConversation

Étape 7 — Frontend : appendConversations merge par fraîcheur (F4)     ~15 min
  ├── chatStore.ts : déduplication intelligente
  └── Vérifier que updatedAt.getTime() est safe (type Date)

Étape 8 — Frontend : autoLoadCountRef + search (F5)                   ~10 min
  └── ConversationList.tsx : lire currentSearch depuis le store + reset useEffect
  (pas de modification Sidebar.tsx ni de props)

Étape 9 — Frontend : message vide filtre nouveau (F6)                 ~10 min
  ├── ConversationList.tsx : affichage conditionnel
  └── Vérifier noms filteredCount et hasMoreConversations dans le scope

Total estimé : ~1h45
```

---

## 5. Tests manuels

| Scénario | Résultat attendu |
|---|---|
| **[B0 — avant restart]** `SELECT SUM(unread_count) FROM whatsapp_chat WHERE status = 'fermé'` | Retourne `0` (script exécuté correctement) |
| **[B0 — avant restart]** `SELECT chat_id, unread_count FROM whatsapp_chat WHERE status != 'fermé' LIMIT 10` | Valeurs cohérentes avec `COUNT(*)` live sur `whatsapp_message` |
| Admin badge "3 non lus" pour poste X | Commercial du poste X voit aussi "3 non lus" |
| Commercial filtre "Non lus" | Liste = exactement les conversations avec badge > 0 |
| Commercial ouvre conversation avec 5 non lus | Badge global diminue immédiatement |
| Commercial A lit une conversation, commercial B même poste | Badge B se met à jour sans reload |
| Nouvelle conversation assignée avec 2 non lus | Badge global +2 immédiatement |
| Conversation fermée avec 1 message non lu | Non comptée dans le badge |
| Commercial tape une recherche (même filtre) | Auto-load se relance correctement |
| Scroll page 2 pendant qu'une conversation de page 1 remonte | Version fraîche conservée, bonne position dans la liste |
| Filtre "Nouveau" sur poste sans nouvelles conversations | Message explicatif après 3 tentatives |
| Message audio reçu (status='played') | `unread_count` DB = 0 (plus compté comme non lu) |

---

## 6. Notes importantes

- **US-B0 (script SQL)** — one-time uniquement, pas de migration TypeORM. Corriger les
  données avant de redémarrer le backend pour éviter toute incohérence résiduelle.
- **Pas de migration TypeORM** — aucun schéma modifié, tous les changements sont dans
  la logique applicative.
- **US-B2** : `CONVERSATION_UPSERT` continue d'utiliser la colonne DB — après US-B1
  et B0, elle est fiable. Pas de requête live supplémentaire sur chaque UPSERT.
- **US-F2** : le filtre client `conv.unreadCount > 0` est **conservé** (pas supprimé) —
  il devient cohérent après US-B1 et sert de filet de sécurité.
- **US-F5** : `currentSearch` lu directement depuis le store Zustand dans `ConversationList`.
  `Sidebar.tsx` **n'est pas modifié** — pas de prop drilling.
- **Régression possible B1** : messages en statut `'played'` (audio joué) et `'deleted'`
  ne seront plus comptés comme non lus — comportement **voulu et correct**.
- **Postes mono-commercial** : US-B3 (broadcast) est neutre — un seul abonné sur la room.
- **Points à vérifier en implémentation** : nom de variable `freshChat` (B4), type `Date`
  de `updatedAt` (F3/F4), noms `filteredCount`/`hasMoreConversations` (F6).

---

*Plan rédigé le 2026-05-25 — mis à jour v4 (F4 note tri post-merge + sort() de secours, F6 note useRef/re-render + fallback useState, tests B0 ajoutés en section 5).*
