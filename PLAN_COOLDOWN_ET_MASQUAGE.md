# Plan — Correction Cooldown + Masquage numéros clients (postes dédiés)

**Date :** 2026-05-26  
**Statut :** À implémenter  
**Priorité :** P0 — Urgent

---

## Feature 1 — Correction Cooldown : minimum 0s, maximum 36 000s

### Problème

Le cooldown entre ouvertures de conversations non lues a actuellement :
- **Minimum validé à 30s** (backend `@Min(30)` + frontend `min={30}`) — l'admin ne peut pas descendre sous 30s ni désactiver le cooldown
- **Maximum à 3 600s** (1h) — le besoin réel est de 36 000s (10h)

### Solution cible

| Paramètre | Avant | Après |
|-----------|-------|-------|
| Minimum | 30s | **0s** (désactivé si 0) |
| Maximum | 3 600s (1h) | **36 000s** (10h) |

### Vérification préalable : comportement de `readCooldownSeconds = 0`

La logique `cooldownRemainingMs()` dans `chatStore.ts` :

```typescript
cooldownRemainingMs: (): number => {
  const { lastUnreadOpenedAt, readCooldownSeconds } = get();
  if (lastUnreadOpenedAt === null) return 0;
  const elapsed = Date.now() - lastUnreadOpenedAt;
  const remaining = readCooldownSeconds * 1000 - elapsed;
  return remaining > 0 ? remaining : 0;
},
```

Quand `readCooldownSeconds = 0` :
- `remaining = 0 × 1000 - elapsed = -elapsed` → toujours négatif
- `remaining > 0` → `false` → retourne `0`
- Dans `selectConversation` : `if (remaining > 0) { set({ showCooldownModal: true }); return; }` → jamais déclenché

**Conclusion : aucun changement de code dans le store ni dans `IdleAndCooldownWrapper`. La valeur 0 est déjà gérée correctement — seules les validations DTO et UI sont à modifier.**

---

### Fichiers à modifier

#### US-C1 — Backend DTO : `message_whatsapp/src/dispatcher/dto/update-dispatch-settings.dto.ts`

Ligne ~68 :
```typescript
// Avant
@Min(30)
@Max(3600)
readCooldownSeconds?: number;

// Après
@Min(0)
@Max(36000)
readCooldownSeconds?: number;
```

#### US-C2 — Admin UI : `admin/src/app/ui/LectureSeuleView.tsx`

**a) Input HTML** (~ligne 230) :
```tsx
// Avant
<input type="number" min={30} max={3600} ... />

// Après
<input type="number" min={0} max={36000} ... />
```

**b) Texte d'aide** (~ligne 239) :
```tsx
// Avant
Temps d'attente entre deux ouvertures de conv non lues. Min: 30 s — Max: 3600 s

// Après
Temps d'attente entre deux ouvertures de conv non lues. Min: 0 s (désactivé) — Max: 36000 s
```

> **Note :** Aucune migration SQL nécessaire — la colonne `read_cooldown_seconds` est de type `int` sans contrainte CHECK côté DB.

---

## Feature 2 — Masquage numéros clients sur postes dédiés (front commercial)

### Problème

Dans la liste des conversations du front commercial (`ConversationItem`), le `clientPhone` est affiché en clair avant toute interaction. Sur les postes à canal dédié, cela expose inutilement les données clients. De plus, quand aucun nom de contact n'est enregistré, `clientName` contient directement le numéro de téléphone — le masquage du seul `clientPhone` serait alors insuffisant.

### Définition du comportement

- **Poste dédié** : `conversation.channel_dedicated === true` (champ déjà présent sur le type `Conversation`, alimenté par `raw.channel_dedicated ?? !!(raw.channel?.poste_id)` — aucun changement backend)
- **Règle d'affichage** :
  - `channel_dedicated && !isSelected` → numéro masqué : icône cadenas + `+•• ••••••••••`
  - `channel_dedicated && isSelected` → numéro en clair (conversation ouverte)
  - `!channel_dedicated` → comportement inchangé

### Portée du masquage

| Vue | Comportement |
|-----|-------------|
| Liste des conversations (sidebar) | **Masqué** si `channel_dedicated && !isSelected` |
| En-tête de conversation (`ChatHeader`) | Visible — la conversation est déjà sélectionnée |
| `ContactDetailView` (vue contacts) | Visible — action explicite de l'utilisateur = consentement |

> La `ContactDetailView` est accessible uniquement par une action délibérée (clic sur "Voir le contact"). Ce geste constitue un consentement explicite → le numéro reste visible, c'est intentionnel.

---

### Fichiers à modifier

#### US-M1 — `front/src/components/sidebar/ConversationItem.tsx`

Deux cas à masquer : `clientPhone` (ligne 123) et `clientName` s'il ressemble à un numéro de téléphone (ligne 118).

**Détection d'un nom qui est en réalité un numéro :**
```typescript
const isPhoneNumber = (value: string) => /^\+?\d[\d\s\-\.]{5,}$/.test(value.trim());

const isDedicated = conversation.channel_dedicated && !isSelected;
const displayPhone = isDedicated ? '+•• ••••••••••' : conversation.clientPhone;
const displayName  = isDedicated && isPhoneNumber(conversation.clientName)
  ? '+•• ••••••••••'
  : conversation.clientName;
```

**Remplacement dans le JSX — nom** (~ligne 118) :
```tsx
// Avant
<h3 className="font-semibold text-gray-800 truncate">{conversation.clientName}</h3>

// Après
<h3 className="font-semibold text-gray-800 truncate">{displayName}</h3>
```

**Remplacement dans le JSX — numéro** (~ligne 123) :
```tsx
// Avant
<p className="text-sm text-gray-600 truncate">{conversation.clientPhone}</p>

// Après
<p className={`text-sm truncate flex items-center gap-1 ${isDedicated ? 'text-gray-300 tracking-widest select-none' : 'text-gray-600'}`}>
  {isDedicated && <Lock className="w-3 h-3 text-gray-300 flex-shrink-0" />}
  {displayPhone}
</p>
```

> **UX** :
> - L'icône `Lock` (lucide-react, déjà importée dans le projet) indique explicitement que le masquage est intentionnel — pas un bug d'affichage
> - `text-gray-300` + `tracking-widest` rendent le masque visuellement distinct
> - `select-none` empêche la sélection/copie du masque `+•• ••••••••••`
> - L'import `Lock` est à ajouter dans les imports lucide existants de `ConversationItem.tsx`

---

### Points d'attention

| Point | Détail |
|-------|--------|
| `channel_dedicated` déjà disponible | Champ sur `Conversation` (chat.ts:302), alimenté dans le mapper — 0 changement backend |
| `clientName = numéro` couvert | `isPhoneNumber()` détecte les noms qui sont en réalité des numéros et les masque aussi |
| `ContactDetailView` — intentionnel | Numéro visible car action délibérée de l'utilisateur |
| Masquage client-side | Donnée présente dans le store JS — suffisant pour un outil interne |
| `readCooldownSeconds = 0` déjà géré | `cooldownRemainingMs()` retourne 0 → cooldown bypassé nativement, aucun code à modifier dans le store |
| 0 migration SQL | Aucun changement de schéma |

---

## Ordre d'implémentation

```
US-C1  (Backend DTO — @Min(0) @Max(36000))
  ↓
US-C2  (Admin UI — input min/max + texte)
  ↓
US-M1  (ConversationItem — masquage clientPhone + clientName + icône Lock)
```

---

## Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `message_whatsapp/src/dispatcher/dto/update-dispatch-settings.dto.ts` | Modifier — `@Min(30)` → `@Min(0)`, `@Max(3600)` → `@Max(36000)` |
| `admin/src/app/ui/LectureSeuleView.tsx` | Modifier — `min={30}` → `min={0}`, `max={3600}` → `max={36000}`, texte d'aide |
| `front/src/components/sidebar/ConversationItem.tsx` | Modifier — masquage `clientPhone` + `clientName` (si numéro) + icône `Lock` |
