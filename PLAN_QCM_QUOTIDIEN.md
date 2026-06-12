# Plan d'implémentation — Système QCM quotidien configurable

> Date : 2026-06-12  
> Statut : PLAN — non implémenté  
> Périmètre : Backend NestJS + Admin Next.js + Front commercial Next.js

---

## Vue d'ensemble

Système de questionnaire à choix multiples (QCM) quotidien obligatoire pour les commerciaux.
L'admin configure les questions, compose les sessions et peut les programmer à l'avance (sessions
futures ou planning hebdomadaire récurrent). Chaque question peut avoir un timer individuel et le
quiz entier peut avoir une durée maximale. Les commerciaux doivent passer le quiz chaque matin
avant d'accéder à la page de chat.

---

## Schéma de données

### `quiz_category` — Thématiques de questions
```sql
id            UUID PK
name          VARCHAR(100) NOT NULL
color         VARCHAR(7)   NULL
created_at    DATETIME
deleted_at    DATETIME NULL
```

### `quiz_question` — Banque de questions
```sql
id                    UUID PK
category_id           UUID FK → quiz_category.id
text                  TEXT NOT NULL
points                DECIMAL(5,2) NOT NULL DEFAULT 1.00
time_limit_seconds    INT NULL
  -- NULL = pas de limite par question
  -- si défini : à l'expiration du timer, passage automatique à la question suivante
  -- la question reste sans réponse → 0 point
created_by            UUID FK → whatsapp_commercial.id NULL
is_active             TINYINT(1) DEFAULT 1
created_at            DATETIME
updated_at            DATETIME
deleted_at            DATETIME NULL
```

### `quiz_answer` — Réponses possibles (2 à 5)
```sql
id            UUID PK
question_id   UUID FK → quiz_question.id ON DELETE CASCADE
text          TEXT NOT NULL
is_correct    TINYINT(1) NOT NULL DEFAULT 0
position      TINYINT NOT NULL DEFAULT 0
created_at    DATETIME
```
**Contrainte** : exactement 1 `is_correct = 1` par question (validée en service).

### `quiz_session` — Questionnaire pour une date
```sql
id                    UUID PK
title                 VARCHAR(200) NOT NULL
session_date          DATE NOT NULL UNIQUE
  -- mécanisme central : si session_date = aujourd'hui → c'est le quiz du jour
  -- l'admin peut créer des sessions pour des dates futures à l'avance
is_active             TINYINT(1) DEFAULT 1
passing_score         DECIMAL(5,2) NULL
  -- NULL = aucun seuil requis, toute soumission débloque le chat
  -- si défini : la meilleure tentative doit atteindre ce score
max_attempts          TINYINT NOT NULL DEFAULT 1
  -- 0 = illimité
total_time_minutes    INT NULL
  -- NULL = pas de limite globale
  -- si défini : timer décompte depuis started_at; à 0 → soumission automatique
created_at            DATETIME
updated_at            DATETIME
```
**Règle de sélection** : `SELECT * FROM quiz_session WHERE session_date = CURDATE() AND is_active = 1 LIMIT 1`.

### `quiz_session_question` — Questions d'une session
```sql
id            UUID PK
session_id    UUID FK → quiz_session.id ON DELETE CASCADE
question_id   UUID FK → quiz_question.id
position      SMALLINT NOT NULL DEFAULT 0
```
**Index unique** : `(session_id, question_id)`.

### `quiz_pdf` — Documents PDF
```sql
id                UUID PK
session_id        UUID FK → quiz_session.id ON DELETE SET NULL NULL
original_name     VARCHAR(255) NOT NULL
storage_path      VARCHAR(500) NOT NULL
file_size         INT NOT NULL
allow_inline_view TINYINT(1) NOT NULL DEFAULT 0
  -- 0 = téléchargement forcé (Content-Disposition: attachment)
  -- 1 = ouverture dans le navigateur (Content-Disposition: inline)
  --     le frontend peut aussi afficher un viewer intégré (iframe / PDF.js)
is_permanent      TINYINT(1) NOT NULL DEFAULT 1
available_from    DATE NULL
available_until   DATE NULL
uploaded_at       DATETIME
deleted_at        DATETIME NULL
```

### `quiz_exemption` — Exemptions par poste ou commercial
```sql
id              UUID PK
scope           ENUM('commercial', 'poste') NOT NULL
commercial_id   UUID FK → whatsapp_commercial.id NULL
poste_id        UUID FK → whatsapp_poste.id NULL
reason          VARCHAR(255) NULL
created_at      DATETIME
deleted_at      DATETIME NULL
```

### `quiz_attempt` — Tentative d'un commercial
```sql
id                 UUID PK
commercial_id      UUID FK → whatsapp_commercial.id
session_id         UUID FK → quiz_session.id
attempt_number     TINYINT NOT NULL DEFAULT 1
question_order     JSON NOT NULL
started_at         DATETIME
expires_at         DATETIME NULL
  -- = started_at + total_time_minutes si session.total_time_minutes IS NOT NULL
  -- le backend refuse toute soumission après expires_at
completed_at       DATETIME NULL
timed_out          TINYINT(1) NOT NULL DEFAULT 0
  -- 1 si soumission déclenchée par expiration du timer global
score              DECIMAL(5,2) NULL
max_score          DECIMAL(5,2) NULL
is_passed          TINYINT(1) NULL
```
**Index** : `(commercial_id, session_id, attempt_number)`.

### `quiz_answer_attempt` — Réponses soumises
```sql
id              UUID PK
attempt_id      UUID FK → quiz_attempt.id ON DELETE CASCADE
question_id     UUID FK → quiz_question.id
answer_id       UUID FK → quiz_answer.id NULL
  -- NULL si la question est restée sans réponse (timer question expiré)
is_correct      TINYINT(1) NOT NULL DEFAULT 0
points_earned   DECIMAL(5,2) NOT NULL DEFAULT 0.00
answered_at     DATETIME NULL
timed_out       TINYINT(1) NOT NULL DEFAULT 0
  -- 1 si réponse omise car timer question expiré
```
**Index unique** : `(attempt_id, question_id)`.

---

## Architecture backend (`message_whatsapp/src/quiz/`)

```
src/quiz/
  quiz.module.ts
  entities/
    quiz-category.entity.ts
    quiz-question.entity.ts
    quiz-answer.entity.ts
    quiz-session.entity.ts
    quiz-session-question.entity.ts
    quiz-pdf.entity.ts
    quiz-exemption.entity.ts
    quiz-attempt.entity.ts
    quiz-answer-attempt.entity.ts
  dto/
    create-category.dto.ts
    create-question.dto.ts
    create-session.dto.ts
    duplicate-session.dto.ts    -- { sourceSesionId, targetDates: Date[] }
    submit-attempt.dto.ts
    session-for-commercial.dto.ts
    session-result.dto.ts
    create-exemption.dto.ts
    create-pdf.dto.ts
  quiz-admin.service.ts
  quiz-session.service.ts
  quiz-attempt.service.ts
  quiz-pdf.service.ts
  quiz-exemption.service.ts
  quiz-admin.controller.ts
  quiz-commercial.controller.ts
  quiz-guard.ts
```

### Endpoints admin `[AdminGuard]`

| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/quiz/admin/categories` | CRUD catégories |
| PATCH/DELETE | `/quiz/admin/categories/:id` | Modifier / supprimer |
| GET/POST | `/quiz/admin/questions` | Banque + créer question |
| PATCH/DELETE | `/quiz/admin/questions/:id` | Modifier / archiver |
| GET/POST | `/quiz/admin/sessions` | Liste + créer session (date unique) |
| PATCH/DELETE | `/quiz/admin/sessions/:id` | Modifier / supprimer |
| POST | `/quiz/admin/sessions/:id/duplicate` | Dupliquer vers une ou plusieurs dates futures |
| POST | `/quiz/admin/sessions/:id/pdf` | Attacher PDF |
| DELETE | `/quiz/admin/sessions/:id/pdf/:pdfId` | Détacher PDF |
| GET | `/quiz/admin/sessions/:id/results` | Résultats par commercial |
| GET/POST | `/quiz/admin/pdfs` | PDFs globaux |
| PATCH | `/quiz/admin/pdfs/:id` | Modifier (inline_view, dates) |
| DELETE | `/quiz/admin/pdfs/:id` | Soft-delete |
| GET/POST | `/quiz/admin/exemptions` | Liste + créer exemption |
| DELETE | `/quiz/admin/exemptions/:id` | Retirer exemption |

### Endpoints commercial `[AuthGuard('jwt')]`

| Méthode | Route | Description |
|---|---|---|
| GET | `/quiz/today` | Session + état + is_exempt + expires_at |
| POST | `/quiz/today/start` | Démarre / reprend tentative |
| POST | `/quiz/today/submit` | Soumet réponses (avec timed_out) |
| GET | `/quiz/today/result` | Score + correction |
| GET | `/quiz/history` | Historique sessions + meilleures notes |
| GET | `/quiz/pdfs` | PDFs accessibles aujourd'hui |
| GET | `/quiz/pdfs/:id/download` | Télécharge (Content-Disposition: attachment) |
| GET | `/quiz/pdfs/:id/view` | Ouvre inline si allow_inline_view=1, sinon 403 |

---

## Logique métier clé

### Programmation à l'avance

**Principe** : `session_date = aujourd'hui` → quiz actif. Toute session dont la date est dans le futur
est ignorée jusqu'à son jour. L'admin peut créer des sessions pour n'importe quelle date future à tout
moment.

**Création individuelle** : l'admin crée une session avec une `session_date` future.

**Duplication en masse** (`POST /quiz/admin/sessions/:id/duplicate`) :
```
body: { targetDates: ["2026-06-16", "2026-06-17", "2026-06-23", "2026-06-30"] }

Pour chaque date dans targetDates :
  Si quiz_session(session_date = date) existe déjà → ignorer (ne pas écraser)
  Sinon :
    créer quiz_session avec les mêmes paramètres (title, passing_score, max_attempts, total_time_minutes)
    copier quiz_session_question → nouvelle session
    (les PDF attachés NE sont PAS copiés — l'admin les rattache manuellement si besoin)

Retourner : { created: ["2026-06-16", "2026-06-17"], skipped: ["2026-06-23"] }
```

L'admin sélectionne les dates dans un date-picker multi-sélection côté admin. Chaque session créée
est ensuite **indépendante** — modifier la source n'affecte pas les copies.

### Timers — règles

**Timer par question** (`time_limit_seconds`) :
- Géré **côté frontend** uniquement (UX)
- À l'expiration : passage automatique à la question suivante, `answer_id = null`
- Côté backend : si une `quiz_answer_attempt` a `answer_id = null`, `timed_out = 1`, `points_earned = 0`
- Pas de vérification backend possible sans WebSocket — la confiance est acceptée

**Timer global** (`total_time_minutes`) :
- `expires_at = started_at + total_time_minutes` calculé et stocké à la création de la tentative
- Retourné dans `GET /quiz/today` et `POST /quiz/today/start`
- Frontend démarre un décompte et soumet automatiquement à l'expiration avec `timed_out: true`
- Backend : au `POST /quiz/today/submit`, si `NOW() > expires_at` → accepter la soumission
  mais marquer `quiz_attempt.timed_out = 1` (pas de refus — le commercial ne doit pas être bloqué
  pour une latence réseau)
- Si le commercial tente de soumettre plus de 60s après `expires_at` → 403 (triche manifeste)

### Score de passage (optionnel)

```
session.passing_score = NULL
  → toute soumission débloque l'accès au chat, quel que soit le score
  → is_passed = NULL (notion sans sens — ne pas afficher "Réussi/Échoué")

session.passing_score = 12.00
  → is_passed = (score >= 12.00)
  → si is_passed = false ET tentatives restantes → proposer de recommencer
  → si is_passed = false ET plus de tentatives → accès débloqué quand même
    (le commercial ne doit pas être bloqué indéfiniment)
    mais son score "Échoué" est visible dans les résultats admin
```

### Visualisation PDF en ligne

```
GET /quiz/pdfs/:id/view

Si pdf.allow_inline_view = 0 → 403 { message: "Ce document ne peut pas être visualisé en ligne" }
Si pdf.allow_inline_view = 1 :
  → Content-Type: application/pdf
  → Content-Disposition: inline; filename="..."
  → stream du fichier

GET /quiz/pdfs/:id/download
  → Content-Disposition: attachment; filename="..." (toujours)
```

Frontend : si `allow_inline_view = true`, afficher un bouton "Voir" qui ouvre un viewer intégré
(iframe ou composant PDF.js) + un bouton "Télécharger". Si `allow_inline_view = false`, uniquement
le bouton "Télécharger".

### Vérification exemption

```
1. quiz_exemption WHERE scope='commercial' AND commercial_id = :id AND deleted_at IS NULL
2. quiz_exemption WHERE scope='poste' AND poste_id = commercial.poste_id AND deleted_at IS NULL
→ is_exempt = true si l'une existe
```

### Règle "quiz obligatoire" (guard + middleware)

```
1. Session active aujourd'hui ?        → non → passer
2. Commercial exempté ?                → oui → passer
3. Tentative complète ?
   - passing_score IS NULL             → toute tentative complète → passer
   - passing_score IS NOT NULL         → meilleure tentative >= passing_score → passer
   - passing_score IS NOT NULL
     ET plus de tentatives disponibles → passer quand même (jamais de blocage définitif)
4. Sinon → /quiz
```

### Accessibilité des PDF

```sql
WHERE deleted_at IS NULL AND (
  session_id IN (SELECT id FROM quiz_session WHERE session_date <= CURDATE())
  OR (session_id IS NULL AND is_permanent = 1)
  OR (
    session_id IS NULL AND is_permanent = 0
    AND (available_from IS NULL OR available_from <= CURDATE())
    AND (available_until IS NULL OR available_until >= CURDATE())
  )
)
```

---

## Frontend admin

### Onglets `QuizView.tsx`
```
[ Catégories ] [ Questions ] [ Sessions ] [ Documents ] [ Exemptions ] [ Résultats ]
```

**Sessions** :
- Vue **calendrier mensuel** : cases colorées pour les sessions planifiées (vert = actif, gris = inactif)
- Cases vides = dates sans quiz → clic pour créer rapidement une session
- Champs par session : titre, date, `is_active`, `passing_score` (toggle + champ),
  `max_attempts`, `total_time_minutes` (toggle + champ)
- Bouton **"Dupliquer vers d'autres dates"** → date-picker multi-sélection, aperçu des
  dates qui seraient créées vs ignorées (déjà occupées), puis confirmation

**Questions** :
- Champ `time_limit_seconds` : toggle "Activer le timer" + sélecteur (15s / 30s / 45s / 60s / personnalisé)

**Documents PDF** :
- Colonnes : Nom | Lié à | Vue en ligne | Accessibilité | Du | Au | Actions
- Toggle "Autoriser la vue en ligne" → `allow_inline_view`
- Toggle "Permanent / Fenêtre de dates"

---

## Frontend commercial

### Page Quiz `/quiz`
```
┌──────────────────────────────────────────────────────────────────┐
│  Quiz du jour — [titre]          ⏱ 18:42 restantes  [📄 Docs]  │
│  Tentative 1/2 · Question 4/10 ── [████████░░░░░░░░░░░░░░░░░]  │
├──────────────────────────────────────────────────────────────────┤
│  [Badge catégorie]      ⏱ 0:28 (timer question si défini)       │
│                                                                  │
│  Texte de la question ?                                          │
│                                                                  │
│  ○ Réponse A                                                     │
│  ● Réponse B   ← sélectionnée                                    │
│  ○ Réponse C                                                     │
│                                                                  │
│              [← Précédent]              [Suivant →]              │
│                         [Soumettre le quiz]                      │
└──────────────────────────────────────────────────────────────────┘
```

**Timers** :
- Timer global : affiché en haut à droite, rouge sous 2 minutes. À 0 → soumission automatique
- Timer question : affiché sous le badge catégorie, barre de progression qui se vide.
  À 0 → animation "temps écoulé" + passage automatique à la question suivante
- Les deux timers sont désactivés si non configurés (pas d'affichage)

**Viewer PDF** :
- Bouton "Voir" → drawer latéral ou modale avec iframe (si `allow_inline_view = true`)
- Bouton "Télécharger" → toujours présent

### Page de résultat
```
┌──────────────────────────────────────────────────┐
│  Tentative 2 — Score : 16 / 20  (80%)           │
│  ✓ Réussi                                       │
│  (Tentative 1 : 11/20 — Échoué)                │
│                                                  │
│  Q1 ✓ 2pts · Q2 ✗ 0pts · Q3 ⏱ 0pts (expiré)  │
│                                                  │
│  [Accéder aux conversations →]                  │
└──────────────────────────────────────────────────┘
```
- Badge ⏱ sur les questions expirées par timer
- Si `passing_score IS NULL` : pas de mention "Réussi/Échoué", juste le score

---

## Middleware Next.js — Blocage

```typescript
const mustTakeQuiz =
  data.sessionActive &&
  !data.isExempt &&
  !data.attemptCompleted;  // inclut la logique passing_score côté backend
```

---

## Migration

Nom : `AddQuizSystem<timestamp13chiffres>`

Tables (ordre FK) :
1. `quiz_category`
2. `quiz_question`
3. `quiz_answer`
4. `quiz_session`
5. `quiz_session_question`
6. `quiz_pdf`
7. `quiz_exemption`
8. `quiz_attempt`
9. `quiz_answer_attempt`

---

## Sprints d'implémentation

### Sprint 1 — Socle backend
- Migration + entités + module
- CRUD catégories, questions (avec `time_limit_seconds`), réponses
- CRUD sessions (avec `passing_score`, `max_attempts`, `total_time_minutes`)
- Service exemptions

### Sprint 2 — Programmation à l'avance
- Vue calendrier mensuel admin (sessions planifiées)
- `POST /quiz/admin/sessions/:id/duplicate` — duplication vers dates multiples
- Date-picker multi-sélection + aperçu avant confirmation

### Sprint 3 — Parcours commercial
- `GET /quiz/today` (is_exempt, expires_at, timers par question)
- `POST /quiz/start` (calcul expires_at)
- `POST /quiz/submit` (validation expires_at, timed_out)
- Guard + middleware Next.js

### Sprint 4 — PDF
- Upload, stockage, `allow_inline_view`
- Endpoints `/view` (inline) et `/download` (attachment)
- Fenêtres de disponibilité

### Sprint 5 — UI admin
- `QuizView.tsx` : tous les onglets
- Interface planning hebdo + bouton "Générer"
- Gestion exemptions et PDF avec toggles

### Sprint 6 — UI commercial
- Page `/quiz` avec timers (question + global)
- Viewer PDF intégré
- Badge score header + modale correction

---

## Points de stabilité

| Risque | Mitigation |
|---|---|
| Timer global contourné côté client | `expires_at` stocké en DB — vérification backend à la soumission |
| Soumission 60s+ après expiration | 403 si `NOW() > expires_at + 60s` |
| Timer question contournable | Confiance frontend acceptée — le timer question est UX, pas sécurité |
| Génération de sessions en double | `session_date UNIQUE` → INSERT échoue → la session existante est préservée |
| Score bloquant définitivement | Jamais : si tentatives épuisées, accès débloqué malgré échec |
| PDF inline hors autorisation | Endpoint `/view` vérifie `allow_inline_view` avant de servir |
| Exemption sur changement de poste | Réévaluée à chaque appel `/quiz/today` |
| Duplication sur date déjà occupée | `session_date UNIQUE` → skipped retourné, session existante préservée |
| Duplication de masse partielle | Résultat détaillé `{ created, skipped }` — l'admin voit exactement ce qui a été créé |
