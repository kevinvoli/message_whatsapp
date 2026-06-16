# Rapport — Fonctionnalité Formation des Commerciaux & QCM

**Date** : 2026-06-16
**Branche analysée** : `production` / `origin/qcm`
**État global** : ✅ LIVRÉ — ⚠️ 14 bugs identifiés (4 bloquants, 3 sécurité, 7 mineurs)

---

## I. Résumé exécutif

Le système de formation par QCM est **entièrement implémenté** dans le monorepo. Il couvre la création de contenu (catégories, questions, sessions), le passage du quiz par les commerciaux (avec timers, randomisation, sousmission), la consultation des résultats et la gestion documentaire (PDFs de formation).

### Flux métier global

```
ADMIN crée formation
  → Catégories + Questions + Session datée
      ↓
COMMERCIAL (jour J)
  → GET /quiz/today → session détectée
  → POST /quiz/today/start → tentative + ordre aléatoire
  → Répond question par question (timers)
  → POST /quiz/today/submit → score calculé
  → Redirection /quiz/result
      ↓
ADMIN consulte résultats
  → Tableau agrégé par commercial (meilleur score, # tentatives)
```

---

## II. Architecture — Vue d'ensemble

### Couches impactées

| Couche | Répertoire | Contenu |
|--------|------------|---------|
| Backend NestJS | `message_whatsapp/src/quiz/` | Module complet : 9 entités, 5 services, 2 controllers |
| Frontend commercial | `front/src/app/quiz/` | 2 pages : quiz actif + résultats |
| Panel admin | `admin/src/app/ui/QuizView.tsx` | Composant unique de 1 926 lignes, 6 onglets |
| Base de données | Migration SQL | 9 tables MySQL (`AddQuizSystem1749686400000`) |

---

## III. Entités backend (TypeORM)

### 1. `quiz_category` — QuizCategory

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| name | varchar(100) | Ex : "Ventes", "Produits" |
| color | varchar(7) | Code hex : `#FF5733` |
| created_at | datetime | — |
| deleted_at | datetime | Soft-delete actif |

**Fichier** : `message_whatsapp/src/quiz/entities/quiz-category.entity.ts`

---

### 2. `quiz_question` — QuizQuestion

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| category_id | UUID | FK → quiz_category |
| text | text | Énoncé |
| points | decimal(5,2) | Défaut : 1.00 |
| time_limit_seconds | int | Nullable — timer par question |
| is_active | tinyint | Flag 0/1 |
| deleted_at | datetime | Soft-delete |

**Règle métier** : exactement 1 réponse correcte par question (validée en service).
**Relations** : OneToMany → quiz_answer, ManyToOne → quiz_category

---

### 3. `quiz_answer` — QuizAnswer

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| question_id | UUID | FK (CASCADE) |
| text | text | Texte réponse |
| is_correct | tinyint | 1 = bonne réponse |
| position | tinyint | Ordre d'affichage |

---

### 4. `quiz_session` — QuizSession

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| title | varchar(200) | Ex : "Formation Q2 2026" |
| session_date | date | UNIQUE — une session par jour |
| is_active | tinyint | Session accessible ? |
| passing_score | decimal(5,2) | Score minimum (nullable) |
| max_attempts | tinyint | 0 = illimité |
| total_time_minutes | int | Durée globale (nullable) |
| deleted_at | datetime | Soft-delete |

**Règles métier** :
- Une seule session active par date (`session_date` UNIQUE)
- Si `passingScore = null` → pas de verdict réussi/échoué
- Si commercial réussit → nouvelles tentatives bloquées (même si `maxAttempts` non atteint)

---

### 5. `quiz_session_question` — QuizSessionQuestion

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| session_id | UUID | FK (CASCADE) |
| question_id | UUID | FK |
| position | smallint | Ordre défini par l'admin |

**Contrainte unique** : `(session_id, question_id)`

---

### 6. `quiz_attempt` — QuizAttempt

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| commercial_id | varchar(36) | ID commercial |
| session_id | UUID | FK |
| attempt_number | tinyint | 1, 2, 3… |
| question_order | json | Ordre aléatoire (Fisher-Yates) |
| started_at | datetime | Début tentative |
| expires_at | datetime | Heure limite (null si pas de timer) |
| completed_at | datetime | Soumission (null = en cours) |
| timed_out | tinyint | Flag timeout global |
| score | decimal(5,2) | Score final (null = incomplet) |
| max_score | decimal(5,2) | Score total possible |
| is_passed | tinyint | null = incomplet, 0 = échoué, 1 = réussi |

**Index** : `(commercial_id, session_id, attempt_number)`

---

### 7. `quiz_answer_attempt` — QuizAnswerAttempt

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| attempt_id | UUID | FK (CASCADE) |
| question_id | UUID | FK |
| answer_id | UUID | FK réponse choisie (nullable = pas répondu) |
| is_correct | tinyint | Résultat |
| points_earned | decimal(5,2) | 0 ou question.points |
| answered_at | datetime | Heure réponse |
| timed_out | tinyint | Réponse sous timeout ? |

**Contrainte unique** : `(attempt_id, question_id)`

---

### 8. `quiz_exemption` — QuizExemption

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| scope | enum | `'commercial'` ou `'poste'` |
| commercial_id | varchar(36) | Si scope=commercial |
| poste_id | varchar(36) | Si scope=poste |
| reason | varchar(255) | Motif (ex: "Congés") |
| deleted_at | datetime | Soft-delete |

**Logique** : une exemption par poste couvre tous les commerciaux du poste. Vérifié dans `getTodaySession()` → bypass complet du quiz.

---

### 9. `quiz_pdf` — QuizPdf

| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| session_id | UUID | FK (SET NULL) — nullable |
| original_name | varchar(255) | Nom fichier d'origine |
| storage_path | varchar(500) | `uploads/quiz-pdfs/YYYY/MM/uuid-filename.pdf` |
| file_size | int | Taille en bytes |
| allow_inline_view | tinyint | Affichage iframe autorisé ? |
| is_permanent | tinyint | Permanent vs date-limité |
| available_from | date | Date début accès (nullable) |
| available_until | date | Date fin accès (nullable) |
| deleted_at | datetime | Soft-delete |

**Logique d'accès commercial** :
- Lié à session → visible si `session.sessionDate ≤ TODAY`
- Permanent → toujours visible
- Temporaire → visible si `availableFrom ≤ TODAY ≤ availableUntil`

---

## IV. Services backend

### QuizAdminService (`quiz-admin.service.ts`)

Gestion des catégories, questions et résultats de session.

**Méthodes clés** :

```typescript
createCategory(dto) → QuizCategory
findAllCategories() → QuizCategory[]        // IsNull(deletedAt)
updateCategory(id, dto) → QuizCategory
removeCategory(id) → void                   // soft-delete

createQuestion(dto) → QuizQuestion          // transaction : question + réponses
  // Valide EXACTEMENT 1 réponse correcte
findAllQuestions(filters?) → QuizQuestion[] // filtres : categoryId, search, activeOnly
updateQuestion(id, dto) → QuizQuestion      // transaction
archiveQuestion(id) → void                  // soft-delete

getSessionResults(sessionId) → SessionResultEntry[]
  // Agrégation SQL : meilleur score par commercial
  // Jointure commerciaux/postes pour noms
```

---

### QuizSessionService (`quiz-session.service.ts`)

Gestion du cycle de vie des sessions.

```typescript
createSession(dto) → QuizSession            // vérifie unicité session_date
findAllSessions() → SessionWithCount[]      // charge count questions
findSessionByDate(date) → QuizSession|null
updateSession(id, dto) → QuizSession
removeSession(id) → void

duplicateSession(id, targetDates[]) → { created[], skipped[] }
  // Clone session + questions vers N dates
  // Gère doublons → skipped
```

---

### QuizAttemptService (`quiz-attempt.service.ts`)

Cycle de vie des tentatives commerciaux.

```typescript
getTodaySession(commercialId, posteId) → TodaySessionResponse
  // Cherche session du jour (is_active=1, session_date=TODAY)
  // Vérifie exemption
  // Charge tentatives du commercial
  // Retourne questions avec réponses (sans is_correct)

startAttempt(commercialId, sessionId) → StartAttemptResponse
  // Bloque si maxAttempts atteint ou déjà réussi
  // Génère questionOrder (Fisher-Yates shuffle)
  // Calcule expiresAt si totalTimeMinutes

submitAttempt(commercialId, attemptId, dto) → SubmitAttemptResponse
  // Marque completedAt = NOW()
  // Score chaque réponse (is_correct + points_earned)
  // Calcule score total
  // Détermine isPassed (score ≥ passingScore)

getAttemptResult(commercialId, attemptId) → AttemptResultResponse
  // Réponses détaillées : question, catégorie, réponse_choisie, réponse_correcte
  // Triées par ordre d'affichage

getHistory(commercialId) → HistoryEntry[]
  // Toutes tentatives complétées, DESC
```

**Algorithme de randomisation** : Fisher-Yates shuffle sur `questionIds[]` → stocké dans `question_order` (JSON).

---

### QuizExemptionService (`quiz-exemption.service.ts`)

```typescript
createExemption(dto) → QuizExemption
findAllExemptions() → ExemptionResult[]    // jointure noms commerciaux/postes
removeExemption(id) → void
isExempt(commercialId, posteId) → boolean  // vérifie commercial ET poste
```

---

### QuizPdfService (`quiz-pdf.service.ts`)

```typescript
uploadPdf(file, dto) → QuizPdfPublic
  // Sauvegarde : uploads/quiz-pdfs/YYYY/MM/uuid-filename.pdf
  // Valide MIME type (application/pdf)
  // Crée répertoire si absent

findAll() → QuizPdfPublic[]                // admin : tous les PDFs
findAccessibleForCommercial() → QuizPdfPublic[]
  // Filtre selon logique session + dates

streamPdf(id, inline, res) → void
  // Vérifie allowInlineView si inline=true
  // Content-Disposition : inline vs attachment
```

---

## V. Controllers backend

### QuizAdminController — Guards : `AdminGuard`

```
GET    /quiz/admin/categories
POST   /quiz/admin/categories
PATCH  /quiz/admin/categories/:id
DELETE /quiz/admin/categories/:id

GET    /quiz/admin/questions              ?categoryId= &search= &activeOnly=
POST   /quiz/admin/questions
PATCH  /quiz/admin/questions/:id
DELETE /quiz/admin/questions/:id

GET    /quiz/admin/sessions
POST   /quiz/admin/sessions
PATCH  /quiz/admin/sessions/:id
DELETE /quiz/admin/sessions/:id
POST   /quiz/admin/sessions/:id/duplicate
GET    /quiz/admin/sessions/:id/results

GET    /quiz/admin/exemptions
POST   /quiz/admin/exemptions
DELETE /quiz/admin/exemptions/:id

POST   /quiz/admin/pdfs                   (multipart/form-data)
POST   /quiz/admin/sessions/:id/pdf       (multipart/form-data)
GET    /quiz/admin/pdfs
PATCH  /quiz/admin/pdfs/:id
DELETE /quiz/admin/pdfs/:id
```

### QuizCommercialController — Guards : `AuthGuard('jwt')`

```
GET  /quiz/today
POST /quiz/today/start
POST /quiz/today/submit
GET  /quiz/today/result/:attemptId
GET  /quiz/history
GET  /quiz/pdfs
GET  /quiz/pdfs/:id/view
GET  /quiz/pdfs/:id/download
```

---

## VI. DTOs backend

### Création question

```typescript
interface CreateQuestionDto {
  categoryId: string;    // UUID
  text: string;
  points?: number;       // défaut 1
  timeLimitSeconds?: number;
  answers: {
    text: string;
    isCorrect: boolean;
    position?: number;
  }[];
}
```

### Création session

```typescript
interface CreateSessionDto {
  title: string;
  sessionDate: string;   // YYYY-MM-DD
  isActive?: boolean;
  passingScore?: number;
  maxAttempts?: number;  // 0 = illimité
  totalTimeMinutes?: number;
  questionIds: string[]; // UUIDs ordonnés
}
```

### Soumission tentative

```typescript
interface SubmitAttemptDto {
  answers: {
    questionId: string;
    answerId: string | null;  // null = pas répondu
    timedOut: boolean;
  }[];
  timedOut: boolean;          // flag timeout global
}
```

---

## VII. Frontend commercial (`front/src/app/quiz/`)

### `page.tsx` (~610 lignes)

**États principaux** :

| State | Type | Rôle |
|-------|------|------|
| `loadingInitial` | boolean | Chargement session du jour |
| `quizActive` | boolean | Quiz en cours |
| `attemptId` | string | ID tentative active |
| `questionOrder` | string[] | Ordre aléatoire reçu du serveur |
| `currentIndex` | number | Index question affichée |
| `answers` | Record<questionId, { answerId, timedOut }> | Réponses en cours |
| `globalSecondsLeft` | number | Timer global |
| `questionSecondsLeft` | number | Timer question |

**Deux timers simultanés** :

1. **Timer global** (`totalTimeMinutes`) :
   - Compte à rebours sur l'ensemble du quiz
   - Si `expiresAt` atteint → auto-submit avec `timedOut = true`
   - Alerte visuelle rouge si < 2 minutes restantes

2. **Timer question** (`timeLimitSeconds` par question) :
   - Auto-mark `timedOut = true` + passage question suivante
   - Indépendant du timer global

**Flux UX** :
1. Chargement → `GET /quiz/today` → écran "Commencer" ou état vide
2. Click "Commencer" → `POST /quiz/today/start` → reçoit `{ attemptId, questionOrder, expiresAt }`
3. Timers démarrent
4. Navigation prev/next entre questions
5. Sélection réponse → mise à jour state local
6. Dernière question → bouton "Soumettre" → `POST /quiz/today/submit`
7. Redirection `→ /quiz/result?attemptId=...`

**PdfDrawer** (sidebar) :
- Liste les PDFs accessibles
- Affichage inline (iframe) si `allowInlineView = true`
- Téléchargement direct sinon

---

### `result/page.tsx` (~265 lignes)

**Affichage** :
- Score numérique + pourcentage
- Badge "Réussi" (vert) / "Échoué" (rouge) / absent si `passingScore = null`
- Tableau détaillé par question :
  - Statut : Correct / Incorrect / Timeout (couleurs)
  - Points marqués vs points possibles
  - Réponse fournie vs réponse correcte
- Actions : Recommencer (si tentatives restantes) / Retour conversations

---

## VIII. Panel admin (`admin/src/app/ui/QuizView.tsx`)

**1 926 lignes** — 6 onglets fonctionnels.

### Onglet 1 — Catégories

- Formulaire : nom + color picker (hex)
- Tableau : nom, couleur (badge), actions édition/suppression
- Mode édition en ligne

### Onglet 2 — Questions

- Filtres : catégorie + recherche texte
- Formulaire imbriqué :
  - Catégorie (select)
  - Texte de la question
  - Points (input nombre)
  - Timer : toggle + presets (15 / 30 / 45 / 60 s) + valeur personnalisée
  - Réponses (2 à 5) : texte + radio "correcte" par réponse
  - Boutons ajouter/supprimer réponse (min 2, max 5)
- Validation frontend : 1 seule radio "correcte" sélectionnée
- Tableau : question, catégorie, points, timer, nb réponses, actions

### Onglet 3 — Sessions

- Sélecteur de date (calendrier) avec dates déjà utilisées grisées
- Formulaire session :
  - Titre
  - Date
  - Toggle actif/inactif
  - Toggle passing score + valeur
  - Select max_attempts (1 / 2 / 3 / Illimité)
  - Toggle time limit + minutes
  - Multi-select questions (filtrable par catégorie)
- Section "Dupliquer" : sélection de N dates cibles → clone session
- Tableau : titre, date, nb questions, statut, actions
- Bouton "Voir résultats" par session

### Onglet 4 — Documents

- Upload PDF (file input + métadonnées)
- Métadonnées : lien session, allowInlineView, isPermanent, dates accès
- Tableau : nom, taille, session liée, dates, actions

### Onglet 5 — Exemptions

- Formulaire : scope (commercial / poste), ID cible, motif
- Tableau : commercial ou poste concerné, motif, actions suppression

### Onglet 6 — Résultats

- Sélecteur session
- Tableau résultats : commercial, poste, # tentatives, meilleur score, verdict, date dernière tentative

---

## IX. Migration SQL

**Fichier** : `message_whatsapp/src/database/migrations/AddQuizSystem1749686400000.ts`

**Opérations** :
- Création des 9 tables avec colonnes, index, foreign keys
- Soft-delete sur : catégories, questions, sessions, exemptions, PDFs
- Contraintes UNIQUE : `session_date`, `(session_id, question_id)`, `(attempt_id, question_id)`
- Index sur `(commercial_id, session_id, attempt_number)` pour perfs tentatives
- `ON DELETE CASCADE` : quiz_answer, quiz_session_question, quiz_answer_attempt
- `ON DELETE SET NULL` : quiz_pdf.session_id

**Rollback** : DROP TABLE dans l'ordre inverse des FK.

---

## X. Règles métier résumées

| # | Règle | Niveau | Implémentation |
|---|-------|--------|----------------|
| 1 | 1 seule réponse correcte par question | Question | Validé dans QuizAdminService.createQuestion/updateQuestion |
| 2 | 1 session par date | Session | UNIQUE SQL sur `session_date` |
| 3 | Blocage si maxAttempts atteint | Tentative | Vérifié dans `startAttempt()` |
| 4 | Blocage après réussite | Tentative | `isPassed = true` → nouvelles tentatives refusées |
| 5 | Timer global auto-submit | Tentative | Frontend : `expiresAt` → setTimeout → POST submit |
| 6 | Timer question auto-next | Question | Frontend : `timeLimitSeconds` → auto-mark timedOut |
| 7 | Exemption par commercial | Admin | `isExempt(commercialId, posteId)` dans `getTodaySession()` |
| 8 | Exemption par poste | Admin | Idem — couvre tous les commerciaux du poste |
| 9 | PDF : accès temporel | PDF | `findAccessibleForCommercial()` filtre par dates |
| 10 | PDF : lié à session | PDF | Visible si `session.sessionDate ≤ TODAY` |
| 11 | Randomisation questions | Tentative | Fisher-Yates sur `questionIds[]` → stocké en JSON |
| 12 | Score affiché = meilleur score | Résultats | Agrégation SQL `MAX(score)` dans `getSessionResults()` |
| 13 | Soft-delete généralisé | Toutes entités | `deletedAt IS NULL` dans tous les `findAll` |

---

## XI. Flux complet — Exemple concret

```
[ J-1 — ADMIN ]
1. Crée catégorie "Ventes" (#4CAF50)
2. Crée 10 questions dans cette catégorie (2 à 5 réponses chacune)
3. Crée session "Formation Juin 2026"
   - sessionDate = 2026-06-20
   - passingScore = 7.00
   - maxAttempts = 2
   - totalTimeMinutes = 15
   - sélectionne 10 questions
4. Upload "guide-produits.pdf" (permanent, allowInlineView = true)
5. Session → active ✅

[ 2026-06-20 matin — COMMERCIAL A ]
1. Se connecte → /whatsapp → badge "Quiz disponible"
2. GET /quiz/today → sessionActive: true, isExempt: false
3. Écran : "Formation Juin 2026 — 10 questions — 15 min"
4. Click "Commencer"
   → POST /quiz/today/start
   → reçoit : { attemptId, expiresAt: "09:45:00", questionOrder: [Q5, Q2, Q8, ...] }
5. Timer 15 min démarre
6. Répond les 10 questions (ordre aléatoire)
7. Click "Soumettre"
   → POST /quiz/today/submit (answers[], timedOut: false)
   → Score : 8.5 / 10 — isPassed: true
8. Redirection /quiz/result
   → Affiche : "8.5/10 (85%) ✅ RÉUSSI"
   → Tableau : 8 correctes (vert), 2 incorrectes (rouge)

[ 2026-06-20 après-midi — COMMERCIAL B ]
1. GET /quiz/today → sessionActive: true, attemptsCount: 0
2. Tente quiz → Score : 5/10 — isPassed: false
3. Retour page quiz → "Vous pouvez retenter (1/2 tentatives)"
4. 2e tentative → Score : 7.5/10 — isPassed: true
5. Blocage tentatif après réussite

[ 2026-06-20 soir — ADMIN ]
Onglet Résultats → Session du 20/06 :
| Commercial A | Poste 1 | 1 tentative | 8.5/10 | ✅ RÉUSSI  | 09:44 |
| Commercial B | Poste 2 | 2 tentatives | 7.5/10 | ✅ RÉUSSI  | 16:32 |
| Commercial C | Poste 1 | 1 tentative | 4/10   | ❌ ÉCHOUÉ  | 10:15 |
```

---

## XII. Commits Git associés

| Commit | Message | Contenu |
|--------|---------|---------|
| `6402ef3` | "qcm termine" | État final livré |
| `193a71c` | "presque fini pour le quizz" | Finalisation UI |
| `d58ee4e` | "cqm envoie" | Soumission tentative |

---

## XIII. État d'avancement

### Complet ✅

- 9 entités TypeORM + migration déployée
- 5 services NestJS (admin, session, attempt, exemption, pdf)
- 2 controllers avec guards appropriés
- DTOs complets avec validation
- 2 pages frontend commercial (quiz + résultats)
- Panel admin 6 onglets (catégories, questions, sessions, documents, exemptions, résultats)
- Timers double niveau (global + question)
- PDF management (upload, accès, streaming inline/download)
- Exemptions par commercial et par poste
- Randomisation Fisher-Yates des questions
- Scoring automatique avec verdict réussi/échoué
- Résultats agrégés (meilleur score, nb tentatives) dans admin

### Non implémenté (axes d'extension possibles)

- Notifications push "quiz disponible" ce matin
- Export CSV / PDF des résultats
- Statistiques par catégorie (taux réussite par thème)
- Courbe d'apprentissage (évolution des scores dans le temps)
- Questions multi-choix (plusieurs bonnes réponses)
- Feedback immédiat après chaque question
- Génération de certificats PDF après réussite
- Pool de questions aléatoires (au lieu de sessions fixes)

---

## XIV. Points d'attention techniques

1. **Transactions** : création question (question + réponses) et mise à jour session (session + questions) sont encapsulées dans des transactions TypeORM — intégrité garantie.

2. **Sécurité** : les réponses correctes (`is_correct`) ne sont **pas exposées** dans `GET /quiz/today` — uniquement retournées dans `GET /quiz/today/result/:attemptId` après soumission.

3. **Timing serveur** : `expiresAt` est calculé côté serveur (pas côté client) pour éviter la manipulation. Le client affiche un compte à rebours local mais le serveur vérifie `completed_at ≤ expires_at` à la soumission.

4. **Soft-delete** : toutes les entités sensibles utilisent `deletedAt`. Les questions archivées ne sont plus proposables dans de nouvelles sessions mais les tentatives historiques restent cohérentes (FK non cascadée sur quiz_answer_attempt).

5. **Zéro N+1** : `getSessionResults()` utilise une agrégation SQL unique (GROUP BY + MAX) plutôt qu'une boucle sur les tentatives.

---

## XV. Bugs identifiés — Analyse approfondie

### Tableau de synthèse

| # | Sévérité | Fichier | Description |
|---|----------|---------|-------------|
| 1 | 🔴 Bloquant | `quiz-attempt.service.ts:229` | Timer global : grâce 60s backend non synchronisée frontend |
| 2 | 🔴 Bloquant | `quiz-attempt.service.ts:166` | Race condition double-start tentative |
| 3 | 🔴 Bloquant | `quiz-session.service.ts:65` | `findSessionByDate()` ignore le soft-delete |
| 4 | 🔴 Bloquant | `quiz-attempt.service.ts:315` | `questionOrder` null → crash TypeError |
| 5 | 🟠 Majeur | `result/page.tsx:166` + `quiz-attempt.service.ts:332` | `correctAnswer` peut être null → crash affichage résultats |
| 6 | 🟠 Majeur | `quiz-commercial.controller.ts:9` | DTOs soumission non validés (aucun pipe NestJS actif) |
| 7 | 🟠 Majeur | `quiz-attempt.service.ts:248` | Questions soumises non vérifiées contre la session |
| 8 | 🟡 Mineur | `quiz-attempt.service.ts:185` | `maxAttempts = 0` sémantique confuse |
| 9 | 🟡 Mineur | `quiz-attempt.service.ts:101` | Timezone serveur/client non synchronisé sur `sessionDate` |
| 10 | 🟡 Mineur | `quiz/page.tsx:276` | Timer question : closure sur `currentQ.id` marque mauvaise question |
| 11 | 🟡 Mineur | `quiz-attempt.service.ts:131` | `bestScore = 0` quand toutes les tentatives ont `score = null` |
| 12 | 🟡 Mineur | `result/page.tsx:90` | `isPassed = null` → aucun badge affiché (UX vide) |
| 13 | 🔵 Sécurité | `quiz-commercial.controller.ts:31` | Pas de rate-limiting sur `/quiz/today/start` |
| 14 | 🔵 Sécurité | `quiz-pdf.service.ts:110` | PDFs accessibles sans vérification de rôle/session |

---

### BUG #1 — Timer global : désynchronisation 60s backend/frontend
**Sévérité** : 🔴 Bloquant
**Fichiers** :
- `message_whatsapp/src/quiz/quiz-attempt.service.ts:229`
- `front/src/app/quiz/page.tsx:240`

**Description** : Le backend rejette les soumissions tardives avec `expiresAt + 60_000 ms` de grâce (60 secondes). Le frontend, lui, soumet dès que le compteur atteint 0. Si la soumission arrive entre 0s et 60s après `expiresAt`, le backend l'accepte. Mais au-delà, il renvoie `403 ForbiddenException("Délai dépassé")` et le frontend n'affiche rien.

```typescript
// Backend — quiz-attempt.service.ts:229
if (attempt.expiresAt !== null && Date.now() > attempt.expiresAt.getTime() + 60_000) {
  throw new ForbiddenException('Délai dépassé');
}

// Frontend — page.tsx:240
if (remaining <= 0) {
  setGlobalSecondsLeft(0);
  handleSubmit(true); // Peut arriver hors fenêtre si latence réseau élevée
}
```

**Impact** : Le commercial voit son timer à 0, clique "Soumettre" ou l'auto-submit se déclenche, et reçoit une erreur silencieuse sans message d'explication.

**Correction suggérée** : Soumettre automatiquement 3 secondes avant `expiresAt` plutôt qu'à 0, ou réduire la grâce backend à 10s (juste pour la latence réseau).

---

### BUG #2 — Race condition dans `startAttempt()`
**Sévérité** : 🔴 Bloquant
**Fichier** : `message_whatsapp/src/quiz/quiz-attempt.service.ts:166-206`

**Description** : La vérification "tentative existante en cours" et la création de la nouvelle tentative ne sont pas dans une transaction atomique. Un double-clic sur "Commencer" peut passer les deux vérifications avant que l'une des deux insère en base.

```typescript
// Ligne 170 — lecture
const existing = await this.attemptRepo.findOne({
  where: { commercialId, sessionId, completedAt: IsNull() },
});
if (existing) { return ...; }

// [gap non-transactionnel]

// Ligne 206 — écriture
const saved = await this.attemptRepo.save(attempt);
```

**Impact** : Deux tentatives actives simultanées pour un même commercial sur la même session. Le commercial peut soumettre deux fois et obtenir deux scores différents.

**Correction suggérée** : Envelopper lignes 170–206 dans `this.dataSource.transaction(...)` ou ajouter un index UNIQUE sur `(commercial_id, session_id)` WHERE `completed_at IS NULL`.

---

### BUG #3 — `findSessionByDate()` ignore le soft-delete
**Sévérité** : 🔴 Bloquant
**Fichier** : `message_whatsapp/src/quiz/quiz-session.service.ts:65-71`

**Description** : La méthode utilisée pour détecter la session du jour ne filtre pas `deletedAt IS NULL`. Une session supprimée (soft-delete) pour la date du jour reste détectable et affichée aux commerciaux.

```typescript
async findSessionByDate(date: string): Promise<QuizSession | null> {
  return this.sessionRepo
    .createQueryBuilder('session')
    .where('session.sessionDate = :date', { date })
    .andWhere('session.isActive = 1')
    // ❌ Filtre deletedAt manquant
    .getOne();
}
```

**Impact** : Un admin supprime une session → le commercial voit quand même le quiz → peut démarrer une tentative sur une session censée ne plus exister.

**Correction suggérée** :
```typescript
.andWhere('session.deletedAt IS NULL')
```

---

### BUG #4 — Crash si `questionOrder` est null en base
**Sévérité** : 🔴 Bloquant
**Fichier** : `message_whatsapp/src/quiz/quiz-attempt.service.ts:315`

**Description** : L'entité déclare `questionOrder: string[]` (non nullable) mais la colonne MySQL `json` peut contenir `NULL`. Si la donnée est corrompue ou issue d'une migration incomplète, l'accès `.map()` sur `null` lance un `TypeError`.

```typescript
// Ligne 315
const orderMap = new Map(attempt.questionOrder.map((id, idx) => [id, idx]));
//                                              ^^^^ crash si null
```

**Impact** : La page de résultats crashe en 500 pour toute tentative dont `question_order` est NULL.

**Correction suggérée** :
```typescript
const orderMap = new Map((attempt.questionOrder ?? []).map((id, idx) => [id, idx]));
```
Et corriger le type entité : `questionOrder: string[] | null`.

---

### BUG #5 — `correctAnswer` nullable → crash page résultats
**Sévérité** : 🟠 Majeur
**Fichiers** :
- `message_whatsapp/src/quiz/quiz-attempt.service.ts:332`
- `front/src/app/quiz/result/page.tsx:166`

**Description** : Le backend retourne `correctAnswer: null` si aucune réponse marquée `isCorrect` n'est trouvée (question corrompue ou archivée). Le frontend accède directement à `.text` sans garde-fou.

```typescript
// Backend
correctAnswer: correctAnswer ? { text: correctAnswer.text } : null,

// Frontend — result/page.tsx:166
{q.correctAnswer.text}  // ❌ crash si null
```

**Impact** : La page `/quiz/result` plante avec un `TypeError: Cannot read properties of null` pour toute question sans bonne réponse définie.

**Correction suggérée** :
```typescript
{q.correctAnswer?.text ?? '—'}
```

---

### BUG #6 — DTOs soumission non validés (aucun pipe NestJS actif)
**Sévérité** : 🟠 Majeur
**Fichier** : `message_whatsapp/src/quiz/quiz-commercial.controller.ts:9-15`

**Description** : Le contrôleur définit une classe `SubmitBody` avec des décorateurs `class-validator`, mais aucun `ValidationPipe` global ni local n'est déclaré sur ce contrôleur. Les données reçues ne sont jamais validées.

**Impact** : N'importe quel payload malformé (answerId non-UUID, answers non-tableau, timedOut non-booléen) est passé directement au service sans contrôle, risquant une corruption de données ou une injection.

**Correction suggérée** : Activer le `ValidationPipe` global dans `main.ts` ou ajouter `@UsePipes(new ValidationPipe({ whitelist: true }))` sur ce controller.

---

### BUG #7 — Réponses soumises non vérifiées contre la session
**Sévérité** : 🟠 Majeur
**Fichier** : `message_whatsapp/src/quiz/quiz-attempt.service.ts:248-273`

**Description** : Lors du calcul du score, le service ne valide pas que les `questionId` reçus dans la soumission appartiennent réellement à la session en cours. Un attaquant peut soumettre des réponses à des questions d'une autre session.

```typescript
const questionMap = new Map(questions.map((q) => [q.id, q]));
for (const submitted of dto.answers) {
  const question = questionMap.get(submitted.questionId);
  if (!question) continue;  // Skip silencieux — pas d'erreur
}
```

**Impact** : Manipulation du score en soumettant des IDs de questions dont les réponses sont connues mais qui n'appartiennent pas à la session active.

**Correction suggérée** : Construire le `Set` des `questionIds` valides depuis la session et rejeter tout ID absent avec `ForbiddenException`.

---

### BUG #8 — `maxAttempts = 0` : sémantique ambiguë
**Sévérité** : 🟡 Mineur
**Fichier** : `message_whatsapp/src/quiz/quiz-attempt.service.ts:185`

**Description** : La convention `maxAttempts = 0` signifie "illimité" dans le code (`!== 0`), mais le DTO accepte `@Min(0)`. Un admin peut saisir `0` en pensant "aucune tentative autorisée" alors que le comportement réel est l'inverse.

**Correction suggérée** : Changer `@Min(0)` en `@Min(1)` et ajouter un champ booléen `isUnlimited` distinct, ou documenter clairement la convention `0 = illimité` dans l'interface admin.

---

### BUG #9 — Désynchronisation timezone `sessionDate`
**Sévérité** : 🟡 Mineur
**Fichier** : `message_whatsapp/src/quiz/quiz-attempt.service.ts:101`

**Description** : La détection de la session du jour utilise `CURDATE()` côté serveur MySQL. Si le serveur est en UTC et le client en heure locale (ex: Paris UTC+2), un commercial peut se connecter à 23h30 heure Paris et voir la session du lendemain (01h30 UTC).

**Correction suggérée** : Passer la date client en paramètre (`?date=2026-06-16`) plutôt que de calculer `CURDATE()` côté serveur.

---

### BUG #10 — Timer question : closure stale sur `currentQ.id`
**Sévérité** : 🟡 Mineur
**Fichier** : `front/src/app/quiz/page.tsx:276-290`

**Description** : Le timer par question utilise `currentQ.id` via closure. Si l'utilisateur navigue manuellement vers une autre question avant l'expiration du timer, la closure pointe encore sur l'ancienne question et marque la mauvaise comme `timedOut`.

**Scénario** :
1. Q1 (timer 30s) démarre
2. Utilisateur navigue manuellement vers Q2 après 5s
3. 25s plus tard, Q1 expire mais le code marque Q2 (index courant) comme timedOut

**Correction suggérée** : Capturer l'ID dans une variable locale au démarrage de l'`useEffect` et ne pas dépendre de `currentQ` mutable via closure.

---

### BUG #11 — `bestScore = 0` trompeur si toutes tentatives incomplètes
**Sévérité** : 🟡 Mineur
**Fichier** : `message_whatsapp/src/quiz/quiz-attempt.service.ts:131-134`

**Description** : Si toutes les tentatives complétées ont `score = null` (cas de données corrompues), `Math.max(0, 0, ...) = 0`. Le frontend affiche "Meilleur score : 0" au lieu de "—".

**Correction suggérée** : Filtrer explicitement les tentatives avec `score !== null` avant d'appeler `Math.max`.

---

### BUG #12 — Aucun badge si `isPassed = null`
**Sévérité** : 🟡 Mineur
**Fichier** : `front/src/app/quiz/result/page.tsx:90-106`

**Description** : Quand `passingScore = null` (session sans seuil de réussite), le backend retourne `isPassed = null`. Le frontend n'affiche rien dans la zone "verdict", laissant un espace vide sans explication.

**Correction suggérée** : Ajouter un cas `isPassed === null` qui affiche "Score enregistré" ou "Non noté" en gris.

---

### BUG #13 — Pas de rate-limiting sur `/quiz/today/start`
**Sévérité** : 🔵 Sécurité
**Fichier** : `message_whatsapp/src/quiz/quiz-commercial.controller.ts:31`

**Description** : Aucun décorateur `@Throttle()` sur l'endpoint de démarrage de tentative. Un attaquant authentifié peut déclencher des centaines de requêtes par seconde, saturant la base de données.

**Correction suggérée** :
```typescript
@Post('today/start')
@Throttle({ default: { limit: 5, ttl: 3600 } })
startAttempt(...) { }
```

---

### BUG #14 — PDFs streamés sans vérification de rôle/session
**Sévérité** : 🔵 Sécurité
**Fichier** : `message_whatsapp/src/quiz/quiz-pdf.service.ts:110-132`

**Description** : `streamPdf()` récupère le PDF et le streame si l'ID est valide, sans vérifier si l'utilisateur a accès à la session liée, ni si le PDF est encore dans sa fenêtre temporelle (`availableFrom` / `availableUntil`). La vérification temporelle est uniquement faite dans `findAccessibleForCommercial()` (liste), pas dans `streamPdf()` (accès direct par ID).

**Impact** : Un commercial peut télécharger directement un PDF dont la fenêtre d'accès est dépassée en connaissant son UUID.

**Correction suggérée** : Appeler `findAccessibleForCommercial()` puis filtrer sur l'ID dans `viewPdf()` / `downloadPdf()`, ou dupliquer la logique de vérification temporelle dans `streamPdf()`.
