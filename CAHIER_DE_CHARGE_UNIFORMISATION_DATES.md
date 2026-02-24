# Cahier de Charge - Uniformisation des Dates et Affichage des Tableaux

**Projet:** WhatsApp CRM
**Date:** 2026-02-18
**Version:** 1.0
**Branche de reference:** inification

---

## Table des matieres

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Tickets P0 - Critiques](#2-tickets-p0---critiques)
3. [Tickets P1 - Haute priorite](#3-tickets-p1---haute-priorite)
4. [Tickets P2 - Moyenne priorite](#4-tickets-p2---moyenne-priorite)
5. [Tickets P3 - Basse priorite](#5-tickets-p3---basse-priorite)
6. [Matrice de dependance](#6-matrice-de-dependance)
7. [Definition of Done globale](#7-definition-of-done-globale)

---

## 1. Contexte et objectifs

### Probleme

L'application affiche les dates de maniere incohérente :
- **4 implementations differentes** de `formatDate()` dans l'admin
- **80% des affichages admin** sans locale `fr-FR`
- **1 date brute** JS (`.toString()`) visible par l'utilisateur
- **2 fallbacks** sur `Date.now()` qui affichent la date du jour au lieu de "N/A"
- **Nommage incohérent** des colonnes backend (`created_at` vs `createdAt`)
- **Types mixtes** dans les interfaces frontend (`string | number | Date`)

### Objectifs

1. Toutes les dates affichees utilisent la locale `fr-FR`
2. Un format unique et previsible par contexte d'affichage
3. Un seul fichier utilitaire par application (front + admin)
4. Nommage uniforme des colonnes de dates cote backend
5. Tri par defaut coherent dans tous les tableaux

### Hors scope

- Migration de base de donnees (ALTER TABLE) - sera un ticket separe
- Changement de librairie de dates (on reste sur l'API native)
- Refonte UI des composants de tableau

---

## 2. Tickets P0 - Critiques

> Bugs visibles par l'utilisateur final. A corriger immediatement.

---

### TICKET P0-1 : Date brute affichee dans le chat -- FERME

**Statut:** TERMINE
**Composant:** Frontend
**Fichier:** `front/src/components/chat/ChatMessages.tsx`

**Criteres d'acceptation:**
- [x] La date de debut de conversation s'affiche au format `"jour DD mois YYYY a HH:mm"`
- [x] Si `createdAt` est null/undefined, afficher `"-"`
- [x] Locale `fr-FR` utilisee

---

### TICKET P0-2 : Fallback Date.now() dans PostesView (Admin) -- FERME

**Statut:** TERMINE
**Composant:** Admin
**Fichier:** `admin/src/app/ui/PostesView.tsx`

**Criteres d'acceptation:**
- [x] Si la date est absente, afficher `"-"` et non la date du jour
- [x] Format `DD/MM/YYYY` avec locale `fr-FR`
- [x] Pas de crash si la valeur est null/undefined

---

### TICKET P0-3 : Fallback Date.now() dans MessageAutoView (Admin) -- FERME

**Statut:** TERMINE
**Composant:** Admin
**Fichier:** `admin/src/app/ui/MessageAutoView.tsx`

**Criteres d'acceptation:**
- [x] Si la date est absente, afficher `"-"` et non la date du jour
- [x] Format `DD/MM/YYYY` avec locale `fr-FR`

---

## 3. Tickets P1 - Haute priorite

> Infrastructure et migrations necessaires pour uniformiser l'affichage. Prerequis des tickets P0.

---

### TICKET P1-1 : Creer le fichier utilitaire de dates (Frontend) -- FERME

**Statut:** TERMINE
**Fichier cree:** `front/src/lib/dateUtils.ts`

**Criteres d'acceptation:**
- [x] Fichier cree avec toutes les 7 fonctions
- [x] Chaque fonction gere les cas null, undefined, string invalide, number invalide
- [x] Export nomme (pas de default export)
- [x] Pas de dependance externe (API native uniquement)
- [ ] Tests unitaires pour chaque fonction (→ reporte en P3-1)

---

### TICKET P1-2 : Creer le fichier utilitaire de dates (Admin) -- FERME

**Statut:** TERMINE
**Fichier cree:** `admin/src/app/lib/dateUtils.ts`

**Criteres d'acceptation:**
- [x] Memes fonctions que P1-1
- [x] Memes regles de formatage
- [ ] Tests unitaires (→ reporte en P3-1)

---

### TICKET P1-3 : Migrer les formatages de dates du Frontend -- FERME

**Statut:** TERMINE (5/5 fichiers migres)

- [x] P1-3a : ConversationItem.tsx → `formatConversationTime`
- [x] P1-3b : ChatMessage.tsx → `formatTime`
- [x] P1-3c : ChatMessages.tsx → `formatDateLong` + suppression code mort
- [x] P1-3d : contactListview.tsx → `formatRelativeDate`
- [x] P1-3e : callButton.tsx → `formatRelativeDate`

**Criteres d'acceptation globaux:**
- [x] Aucune fonction de formatage de date locale ne subsiste dans les 5 fichiers
- [x] Toutes les dates utilisent le fichier utilitaire
- [x] TypeScript compile sans erreur

---

### TICKET P1-4 : Migrer les formatages de dates de l'Admin -- FERME

**Statut:** TERMINE (10/10 fichiers migres)

- [x] P1-4a : ConversationsView.tsx → `formatDate` + `formatTime`
- [x] P1-4b : MessagesView.tsx → `formatDateShort`
- [x] P1-4c : CommerciauxView.tsx → `formatRelativeDate`
- [x] P1-4d : ClientsView.tsx → `formatDateShort`
- [x] P1-4e : ChannelsView.tsx → `formatDateShort`
- [x] P1-4f : PostesView.tsx → `formatDateShort` (via P0-2)
- [x] P1-4g : MessageAutoView.tsx → `formatDateShort` (via P0-3)
- [x] P1-4h : QueueView.tsx → `formatDate` (import)
- [x] P1-4i : DispatchView.tsx → `formatDate` (import)
- [x] P1-4j : GoNoGoView.tsx + ObservabiliteView.tsx → `formatDate`

**Criteres d'acceptation globaux:**
- [x] Aucune fonction de formatage locale ne subsiste dans les 10 fichiers
- [x] Toutes les dates utilisent `dateUtils.ts`
- [x] `formatDateRelative()` de `utils.ts` supprime (P2-4)
- [x] TypeScript compile sans erreur

---

### TICKET P1-5 : Uniformiser le type de `createdAt` dans Conversation (Frontend) -- FERME

**Statut:** TERMINE
**Fichier:** `front/src/types/chat.ts`

**Criteres d'acceptation:**
- [x] Le type `Conversation.createdAt` est `Date` (pas union)
- [x] Le type `Conversation.updatedAt` est `Date` (pas union)
- [x] `transformToConversation()` convertit toujours en `Date`
- [x] Pas d'erreur TypeScript dans le projet

---

## 4. Tickets P2 - Moyenne priorite

> Ameliorations de coherence backend. Pas de regression visible mais necessaires pour la maintenabilite.

---

### TICKET P2-1 : Uniformiser le nommage des colonnes de dates (Backend)

**Composant:** Backend
**Convention cible:** camelCase (`createdAt`, `updatedAt`, `deletedAt`)

**Methode:** Utiliser l'option `name` de TypeORM pour garder le nom SQL existant tout en exposant une propriete camelCase.

**Entites a modifier:**

| Entite | Fichier | Avant | Apres |
|--------|---------|-------|-------|
| WhatsappCommercial | `whatsapp_commercial/entities/user.entity.ts` l.72-79 | `created_at`, `updated_at`, `deleted_at` | `createdAt` (name: 'created_at'), `updatedAt`, `deletedAt` |
| WhatsappPoste | `whatsapp_poste/entities/whatsapp_poste.entity.ts` l.54-66 | `created_at`, `updated_at` | `createdAt` (name: 'created_at'), `updatedAt` |
| Admin | `admin/entities/admin.entity.ts` l.29-33 | `created_at`, `updated_at` | `createdAt` (name: 'created_at'), `updatedAt` |
| DispatchSettings | `dispatcher/entities/dispatch-settings.entity.ts` l.36-40 | `created_at`, `updated_at` | `createdAt` (name: 'created_at'), `updatedAt` |
| DispatchSettingsAudit | `dispatcher/entities/dispatch-settings-audit.entity.ts` l.19-20 | `created_at` | `createdAt` (name: 'created_at') |
| MessageAuto | `message-auto/entities/message-auto.entity.ts` l.57-61 | `created_at`, `updated_at` | `createdAt` (name: 'created_at'), `updatedAt` |
| ProviderChannel | `channel/entities/provider-channel.entity.ts` l.38-50 | `created_at`, `updated_at` | `createdAt` (name: 'created_at'), `updatedAt` |

**Exemple de transformation:**
```typescript
// Avant:
@CreateDateColumn({ type: 'timestamp' })
created_at: Date;

// Apres:
@CreateDateColumn({ type: 'timestamp', name: 'created_at' })
createdAt: Date;
```

**Impact sur les services:**
Chaque service qui reference `created_at` ou `updated_at` doit etre mis a jour :
- `whatsapp_poste.service.ts` : `order: { created_at: 'DESC' }` → `order: { createdAt: 'DESC' }`
- `dispatch-settings.service.ts` : `order: { created_at: 'ASC' }` → `order: { createdAt: 'ASC' }`
- `dispatch-settings.service.ts` : `audit.created_at` → `audit.createdAt` (dans les QueryBuilder)

**Criteres d'acceptation:**
- [ ] Toutes les 7 entites migrees
- [ ] Aucun changement de schema SQL (les noms de colonnes restent snake_case)
- [ ] Tous les services referençant les anciens noms sont mis a jour
- [ ] Le build TypeScript passe sans erreur
- [ ] Les tests existants passent

**Dependance:** Aucune (peut etre fait en parallele des tickets frontend)

---

### TICKET P2-2 : Uniformiser le tri par defaut des messages

**Composant:** Backend
**Fichier:** `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`
**Ligne:** 499

**Probleme:**
```typescript
// Les messages sont tries par createdAt (date d'insertion en BDD)
order: { createdAt: 'ASC' }

// Mais le timestamp du provider peut etre different de createdAt
// Ex: message recu avec 5 min de retard → createdAt != timestamp
```

**Correction attendue:**
```typescript
order: { timestamp: 'ASC' }
```

**Criteres d'acceptation:**
- [ ] Les messages dans un chat sont tries par `timestamp` (date provider) et non `createdAt`
- [ ] L'ordre chronologique des messages correspond a la realite
- [ ] Pas de regression sur les chats existants

**Dependance:** Aucune

---

### TICKET P2-3 : Supprimer la variable `tempId` inutilisee (Frontend) -- FERME

**Statut:** TERMINE (corrige dans commit `fa512ce`)

**Criteres d'acceptation:**
- [x] Aucune variable declaree mais non utilisee dans `sendMessage()`

---

### TICKET P2-4 : Supprimer le formatDateRelative() obsolete dans utils.ts (Admin) -- FERME

**Statut:** TERMINE

**Criteres d'acceptation:**
- [x] `formatDateRelative()` supprimee de `utils.ts`
- [x] Aucun import de `formatDateRelative` dans le projet
- [x] Build passe sans erreur

---

## 5. Tickets P3 - Basse priorite

> Ameliorations de qualite. A planifier quand les tickets P0-P2 sont termines.

---

### TICKET P3-1 : Ajouter les tests unitaires pour dateUtils.ts

**Composant:** Frontend + Admin

**Description:**
Ecrire des tests unitaires couvrant toutes les fonctions de `dateUtils.ts`.

**Cas a tester par fonction:**

| Fonction | Cas nominal | Cas null | Cas invalide | Cas limite |
|----------|------------|---------|-------------|------------|
| `safeDate()` | Date valide | null | `"abc"` | `0`, `NaN` |
| `formatTime()` | `"14:30"` | `"--:--"` | `"--:--"` | Minuit `"00:00"` |
| `formatDateShort()` | `"18/02/2026"` | `"-"` | `"-"` | 01/01/2000 |
| `formatDate()` | `"18/02/2026 14:30"` | `"-"` | `"-"` | Date ISO string |
| `formatDateLong()` | Format long | `"-"` | `"-"` | Date number (timestamp) |
| `formatRelativeDate()` | `"Il y a 2h"` | `"-"` | `"-"` | Exactement 7 jours, 30 jours |
| `formatConversationTime()` | `"14:30"` | `"-"` | `"-"` | Exactement 24h, 7j |

**Criteres d'acceptation:**
- [ ] Couverture 100% des fonctions
- [ ] Tests pour Date, string ISO, number timestamp, null, undefined, NaN, string invalide
- [ ] Les tests passent en CI

**Dependance:** P1-1, P1-2

---

### TICKET P3-2 : Uniformiser les types de dates dans definitions.ts (Admin)

**Composant:** Admin
**Fichier:** `admin/src/app/lib/definitions.ts`

**Probleme:**
Les types `Poste` et `MessageAuto` ont des champs en double :
```typescript
type Poste = {
  created_at?: string;   // doublon
  updated_at?: string;   // doublon
  createdAt?: string;
  updatedAt?: string;
};
```

**Correction attendue:**
Apres le ticket P2-1 (backend uniforme en camelCase), les types admin peuvent etre simplifies :
```typescript
type Poste = {
  createdAt: string;
  updatedAt: string;
};
```

**Criteres d'acceptation:**
- [ ] Plus de champs `created_at` / `updated_at` dans les types admin
- [ ] Tous les composants utilisent `createdAt` / `updatedAt`
- [ ] Build passe sans erreur

**Dependance:** P2-1

---

### TICKET P3-3 : Mettre a jour `last_message_date` du Contact (Backend)

**Composant:** Backend
**Fichier:** `message_whatsapp/src/contact/contact.service.ts`

**Probleme:**
Le champ `last_message_date` existe dans l'entite `Contact` mais n'est **jamais mis a jour** automatiquement quand un message est recu.

**Correction attendue:**
Ajouter une mise a jour de `contact.last_message_date = new Date()` dans le flux de reception de message (`whatsapp_message.service.ts`), au moment ou un message entrant est sauvegarde.

**Criteres d'acceptation:**
- [ ] `last_message_date` mis a jour a chaque message entrant
- [ ] La date correspond au timestamp du message, pas a `Date.now()`
- [ ] Le champ est disponible cote frontend dans le tableau des contacts

**Dependance:** Aucune

---

### TICKET P3-4 : Graphiques admin - verifier la coherence des formats

**Composant:** Admin
**Fichiers:** `PerformanceView.tsx`, `OverviewView.tsx`

**Description:**
Les graphiques utilisent deja `fr-FR` avec des options `Intl.DateTimeFormat`. Verifier qu'ils sont coherents avec les autres formats et qu'il n'y a pas de doublon avec `dateUtils.ts`.

**Action:**
- Verifier que les formats graphiques restent specifiques (axe X = `"lun. 18"`, tooltip = `"lundi 18 fevrier"`)
- Ne PAS migrer les graphiques vers `dateUtils.ts` (les formats de graphiques sont intentionnellement differents)
- Documenter ce choix dans un commentaire

**Criteres d'acceptation:**
- [ ] Formats graphiques inchanges
- [ ] Commentaire expliquant pourquoi ils n'utilisent pas `dateUtils.ts`

**Dependance:** Aucune

---

## 6. Matrice de dependance

```
P1-1 (dateUtils front)
  └── P0-1 (date brute ChatMessages)
  └── P1-3 (migration front - 5 fichiers)
  └── P1-5 (types Conversation)
  └── P3-1 (tests)

P1-2 (dateUtils admin)
  └── P0-2 (fallback PostesView)
  └── P0-3 (fallback MessageAutoView)
  └── P1-4 (migration admin - 10 fichiers)
      └── P2-4 (supprimer formatDateRelative obsolete)
  └── P3-1 (tests)

P2-1 (nommage backend)
  └── P3-2 (types definitions.ts admin)

// Tickets independants (pas de dependance) :
P2-2 (tri messages par timestamp)
P2-3 (variable tempId)
P3-3 (last_message_date)
P3-4 (graphiques admin)
```

### Ordre d'execution recommande

```
Sprint 1 (immediat):
  P1-1 → P0-1 + P1-3 + P1-5  (front)
  P1-2 → P0-2 + P0-3 + P1-4  (admin)
  // Les deux branches peuvent etre faites en parallele

Sprint 2 (suivant):
  P2-1 (backend nommage)
  P2-2 (tri messages)
  P2-4 (cleanup utils.ts)

Sprint 3 (quand disponible):
  P3-1 (tests)
  P3-2 (types admin)
  P3-3 (last_message_date)
  P3-4 (graphiques)
```

---

## 7. Definition of Done globale

Un ticket est considere comme termine quand :

- [ ] Le code est ecrit et compile sans erreur TypeScript
- [ ] Les fonctions de formatage locales supprimees n'apparaissent plus dans le fichier
- [ ] La locale `fr-FR` est utilisee sur tout nouvel appel de formatage
- [ ] Les dates null/undefined affichent `"-"` (pas de fallback Date.now())
- [ ] Le rendu visuel est verifie manuellement (pas de date brute, pas de format anglais)
- [ ] Le code est commite sur la branche dediee
- [ ] La PR est revue et mergee

---

## Annexe : Matrice Format / Contexte

| Contexte d'affichage | Fonction | Exemple de sortie |
|----------------------|----------|-------------------|
| Sidebar conversation (timestamp) | `formatConversationTime()` | `"14:30"` / `"Lun."` / `"18/02"` |
| Message dans un chat | `formatTime()` | `"14:30"` |
| Banner debut conversation | `formatDateLong()` | `"mardi 18 fevrier 2026 a 14:30"` |
| Tableau - colonne "Cree le" | `formatDateShort()` | `"18/02/2026"` |
| Tableau - colonne "Derniere activite" | `formatRelativeDate()` | `"Il y a 2h"` / `"Hier"` |
| Detail conversation (info cards) | `formatDate()` | `"18/02/2026 14:30"` |
| Tooltip / info-bulle | `formatDateLong()` | `"mardi 18 fevrier 2026 a 14:30"` |
| Graphiques (axe X) | Format specifique (non migre) | `"lun. 18"` |
| Derniere connexion (commerciaux) | `formatRelativeDate()` | `"Il y a 5min"` |
| Metrics webhook (admin) | `formatDate()` | `"18/02/2026 14:30"` |
