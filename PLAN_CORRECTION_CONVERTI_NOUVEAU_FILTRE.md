# Plan — Correction badges non-lus : exclusion 'converti' + filtre 'nouveau' server-side

> **Branche :** `production`
> **Date :** 2026-05-25 (v2 — contexte de comparaison clarifié)
> **Statut :** 📋 À implémenter
> **Contexte :** Suite à `PLAN_CORRECTION_UNREAD_FILTRE_FRONT.md` (v4) — discordances résiduelles post-déploiement

---

## 1. Contexte de la comparaison

L'admin dispose d'un sélecteur de poste dans la vue Conversations.
**Lorsqu'un poste est sélectionné**, les badges de comptage apparaissent :

```
[ 30 total ] [ 15 actifs ] [ 5 en attente ] [ 3 fermés ] [ 5 non lus ]
```

Ces badges proviennent de `findAll()` avec `posteId` → `statsQb`.

**La comparaison faite par l'utilisateur :**
- Admin → sélectionne Poste X → voit badge **"N non lus"**
- Commercial du même Poste X → voit badge **"M non lus"** sur son front

**Scope identique (même poste) → N et M devraient être égaux.**

---

## 2. Diagnostic

### 2.1 Bug principal — `'converti'` compté dans les badges mais absent de la liste commerciale

#### Mécanisme

`findByPosteId()` — source de la **liste commerciale** — exclut par défaut deux statuts :

```typescript
// whatsapp_chat.service.ts ligne 59
excludeStatuses: string[] = ['fermé', 'converti']
```

`getTotalUnreadForPoste()` — source du **badge commercial** via `TOTAL_UNREAD_UPDATE` —
n'exclut que `'fermé'` (fix US-B2) :

```typescript
// whatsapp_chat.service.ts ligne 123
.andWhere("c.status != 'fermé'")   // ← 'converti' NON exclu
```

`findAll()` statsQb — source du **badge admin** — même lacune :

```typescript
// whatsapp_chat.service.ts ligne 423
`SUM(CASE WHEN chat.status != 'fermé' AND EXISTS (...) THEN 1 ELSE 0 END)`
// ← 'converti' NON exclu
```

#### Conséquences observables

**Scénario avec 5 conversations non lues pour Poste X :**
- 3 conversations `'actif'` avec messages non lus
- 2 conversations `'converti'` avec messages non lus (`unread_count > 0` en DB)

| Élément | Valeur | Explication |
|---|---|---|
| Badge admin "N non lus" | **5** | `findAll()` compte 'converti' |
| Badge commercial "M non lus" | **5** | `getTotalUnreadForPoste` compte 'converti' |
| Conversations avec badge rouge dans liste **admin** | **5** | Admin affiche 'converti' dans sa liste |
| Conversations avec badge rouge dans liste **commerciale** | **3** | `findByPosteId` exclut 'converti' |

**Résultat :** Les chiffres des badges sont identiques (5 = 5), MAIS le commercial ne trouve
que **3 conversations** avec des badges rouges dans sa liste, alors que l'admin en voit **5**.
Le commercial cherche les 5 non lus annoncés → il n'en trouve que 3 → confusion.

**Après fix (C1 + C2 + C3) :**

| Élément | Valeur | Explication |
|---|---|---|
| Badge admin "N non lus" | **3** | Exclut 'converti' |
| Badge commercial "M non lus" | **3** | Exclut 'converti' |
| Conversations avec badge rouge dans liste admin | **3** | `unread_count = 0` pour 'converti' (migration C3) → pas de badge rouge |
| Conversations avec badge rouge dans liste commerciale | **3** | Idem |

**Les trois chiffres sont cohérents : badge admin = badge commercial = conversations visibles.**

---

### 2.2 Bug secondaire — Filtre `'nouveau'` purement client-side

```typescript
// front/src/app/whatsapp/page.tsx ligne 109
case 'nouveau': return !conv.last_poste_message_at;
```

Ce filtrage est **local** (appliqué après chargement du store). Les conversations `'nouveau'`
situées dans les pages non encore chargées sont invisibles. L'auto-load compense
jusqu'à 3 pages × 300 = 900 conversations. Pour les postes avec 900+ conversations dont
les `'nouveau'` sont réparties loin dans la liste, certaines restent manquantes.

**Fix cible :** passer `'nouveau'` en filtre server-side comme `'unread'`
(`unreadOnly=true` → `effectiveLimit = 5_000`, toutes les conversations retournées).

---

### 2.3 Non-bug structurel (documenté pour référence)

Admin **sans poste sélectionné** = tous les postes combinés. Toujours différent d'un
commercial individuel. Comportement attendu, aucune correction prévue.

---

## 3. Corrections

### US-C1 — Backend : `getTotalUnreadForPoste` exclut `'converti'` ✦ CRITIQUE

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` (ligne 123)

```typescript
// AVANT
.andWhere("c.status != 'fermé'")

// APRÈS — aligné sur findByPosteId (excludeStatuses = ['fermé', 'converti'])
.andWhere("c.status NOT IN ('fermé', 'converti')")
```

**Impact :** Le badge `totalUnread` du commercial (via `TOTAL_UNREAD_UPDATE`) ne compte plus
les conversations `'converti'`. Badge = nombre exact de conversations non lues visibles dans la liste.

---

### US-C2 — Backend : `findAll()` statsQb exclut `'converti'` ✦ CRITIQUE

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` (ligne 423)

```typescript
// AVANT
`SUM(CASE WHEN chat.status != 'fermé' AND EXISTS (
   SELECT 1 FROM whatsapp_message m
   WHERE m.chat_id = chat.chat_id
     AND m.from_me = 0
     AND m.status IN ('sent','delivered')
     AND m.deletedAt IS NULL
 ) THEN 1 ELSE 0 END)`

// APRÈS
`SUM(CASE WHEN chat.status NOT IN ('fermé', 'converti') AND EXISTS (
   SELECT 1 FROM whatsapp_message m
   WHERE m.chat_id = chat.chat_id
     AND m.from_me = 0
     AND m.status IN ('sent','delivered')
     AND m.deletedAt IS NULL
 ) THEN 1 ELSE 0 END)`
```

**Impact :** Le badge admin "N non lus" pour un poste sélectionné = badge commercial du même poste.

---

### US-C3 — Migration : reset `unread_count` pour conversations `'converti'`

**Fichier à créer :** `message_whatsapp/src/database/migrations/FixConvertiUnreadCount1748995200003.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixConvertiUnreadCount1748995200003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remettre à 0 les conversations 'converti' — exclues de la liste commerciale,
    // elles ne doivent pas afficher de badge rouge dans la liste admin non plus.
    await queryRunner.query(`
      UPDATE whatsapp_chat
      SET unread_count = 0
      WHERE status = 'converti'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irréversible — les valeurs originales ne sont pas conservées
  }
}
```

**Impact :** Les conversations `'converti'` n'affichent plus de badge rouge dans la liste admin.
L'admin voit le même nombre de conversations avec badge rouge que le commercial.

> ⚠️ **Edge case post-déploiement** : si un nouveau message arrive pour une conversation
> `'converti'` après le déploiement, `incrementUnreadCount` sera appelé et `unread_count`
> repassera à 1. Ce message sera visible dans la liste admin mais pas chez le commercial.
> Solution long terme : ne pas appeler `incrementUnreadCount` pour les conversations `'converti'`.
> **Hors scope de ce plan — à traiter séparément si le cas se présente.**

---

### US-C4 — Backend + Frontend : filtre `'nouveau'` server-side (P2)

**Contexte :** `'nouveau'` est filtré côté client uniquement. Passer ce filtre côté serveur
garantit que toutes les conversations `'nouveau'` sont retournées d'un coup
(comme `unreadOnly` → `effectiveLimit = 5_000`).

**Fichier 1 :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

Dans `findByPosteId`, ajouter le paramètre `nouveauOnly` :

```typescript
async findByPosteId(
  poste_id: string,
  excludeStatuses: string[] = ['fermé', 'converti'],
  limit = 300,
  cursor?: { activityAt: string; chatId: string },
  unreadOnly = false,
  nouveauOnly = false,          // ← AJOUT
): Promise<{ chats: WhatsappChat[]; hasMore: boolean }> {
  const effectiveLimit = (unreadOnly || nouveauOnly) ? 5_000 : limit;
  // ...
  if (nouveauOnly) {
    qb.andWhere('chat.last_poste_message_at IS NULL');
  }
  // Le cursor ne s'applique pas en mode nouveau (comme unreadOnly) :
  if (cursor && !unreadOnly && !nouveauOnly) { /* ... */ }
```

**Fichier 2 :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Dans le handler `conversations:get`, extraire `nouveauOnly` du payload et le passer
à `findByPosteId`.

```typescript
const { search, unreadOnly, nouveauOnly, cursor } = payload ?? {};
const result = await this.chatService.findByPosteId(
  agent.posteId,
  undefined,
  300,
  cursor,
  !!unreadOnly,
  !!nouveauOnly,    // ← AJOUT
);
```

**Fichier 3 :** `front/src/store/chatStore.ts`

```typescript
loadConversations: (search?: string, unreadOnly?: boolean, nouveauOnly?: boolean) => {
  // ...
  if (nouveauOnly) payload.nouveauOnly = true;
  socket.emit("conversations:get", payload);
},
```

**Fichier 4 :** `front/src/app/whatsapp/page.tsx`

```typescript
// useEffect sur filterStatus :
loadConversations(
  searchQuery || undefined,
  filterStatus === 'unread',
  filterStatus === 'nouveau',   // ← AJOUT
);

// useEffect sur searchQuery :
loadConversations(
  searchQuery || undefined,
  filterStatus === 'unread',
  filterStatus === 'nouveau',   // ← AJOUT
);
```

> ⚠️ **À vérifier lors de l'implémentation** : le nom exact du paramètre `cursor` dans
> la gateway (peut être destructuré différemment selon la version actuelle du handler).

---

## 4. Récapitulatif

| Artefact | US | Priorité | Modification |
|---|---|---|---|
| `whatsapp_chat.service.ts` ligne 123 | C1 | P0 ✦ | `getTotalUnreadForPoste` → `NOT IN ('fermé', 'converti')` |
| `whatsapp_chat.service.ts` ligne 423 | C2 | P0 ✦ | `findAll()` statsQb → `NOT IN ('fermé', 'converti')` dans CASE WHEN |
| `FixConvertiUnreadCount1748995200003.ts` (créer) | C3 | P0 ✦ | migration : reset `unread_count = 0` pour `status = 'converti'` |
| `whatsapp_chat.service.ts` + gateway + `chatStore.ts` + `page.tsx` | C4 | P2 | `nouveauOnly` server-side |

**Total P0 : 1 migration + 1 fichier modifié (2 lignes) — aucun schéma modifié**
**Total avec C4 : +3 fichiers supplémentaires**

---

## 5. Séquence d'implémentation

```
Étape 1 — US-C1 : getTotalUnreadForPoste (badge commercial)           ~5 min
  └── ligne 123 : NOT IN ('fermé', 'converti')

Étape 2 — US-C2 : findAll() statsQb (badge admin)                     ~5 min
  └── ligne 423 : NOT IN ('fermé', 'converti') dans CASE WHEN

Étape 3 — US-C3 : migration FixConvertiUnreadCount1748995200003       ~5 min
  └── UPDATE unread_count = 0 WHERE status = 'converti'
  └── S'exécute automatiquement au prochain pipeline (migration:run)

[Optionnel P2]
Étape 4 — US-C4 : nouveauOnly server-side                             ~30 min
  ├── service : nouveauOnly + last_poste_message_at IS NULL
  ├── gateway : extraire et passer nouveauOnly
  ├── chatStore.ts : passer nouveauOnly dans payload
  └── page.tsx : filterStatus === 'nouveau' → nouveauOnly=true

Total P0 : ~15 min
Total avec C4 : ~45 min
```

---

## 6. Tests manuels

| Scénario | Résultat attendu après C1+C2+C3 |
|---|---|
| Admin → sélectionne Poste X → badge "N non lus" | = badge "N non lus" sur le front commercial du Poste X |
| Commercial avec 2 conversations 'converti' non lues + 3 normales non lues | Badge affiche **3** (pas 5) |
| Conversations avec badge rouge dans liste admin (Poste X sélectionné) | = conversations avec badge rouge dans liste commerciale |
| `SELECT COUNT(*) FROM whatsapp_chat WHERE status = 'converti' AND unread_count > 0` | 0 après migration C3 |
| Admin liste → conversations 'converti' | Toujours visibles pour l'admin, mais sans badge rouge |
| Filtre "Non lus" commercial | Liste = exactement les conversations avec badge > 0 |

---

## 7. Notes importantes

- **C1 + C2 :** alignent les DEUX sources de comptage sur la même règle que `findByPosteId`.
  Résultat : badge admin (poste sélectionné) = badge commercial = liste visible.
- **C3 :** efface les valeurs gonflées existantes. L'admin ne montrera plus de badges rouges
  sur les conversations `'converti'` au déploiement.
- **Edge case 'converti' + nouveau message :** non couvert par ce plan. Si critique, ajouter
  une garde dans `incrementUnreadCount` : ne pas incrémenter si `chat.status = 'converti'`.
- **C4 est P2 :** l'auto-load (3 pages × 300 = 900 conv.) couvre la majorité des postes.
  N'implémenter C4 que si un poste dépasse régulièrement 900 conversations actives.
- **Aucune migration de schéma** — seule une migration DML (données) est nécessaire.

---

*Plan rédigé le 2026-05-25 — v2 : contexte de comparaison clarifié (même scope, poste X admin = poste X commercial), impact 'converti' sur badge + liste détaillé.*
