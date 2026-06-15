# Plan de correction — Recherche de conversations (admin + front commercial)

Date : 2026-06-15

Problème signalé : la recherche de conversation est peu fiable — elle semble ne
porter que sur les conversations déjà chargées en mémoire, et même en appuyant
sur "Entrée" aucune requête n'est envoyée au backend.

---

## 1. Constat global

| App | Recherche backend ? | Portée | Touche Entrée |
|---|---|---|---|
| **Admin** (`ConversationsView.tsx`) | ❌ Aucune | Uniquement les conversations déjà chargées (50-200 max, période "today" par défaut) | Aucun effet (pas de handler) |
| **Front commercial — onglet Conversations** | ✅ Oui (websocket, debounce 300ms) | `chat.name` et `chat.chat_id` uniquement — pas le contenu des messages, pas le téléphone normalisé | Inutile, déjà déclenché automatiquement |
| **Front commercial — onglet Contacts** | ❌ Aucune (filtre local) | Sur les conversations déjà chargées dans le store (résultat de l'onglet "tous") | Aucun effet |

---

## 2. Angle mort #1 (majeur) — Admin : recherche 100% client-side

### Fichier : `admin/src/app/ui/ConversationsView.tsx`

```ts
// ligne 438-451
const filteredChats = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter((chat) => {
        const name = (chat.name ?? '').toLowerCase();
        ...
        return name.includes(term) || phone.includes(term) || lastMsg.includes(term);
    });
}, [chats, searchTerm]);
```

`chats` provient de `loadChats()` (ligne 129-155) qui appelle
`getChats(limit, offset, periodeEffective, ...)` :
- `limit` par défaut = 50 (ligne 51 : `useState(50)`)
- `periodeEffective` = `'today'` sauf si un poste/commercial est sélectionné

→ La recherche ne porte **que sur les ~50 conversations du jour déjà chargées**.
Aucune requête n'est envoyée au backend quand `searchTerm` change ou quand
l'admin appuie sur "Entrée" (aucun `onKeyDown`/`onSubmit`).

### Cause racine côté API

`GET /chats` n'accepte **aucun paramètre `search`** :

- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts:20-56` — pas de `@Query('search')`
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` — méthode `findAll()` (utilisée par ce controller) n'a pas de filtre `LIKE`

À comparer avec `findByPosteId()` (déjà utilisé par le front commercial via
websocket), qui sait déjà filtrer :

```ts
// whatsapp_chat.service.ts:104-110
if (search) {
  const likeSearch = `%${search}%`;
  qb.andWhere(
    '(chat.name LIKE :search OR chat.chat_id LIKE :search)',
    { search: likeSearch },
  );
}
```

---

## 3. Angle mort #2 (mineur) — Front commercial : portée de recherche limitée

### Fichier : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts:104-110`

La recherche backend (utilisée par `front/`, via `conversations:get` →
`chatStore.ts:263-289`) ne filtre que sur `chat.name LIKE` et `chat.chat_id LIKE`.

Limites :
- `chat.chat_id` = identifiant WHAPI (ex: `33612345678@s.whatsapp.net`). Une
  recherche `"06 12 34 56 78"` ou `"0612345678"` ne matchera pas car le format
  diffère (préfixe pays, espaces, suffixe `@s.whatsapp.net`).
- Aucune recherche sur le **contenu des messages** (contrairement à l'ancien
  filtre client-side de l'admin qui incluait `lastMsg.includes(term)`).

### Fichier : `front/src/components/contacts/ContactSidebarPanel.tsx:35-54`

L'onglet "Contacts" filtre `conversations` (déjà en mémoire, résultat de
l'onglet "tous") localement sur `c.name` / `c.contact` — pas de requête dédiée.
Comme `conversations` est déjà re-chargé avec le `search` backend (cf.
`page.tsx:95-107`), ce double filtrage est redondant mais pas bloquant : impact
mineur, à surveiller seulement si la portée de recherche backend change.

---

## 4. Plan d'action

### Étape 1 — Backend : ajouter `search` à `GET /chats` — `backend-dev`

**Fichier `whatsapp_chat.controller.ts`** (ligne 20-56)
- Ajouter `@Query('search') search?: string` et le transmettre à `chatService.findAll(...)`.

**Fichier `whatsapp_chat.service.ts`** — méthode `findAll()`
- Ajouter le paramètre `search?: string`.
- Si `search` fourni :
  - Normaliser le terme : extraire les chiffres (`search.replace(/\D/g, '')`) pour
    matcher `chat.chat_id` indépendamment du format téléphone.
  - `andWhere('(chat.name LIKE :search OR chat.chat_id LIKE :searchDigits)', { search: \`%${search}%\`, searchDigits: \`%${digits}%\` })`
  - Si `search` non vide, lever la limite par défaut (même logique que
    `findByPosteId` ligne 71 : `effectiveLimit = search ? 5_000 : limit`) et
    ignorer la pagination par période (cf. étape 2).
- Lié bindé en paramètres uniquement (`:search`, `:searchDigits`) — jamais de
  concaténation de chaîne dans la clause SQL.

### Étape 2 — Admin : déclencher une recherche backend — `frontend-dev`

**Fichier `admin/src/app/ui/ConversationsView.tsx`**

- Ajouter un `useEffect` debounce 300ms sur `searchTerm` (même pattern que
  `front/src/app/whatsapp/page.tsx:95-107`) :
  - Si `searchTerm` non vide → appeler `getChats(200, 0, 'all', selectedPosteId, selectedCommercialId, statusFilter, undefined, searchTerm)`
    (nouveau paramètre `search` à ajouter à `getChats()` dans `admin/src/app/lib/api.ts`)
    et remplacer `chats` par le résultat (recherche globale, toutes périodes).
  - Si `searchTerm` redevenu vide → revenir au `loadChats(limit, offset)` normal
    (période/pagination habituelles).
- Conserver `filteredChats` (ligne 438-451) comme filtre instantané d'affichage
  pendant que la requête backend est en vol (évite un flash "Aucune conversation").
- Pas de gestion spécifique "Entrée" nécessaire : le debounce suffit (cohérent
  avec le front commercial). Si l'utilisateur veut un déclenchement immédiat sur
  Entrée, ajouter `onKeyDown` → `clearTimeout` + recherche immédiate.

**Fichier `admin/src/app/lib/api.ts`** — `getChats()` (ligne 362-)
- Ajouter le paramètre `search?: string` et `params.set('search', search)` si fourni.

### Étape 3 — Front commercial : élargir la portée de recherche — `backend-dev`

- Couvert par l'étape 1 (normalisation téléphone côté `whatsapp_chat.service.ts`
  `findByPosteId()` également — factoriser la condition `search` dans une
  méthode utilitaire privée partagée entre `findAll()` et `findByPosteId()` pour
  éviter la duplication).
- Recherche sur le contenu des messages : **non recommandé en MVP** — nécessite
  un `EXISTS` sur `whatsapp_message` avec `LIKE` sur `content`, coûteux sans
  index full-text. À évaluer séparément si le besoin est confirmé (hors scope
  de ce plan).

### Étape 4 — `tester`
- Vérifier `GET /chats?search=...` retourne les conversations correspondant au
  nom ou au numéro, toutes périodes confondues, y compris fermées.
- Vérifier `npm run build` (admin) — 0 erreur TS.
- Test manuel admin : rechercher une conversation ancienne (hors période "today")
  par nom et par numéro de téléphone (avec/sans `0` initial, avec/sans indicatif).
- Test manuel front commercial : recherche par numéro de téléphone format local
  (`06...`) doit désormais matcher `chat_id` (`336...@s.whatsapp.net`).

### Étape 5 — `reviewer`
- Vérifier que toute clause `LIKE` utilise des paramètres liés (`:search`,
  `:searchDigits`) — pas de concaténation SQL.
- Vérifier la factorisation `findAll()`/`findByPosteId()` ne casse pas la
  pagination keyset existante.

---

## 5. Fichiers impactés

- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts` (ajout `@Query('search')`)
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` (`findAll()`, factorisation avec `findByPosteId()`)
- `admin/src/app/lib/api.ts` (`getChats()`)
- `admin/src/app/ui/ConversationsView.tsx` (debounce recherche backend, lignes 51, 129-155, 438-451)

Aucune migration BDD nécessaire.
