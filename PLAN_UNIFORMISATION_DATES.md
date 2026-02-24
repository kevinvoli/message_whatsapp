# Plan d'Uniformisation des Dates et Affichage des Tableaux

**Date:** 2026-02-18
**Scope:** Frontend (front/), Admin (admin/), Backend (message_whatsapp/)

---

## 1. ETAT DES LIEUX - PROBLEMES IDENTIFIES

### 1.1 Nommage incohérent des colonnes de dates (Backend)

| Convention | Entités concernées |
|---|---|
| **snake_case** (`created_at`, `updated_at`) | Admin, Commercial, Poste, DispatchSettings, DispatchSettingsAudit, MessageAuto, ProviderChannel |
| **camelCase** (`createdAt`, `updatedAt`) | Message, Chat, Contact, Media, Button, ChatLabel, WebhookEvent, Error, Customer, WhatsappContact |

**Impact:** Le front doit gérer les 2 conventions avec des fallbacks (`raw.created_at ?? raw.createdAt`), ce qui complique le code et crée des bugs potentiels.

### 1.2 Formats de dates incohérents (Frontend + Admin)

| Fichier | Fonction | Format | Locale |
|---------|----------|--------|--------|
| **FRONT - ConversationItem.tsx** | `formatTime()` | < 24h: HH:mm / < 7j: jour / > 7j: DD/MM | `fr-FR` |
| **FRONT - ChatMessage.tsx** | `formatTime()` | HH:mm | `fr-FR` |
| **FRONT - ChatMessages.tsx** | `formatTime()` | HH:mm (inutilisé) | `fr-FR` |
| **FRONT - contactListview.tsx** | `formatDate()` | Relatif ("Hier", "Il y a X jours") ou d MMM YYYY | `fr-FR` |
| **FRONT - callButton.tsx** | `formatLastCallDate()` | Relatif ("Hier", "Il y a X jours") ou d MMM | `fr-FR` |
| **FRONT - ChatMessages.tsx:75** | `.toString()` | **Date brute JS non formatée!** | Aucune |
| **ADMIN - ConversationsView.tsx** | `formatDateTime()` | Date+Heure complète | `fr-FR` |
| **ADMIN - MessagesView.tsx** | `toLocaleDateString()` | Date seule | **Aucune locale** |
| **ADMIN - ClientsView.tsx** | `toLocaleDateString()` | Date seule | **Aucune locale** |
| **ADMIN - ChannelsView.tsx** | `toLocaleDateString()` | Date seule | **Aucune locale** |
| **ADMIN - PostesView.tsx** | `toLocaleDateString()` | Date seule + fallback Date.now() | **Aucune locale** |
| **ADMIN - MessageAutoView.tsx** | `toLocaleDateString()` | Date seule + fallback Date.now() | **Aucune locale** |
| **ADMIN - CommerciauxView.tsx** | `formatDate()` | Relatif ("Il y a Xmin/h/j") | Aucune |
| **ADMIN - QueueView.tsx** | `formatDate()` | Date+Heure | **Aucune locale** |
| **ADMIN - DispatchView.tsx** | `formatDate()` | Date+Heure | **Aucune locale** |
| **ADMIN - GoNoGoView.tsx** | `toLocaleString()` | Date+Heure | **Aucune locale** |
| **ADMIN - ObservabiliteView.tsx** | `toLocaleString()` | Date+Heure | **Aucune locale** |
| **ADMIN - PerformanceView.tsx** | `toLocaleDateString()` | Graphiques | `fr-FR` |
| **ADMIN - OverviewView.tsx** | `toLocaleDateString()` | Graphiques | `fr-FR` |

**Problemes majeurs:**
- **4 implementations différentes** de `formatDate()` dans l'admin
- **80% des affichages admin** n'ont pas de locale spécifiée
- **1 date brute** (`.toString()`) affichée dans le front
- **2 fichiers** font fallback sur `Date.now()` si la date est absente (montre la date du jour au lieu de "N/A")

### 1.3 Tri des données dans les tableaux

| Vue | Tri par défaut | Champ de tri |
|-----|---------------|--------------|
| **FRONT - Contacts** | Plus récent d'abord | `createdAt` DESC |
| **FRONT - Messages** | Plus ancien d'abord | `timestamp` ASC |
| **BACK - Conversations** | Plus récent d'abord | `updatedAt` DESC |
| **BACK - Contacts** | Plus récent d'abord | `createdAt` DESC |
| **BACK - Messages dans chat** | Plus ancien d'abord | `createdAt` ASC |
| **BACK - Postes** | Plus récent d'abord | `created_at` DESC |
| **BACK - Queue** | Par position | `position` ASC |
| **BACK - Dispatch audit** | Plus récent d'abord | `created_at` DESC |
| **BACK - Dispatch settings** | Plus ancien d'abord | `created_at` ASC |

### 1.4 Types de dates incohérents (Frontend)

```typescript
// Conversation - types mixtes
createdAt: string | number | Date;  // PROBLEME: 3 types possibles
updatedAt: string | number | Date;

// Contact - OK
createdAt: Date;
updatedAt: Date;

// Message - OK
timestamp: Date;
```

---

## 2. CONVENTION CIBLE

### 2.1 Nommage des colonnes (Backend)

**Convention choisie: `camelCase`** (aligné avec TypeORM et la majorité des entités existantes)

| Avant | Après |
|-------|-------|
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |
| `deleted_at` | `deletedAt` |

**Entités à migrer:** Admin, Commercial, Poste, DispatchSettings, DispatchSettingsAudit, MessageAuto, ProviderChannel

**Note:** Migration de base de données requise (ALTER TABLE RENAME COLUMN) ou utilisation de `@Column({ name: 'created_at' })` avec propriété `createdAt`.

### 2.2 Formats de dates (Frontend + Admin)

**3 formats standardisés:**

| Contexte | Format | Exemple | Fonction |
|----------|--------|---------|----------|
| **Date relative** (< 7 jours) | Relatif | "Il y a 2h", "Hier", "Il y a 3 jours" | `formatRelativeDate()` |
| **Date absolue courte** (tableaux, listes) | DD/MM/YYYY HH:mm | "18/02/2026 14:30" | `formatDate()` |
| **Date absolue longue** (détails, tooltips) | Jour DD Mois YYYY a HH:mm | "Mardi 18 février 2026 a 14:30" | `formatDateLong()` |
| **Heure seule** (messages dans un chat) | HH:mm | "14:30" | `formatTime()` |
| **Date seule** (tableaux simples) | DD/MM/YYYY | "18/02/2026" | `formatDateShort()` |

**Regles:**
- Toujours utiliser la locale `fr-FR`
- Les dates nulles/undefined affichent `"-"` (jamais `Date.now()` en fallback)
- Les dates invalides affichent `"-"`

### 2.3 Librairie de dates

**Pas de librairie externe** - Le projet utilise uniquement l'API native `Intl.DateTimeFormat` / `toLocaleString`. On garde cette approche mais on centralise dans un fichier utilitaire unique.

### 2.4 Tri par défaut dans les tableaux

**Regle:** Toutes les listes/tableaux sont triés par **date de creation descendante** (plus récent en premier) sauf:
- **Messages dans un chat:** triés par `timestamp` ASC (chronologique)
- **Queue:** triés par `position` ASC (ordre de file)

---

## 3. PLAN D'IMPLEMENTATION

### Phase 1: Créer le fichier utilitaire partagé

**Fichier a créer:** `front/src/lib/dateUtils.ts` et `admin/src/app/lib/dateUtils.ts`

```typescript
const LOCALE = 'fr-FR';

/** Retourne "-" si la date est nulle ou invalide */
function safeDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Heure seule: "14:30" */
export function formatTime(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '--:--';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/** Date courte: "18/02/2026" */
export function formatDateShort(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Date + heure: "18/02/2026 14:30" */
export function formatDate(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  return `${formatDateShort(d)} ${formatTime(d)}`;
}

/** Date longue: "mardi 18 fevrier 2026 a 14:30" */
export function formatDateLong(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  return d.toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Date relative: "Il y a 2h", "Hier", "Il y a 3 jours", ou date courte si > 7j */
export function formatRelativeDate(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `Il y a ${diffMin}min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
  return formatDateShort(d);
}

/**
 * Format intelligent pour les sidebars de conversation:
 * - Aujourd'hui: "14:30"
 * - Cette semaine: "Lun."
 * - Plus ancien: "18/02"
 */
export function formatConversationTime(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';

  const diffMs = Date.now() - d.getTime();
  if (diffMs < 86400000) return formatTime(d);
  if (diffMs < 604800000) return d.toLocaleDateString(LOCALE, { weekday: 'short' });
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
}
```

### Phase 2: Migrer le Frontend (front/)

| Fichier | Action | Priorité |
|---------|--------|----------|
| `components/sidebar/ConversationItem.tsx` | Remplacer `formatTime()` local par `formatConversationTime()` | Haute |
| `components/chat/ChatMessage.tsx` | Remplacer `formatTime()` local par `formatTime()` du utils | Haute |
| `components/chat/ChatMessages.tsx` | Supprimer `formatTime()` inutilisé. Remplacer `.toString()` (ligne 75) par `formatDateLong()` | **Critique** |
| `components/contact/contactListview.tsx` | Remplacer `formatDate()` local par `formatRelativeDate()` | Haute |
| `components/conversation/callButton.tsx` | Remplacer `formatLastCallDate()` local par `formatRelativeDate()` | Moyenne |
| `types/chat.ts` | Changer `createdAt: string \| number \| Date` en `createdAt: Date` dans Conversation | Haute |
| `types/chat.ts` | Mettre a jour `transformToConversation()` pour toujours convertir en `Date` | Haute |

### Phase 3: Migrer l'Admin (admin/)

| Fichier | Action | Priorité |
|---------|--------|----------|
| `ui/ConversationsView.tsx` | Remplacer `formatDateTime()` local par `formatDate()` du utils | Haute |
| `ui/MessagesView.tsx` | Remplacer `toLocaleDateString()` par `formatDate()` | Haute |
| `ui/ClientsView.tsx` | Remplacer `toLocaleDateString()` par `formatDateShort()` | Haute |
| `ui/ChannelsView.tsx` | Remplacer `toLocaleDateString()` par `formatDateShort()` | Haute |
| `ui/PostesView.tsx` | Remplacer `toLocaleDateString()` + fallback `Date.now()` par `formatDateShort()` | **Critique** |
| `ui/MessageAutoView.tsx` | Remplacer `toLocaleDateString()` + fallback `Date.now()` par `formatDateShort()` | **Critique** |
| `ui/CommerciauxView.tsx` | Remplacer `formatDate()` local par `formatRelativeDate()` | Haute |
| `ui/QueueView.tsx` | Remplacer `formatDate()` local par `formatDate()` du utils | Haute |
| `ui/DispatchView.tsx` | Remplacer `formatDate()` local par `formatDate()` du utils | Haute |
| `ui/GoNoGoView.tsx` | Remplacer `toLocaleString()` par `formatDate()` | Moyenne |
| `ui/ObservabiliteView.tsx` | Remplacer `toLocaleString()` par `formatDate()` | Moyenne |
| `ui/PerformanceView.tsx` | OK - Garder le format graphique actuel (deja en `fr-FR`) | - |
| `ui/OverviewView.tsx` | OK - Garder le format graphique actuel (deja en `fr-FR`) | - |
| `lib/utils.ts` | Supprimer `formatDateRelative()` (remplacé par `dateUtils.ts`) | Haute |

### Phase 4: Uniformiser le nommage Backend

**Option A (recommandée) - Alias dans les entités:**
Garder les noms de colonnes SQL existants mais utiliser des propriétés camelCase:

```typescript
// Avant:
@CreateDateColumn({ type: 'timestamp' })
created_at: Date;

// Après:
@CreateDateColumn({ type: 'timestamp', name: 'created_at' })
createdAt: Date;
```

**Entités a modifier:** WhatsappCommercial, WhatsappPoste, Admin, DispatchSettings, DispatchSettingsAudit, MessageAuto, ProviderChannel

### Phase 5: Uniformiser les tris par défaut

| Service | Tri actuel | Tri cible | Action |
|---------|-----------|-----------|--------|
| Contact.findAll() | `createdAt: DESC` | `createdAt: DESC` | OK |
| Chat.findByPosteId() | `updatedAt: DESC` | `updatedAt: DESC` | OK |
| Message.findBychat_id() | `createdAt: ASC` | `timestamp: ASC` | **Changer** - trier par timestamp provider |
| Poste.findAll() | `created_at: DESC` | `createdAt: DESC` | Renommer apres Phase 4 |
| DispatchAudit | `created_at: DESC` | `createdAt: DESC` | Renommer apres Phase 4 |

---

## 4. MATRICE DE CORRESPONDANCE FORMAT / CONTEXTE

| Contexte d'affichage | Fonction a utiliser | Exemple |
|----------------------|--------------------:|---------|
| Sidebar conversation (timestamp) | `formatConversationTime()` | "14:30" / "Lun." / "18/02" |
| Message dans un chat (timestamp) | `formatTime()` | "14:30" |
| Debut de conversation (banner) | `formatDateLong()` | "mardi 18 fevrier 2026 a 14:30" |
| Tableau admin - colonne "Cree le" | `formatDateShort()` | "18/02/2026" |
| Tableau admin - colonne "Derniere activite" | `formatRelativeDate()` | "Il y a 2h" / "Hier" |
| Detail conversation (dates d'info) | `formatDate()` | "18/02/2026 14:30" |
| Tooltip / info-bulle | `formatDateLong()` | "mardi 18 fevrier 2026 a 14:30" |
| Graphiques (axe X) | Garder format actuel | "lun. 18" |
| Dernier appel (contacts) | `formatRelativeDate()` | "Hier" / "Il y a 3 jours" |
| Metrics webhook (admin) | `formatDate()` | "18/02/2026 14:30" |

---

## 5. ESTIMATION DE L'EFFORT

| Phase | Fichiers touches | Complexité | Risque de régression |
|-------|-----------------|------------|---------------------|
| Phase 1: Fichier utilitaire | 2 (nouveau) | Faible | Aucun |
| Phase 2: Migration front | 7 fichiers | Moyenne | Faible (affichage seul) |
| Phase 3: Migration admin | 12 fichiers | Moyenne | Faible (affichage seul) |
| Phase 4: Backend nommage | 7 entités | Haute | **Moyen** (migration BDD) |
| Phase 5: Tris | 2 services | Faible | Faible |

**Recommandation:** Commencer par Phase 1 + 2 + 3 (aucun risque backend). Phase 4 peut etre faite ensuite avec une migration SQL.
