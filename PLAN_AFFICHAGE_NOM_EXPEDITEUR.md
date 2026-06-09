# Plan d'implémentation — Affichage du nom de l'expéditeur sous chaque message

**Date :** 2026-06-09  
**Scope :** Backend NestJS + Frontend commercial (`front/`) + Dashboard admin (`admin/`)  
**Objectif :** Afficher le nom du commercial (messages sortants) et le nom du client (messages entrants) sous chaque bulle de message, dans les deux interfaces.

---

## Analyse : comment un commercial est associé à un message

La liaison commercial ↔ message repose sur **deux champs** dans `whatsapp_message` :

| Champ DB | Propriété TypeORM | Rôle |
|----------|------------------|------|
| `commercial_id` | `commercial_id` + relation `commercial` | Qui a envoyé (FK vers `WhatsappCommercial`) |
| `sender_name` | `from_name` | Nom affiché en clair au moment de l'envoi |

---

## Cartographie complète des créations de messages sortants

### ✅ Cas correct

| # | Chemin d'appel | `commercial_id` | `from_name` |
|---|---------------|-----------------|-------------|
| 1 | WebSocket `message:send` → `createAgentMessage()` | `agent.commercialId` ✅ | `commercial?.name ?? 'Agent'` ✅ |

---

### ❌ Angles morts — `from_name` erroné

#### Angle mort 1 — `createAgentMediaMessage()` route commerciale
**Fichier :** `whatsapp_message.controller.ts` ligne ~363  
**Guard :** `AuthGuard('jwt')` (commercial connecté)  
**Problème :** `commercial_id` est passé (`user?.userId`) ✅, mais `from_name` reçoit `chat.name` — c'est le **nom du client**, pas du commercial.

```typescript
// Avant (bugué)
from_name: chat.name,         // ← nom du CLIENT
commercial: commercial,       // ← commercial correctement lié

// Après
from_name: commercial?.name ?? 'Agent',
```

---

#### Angle mort 2 — `createAgentLocationMessage()`
**Fichier :** `whatsapp_message.service.ts` ligne ~531  
**Guard :** `AuthGuard('jwt')` (commercial connecté)  
**Problème :** `commercial_id` est passé ✅, mais `from_name: chat.name` → nom du client.

```typescript
// Avant (bugué)
from_name: chat.name,

// Après
from_name: commercial?.name ?? 'Agent',
```

---

#### Angle mort 3 — `persistFailedAgentMessage()`
**Fichier :** `whatsapp_message.service.ts` ligne ~772  
**Contexte :** Appelé quand Whapi échoue — sauvegarde le message en statut FAILED. Reçoit l'objet `commercial` en paramètre ✅, mais `from_name: chat.name` → nom du client.

```typescript
// Avant (bugué)
from_name: chat.name,
commercial,                   // ← commercial correctement passé mais ignoré pour from_name

// Après
from_name: commercial?.name ?? 'Agent',
```

---

#### Angle mort 4 — `createAgentMediaMessage()` route admin
**Fichier :** `whatsapp_message.controller.ts` ligne ~292  
**Guard :** `AdminGuard`  
**Problème :** `commercial_id: null` (intentionnel — admin n'est pas un commercial), `from_name: chat.name` → nom du client au lieu de quelque chose d'identifiable.

```typescript
// Avant (bugué)
commercial_id: null,
from_name: chat.name,   // ← nom du client

// Après
commercial_id: null,
from_name: 'Admin',     // ← identifiable
```

---

### ⚠️ Cas limites — `commercial_id` intentionnellement null

Ces cas sont corrects par conception (pas de commercial humain), mais `from_name = 'Agent'` est trompeur.

| # | Chemin | `commercial_id` | `from_name` actuel | Valeur recommandée |
|---|--------|-----------------|-------------------|-------------------|
| 5 | `POST /messages` [AdminGuard] → `createAgentMessage()` | `undefined` → null | `'Agent'` | `'Admin'` |
| 6 | `sendAutoMessageWithTyping()` gateway | `undefined` → null | `'Agent'` | `'Auto'` |
| 7 | `message-auto.service.ts` (×4 appels) | `undefined` → null | `'Agent'` | `'Auto'` |

> Ces cas sont secondaires par rapport aux angles morts 1–4, mais recommandés pour la clarté dans l'historique.

---

## Récapitulatif des corrections backend

| Fichier | Ligne | Correction |
|---------|-------|-----------|
| `whatsapp_message.service.ts` | ~374 | `createAgentMediaMessage` : `from_name: commercial?.name ?? 'Agent'` |
| `whatsapp_message.service.ts` | ~531 | `createAgentLocationMessage` : `from_name: commercial?.name ?? 'Agent'` |
| `whatsapp_message.service.ts` | ~772 | `persistFailedAgentMessage` : `from_name: commercial?.name ?? 'Agent'` |
| `whatsapp_message.controller.ts` | ~292 | Route admin média : `from_name: 'Admin'` |
| `whatsapp_message.controller.ts` | ~117 | Route admin texte : passer `from_name: 'Admin'` (ou ajouter param à `createAgentMessage`) |
| `whatsapp_message.gateway.ts` | ~1305 | `sendAutoMessageWithTyping` : pas de `commercial_id` ni `from_name` → accepter un `from_name` optionnel |
| `message-auto.service.ts` | ×4 | Passer `channel_id` toujours, `from_name` sera `'Agent'` → acceptable |

---

## US d'implémentation

### US-1 — Backend : corriger `from_name` dans les 3 méthodes buguées (angles morts 1–3)

**Fichiers :** `whatsapp_message.service.ts`  
**Changements :**
- `createAgentMediaMessage()` ligne ~374 : `from_name: commercial?.name ?? 'Agent'`
- `createAgentLocationMessage()` ligne ~531 : `from_name: commercial?.name ?? 'Agent'`
- `persistFailedAgentMessage()` ligne ~772 : `from_name: commercial?.name ?? 'Agent'`

---

### US-2 — Backend : corriger `from_name` route admin média (angle mort 4)

**Fichier :** `whatsapp_message.controller.ts` ligne ~292  
**Changement :** `from_name: 'Admin'` dans l'appel à `createAgentMediaMessage()` depuis la route admin.  
> Note : `createAgentMediaMessage()` ne prend pas encore `from_name` en paramètre — il faudra l'ajouter en paramètre optionnel ou le déduire de `commercial_id` nul + source admin.

---

### US-3 — Frontend : afficher `from_name` sous les messages entrants

**Fichier :** `front/src/components/chat/ChatMessage.tsx` lignes 321–326

```tsx
{/* Déjà présent — messages sortants */}
{isFromMe && msg.from_name && (
  <p className="text-[10px] text-green-200 text-right italic mt-0.5 leading-tight">
    {msg.from_name}
  </p>
)}

{/* À ajouter — messages entrants */}
{!isFromMe && msg.from_name && (
  <p className="text-[10px] text-gray-400 text-left italic mt-0.5 leading-tight">
    {msg.from_name}
  </p>
)}
```

---

### US-4 — Admin : afficher `from_name` sous les messages entrants

**Fichier :** `admin/src/app/ui/ConversationsView.tsx` lignes 1078–1080

```tsx
{/* Déjà présent — messages sortants */}
{msg.direction === 'OUT' && msg.from_name && (
  <p className="text-[10px] text-blue-200 text-right italic mt-0.5 leading-tight">
    {msg.from_name}
  </p>
)}

{/* À ajouter — messages entrants */}
{msg.direction === 'IN' && msg.from_name && (
  <p className="text-[10px] text-gray-400 text-left italic mt-0.5 leading-tight">
    {msg.from_name}
  </p>
)}
```

---

## Ordre d'implémentation recommandé

```
US-1  Backend : corriger from_name médias + localisation + failed
  ↓
US-2  Backend : corriger from_name route admin média
  ↓
US-3  Frontend : afficher from_name messages entrants
  ↓
US-4  Admin : afficher from_name messages entrants
```

---

## Fichiers à modifier (récapitulatif final)

| # | Fichier | Modification |
|---|---------|-------------|
| 1 | `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` | `from_name: commercial?.name ?? 'Agent'` dans `createAgentMediaMessage`, `createAgentLocationMessage`, `persistFailedAgentMessage` |
| 2 | `message_whatsapp/src/whatsapp_message/whatsapp_message.controller.ts` | `from_name: 'Admin'` dans route admin média |
| 3 | `front/src/components/chat/ChatMessage.tsx` | Ajouter affichage `from_name` messages entrants |
| 4 | `admin/src/app/ui/ConversationsView.tsx` | Ajouter affichage `from_name` messages entrants |

---

## Points d'attention

- **Aucune migration SQL** — la colonne `sender_name` existe déjà.
- **Aucun changement de type TypeScript** — `from_name` est déjà dans les interfaces.
- **Rétrocompatibilité** : les anciens messages ont `from_name = 'Agent'` ou le nom du client à tort — les affichages sont tous conditionnels, rien ne plante.
- **`MessagesView.tsx`** (onglet Messages admin) : affiche déjà le sender dans une colonne dédiée — aucune modification nécessaire.

---

## Correction des données historiques

✅ **Effectuée directement en SQL le 2026-06-09** — aucune migration nécessaire.

```sql
UPDATE whatsapp_message m
INNER JOIN whatsapp_commercial c ON c.id = m.commercial_id
SET m.sender_name = c.name
WHERE m.from_me = 1
  AND m.commercial_id IS NOT NULL
  AND m.deletedAt IS NULL
  AND m.sender_name != c.name;
```

---

## Statut

- [x] US-1 — Backend : corriger `from_name` (médias + localisation + failed)
- [x] US-2 — Backend : corriger `from_name` route admin média (résolu par US-1 : `commercial?.name ?? 'Agent'` retourne `'Agent'` quand `commercial_id = null`)
- [x] US-3 — Frontend : afficher `from_name` messages entrants (`ChatMessage.tsx`)
- [x] US-4 — Admin : afficher `from_name` messages entrants (`ConversationsView.tsx`)
