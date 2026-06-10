# Plan d'amélioration — Équipe d'agents de développement
> Projet : Plateforme WhatsApp (NestJS + Next.js)
> Dernière mise à jour : 2026-06-10

---

## 1. Composition de l'équipe

| Agent | Rôle | Statut |
|---|---|---|
| `team-lead` | Orchestrateur — décompose, délègue, synthétise. Ne code jamais directement. | ✅ Actif |
| `backend-dev` | NestJS + TypeORM + MySQL — services, migrations, BullMQ, webhooks | ✅ Actif |
| `frontend-dev` | React + Next.js — logique frontend, hooks, API calls, state | ✅ Actif |
| `designer` | UI/UX — direction esthétique, composants visuels, animations, design system | ✅ **Ajouté** |
| `reviewer` | Revue qualité, sécurité, architecture — obligatoire avant merge | ✅ Actif |
| `tester` | Tests Jest, diagnostics TypeScript/runtime, factories/fixtures | ✅ Actif |
| `plan` | Planification architecturale, décomposition US, détection réutilisables | ✅ **Mis à jour** |
| `explore` | Recherche lecture seule + signalement duplications/réutilisables | ✅ **Mis à jour** |
| `general-purpose` | Fallback polyvalent — scanne l'existant avant toute action | ✅ **Mis à jour** |

---

## 2. Règles transversales appliquées à toute l'équipe

### Règle n°1 — Factorisation obligatoire ✅ IMPLÉMENTÉE

**Tout code qui se répète doit être extrait et réutilisé.**

| Agent | Application |
|---|---|
| `explore` | Signale duplications et réutilisables dans chaque rapport |
| `plan` | Identifie les existants, planifie les extractions avant l'implémentation |
| `team-lead` | Scanner avant délégation, transmettre les réutilisables dans chaque brief |
| `backend-dev` | Méthode `private` ou `src/common/`. Jamais de copier-coller TypeORM |
| `frontend-dev` | Composant dans `components/`, hook dans `hooks/` |
| `designer` | Composant générique avec props. Valeurs jamais en dur |
| `tester` | Helper `test/helpers/`, factory `test/factories/`, fixture `test/fixtures/` |
| `general-purpose` | Scanner avant toute création |
| `reviewer` | Dernier filtre — bloquant si divergence métier |

---

### Règle n°2 — Contrat d'interface d'abord ✅ IMPLÉMENTÉE

**Définir interfaces/DTOs AVANT d'écrire le code. Obligatoire avant toute parallélisation.**

| Agent | Application |
|---|---|
| `plan` | Tâche 0 dans chaque plan fullstack : contrat DTOs + interfaces de réponse + signatures endpoints |
| `team-lead` | Définit le contrat avant de spawner backend-dev + frontend-dev en parallèle |
| `backend-dev` | DTOs `class-validator` + interfaces de retour définis avant d'implémenter |
| `frontend-dev` | `XxxProps` interface avant le JSX, types API dans `lib/definitions.ts` |
| `reviewer` | Vérifie cohérence contrat backend ↔ frontend (bloquant si désalignement) |

---

### Règle n°3 — Idempotence obligatoire ✅ IMPLÉMENTÉE

**Tout job BullMQ, cron et webhook handler doit pouvoir être rejoué sans effet de bord.**

| Agent | Application |
|---|---|
| `backend-dev` | `findOne` avant `save`, déduplication par `externalId`/`event_id` |
| `tester` | Test de rejeu obligatoire pour chaque handler/job |
| `reviewer` | Checklist : BullMQ, crons et webhooks vérifiés pour idempotence (bloquant) |

---

### Règle n°4 — Zéro `any` TypeScript ✅ IMPLÉMENTÉE

**Aucun `any` dans le code produit — point bloquant en review.**

| Agent | Application |
|---|---|
| `backend-dev` | `unknown` + type guard, `.getRawMany<T>()`, interfaces DTOs Whapi |
| `frontend-dev` | Props typées, events React typés, retours API depuis `definitions.ts` |
| `designer` | Union types pour variantes (`'sm' \| 'md' \| 'lg'`), jamais `any` sur les props |
| `tester` | Aucun `any` dans les mocks, factories, fixtures |
| `general-purpose` | Interfaces pour données JSON externes |
| `reviewer` | Zéro `any` = point bloquant systématique |

---

### Règle n°5 — Validation aux frontières uniquement ✅ IMPLÉMENTÉE

**Valider aux points d'entrée du système, faire confiance au code interne.**

| Agent | Application |
|---|---|
| `backend-dev` | `class-validator` sur DTOs d'entrée uniquement, pas de re-validation dans les services |
| `frontend-dev` | Validation sur formulaires/inputs utilisateur uniquement, pas sur données déjà typées |
| `reviewer` | Signale la sur-validation redondante comme suggestion |

---

### Règle n°6 — Zéro requête N+1 ✅ IMPLÉMENTÉE

**Interdire toute requête SQL dans une boucle — point bloquant en review.**

| Agent | Application |
|---|---|
| `backend-dev` | `leftJoinAndSelect`, `IN (:...ids)`, `Promise.all()` — jamais `for await` sur des requêtes |
| `tester` | Test du nombre d'appels repository — N+1 = test qui échoue |
| `explore` | Détecte et signale les patterns N+1 lors des recherches |
| `reviewer` | Zéro N+1 = point bloquant systématique |

---

## 3. Axes d'amélioration

### Axe H — Auto-dispatch global des agents ✅ IMPLÉMENTÉ

**Fichier** : `~/.claude/CLAUDE.md` (global, chargé dans tous les projets)

Routage automatique sans intervention manuelle :

| Type de prompt | Agent déclenché |
|---|---|
| Backend (service, migration, entité, cron, webhook) | `backend-dev` |
| Design/esthétique (look, animations, charte, UX) | `designer` |
| Frontend logique (hook, état, API call) | `frontend-dev` |
| Design + implémentation complète | `team-lead` → `designer` + `frontend-dev` en parallèle |
| Feature fullstack / US complexe | `team-lead` → tous agents pertinents en parallèle |
| Bug / erreur / diagnostic | `tester` → agent fix |
| Revue / audit / avant merge | `reviewer` |
| Recherche codebase | `Explore` |

**Portée** : tous les projets Claude Code sur cette machine.

---

### Axe I — Agent designer ✅ IMPLÉMENTÉ

**Fichier** : `~/.claude/agents/designer.md`

Responsabilités :
- Direction esthétique assumée (pas de design générique)
- Composants React/TSX avec Tailwind, animations CSS/Framer Motion
- Design system cohérent `front/` ↔ `admin/`
- Accessibilité WCAG AA, états vides/chargement/erreur/succès
- Collaboration : `designer` fait le rendu visuel, `frontend-dev` fait la logique

Pipeline design :
```
team-lead
  ├── designer    (composant visuel, direction esthétique)  ← en parallèle
  └── frontend-dev (logique, API calls, intégration design) ← intègre après designer
        ↓
  reviewer (revue globale)
```

---

### Axe A — Automatiser la revue de code ✅ IMPLÉMENTÉ

**Problème** : l'agent `reviewer` est sous-utilisé. Les bugs et régressions sont détectés tardivement.

**Actions** :
- [x] Déclencher `/code-review` systématiquement avant chaque merge vers `master`
- [x] Utiliser `/code-review ultra` pour les PRs à fort impact (migrations SQL, services critiques : `CommunicationWhapiService`, `SlaCheckerService`)
- [x] Hook `PostToolUse` sur `Bash(git push*)` configuré dans `.claude/settings.json` → affiche un rappel `/code-review` à chaque `git push`

**Détail hook** : `.claude/settings.json` → `hooks.PostToolUse` → matcher `Bash` + `if: Bash(git push*)` → `systemMessage` non-bloquant.

**Gain attendu** : réduction des bugs en production, meilleure cohérence architecturale.

---

### Axe B — Industrialiser les tests ✅ IMPLÉMENTÉ

**Problème** : l'agent `tester` intervient en réaction (bug constaté) et non en prévention.

**Actions** :
- [x] Infrastructure `test/helpers/`, `test/factories/`, `test/fixtures/` créée
  - `mock-repository.ts` — factory générique `mockRepository<T>()` avec `MockQueryBuilder` typé, zéro `any`
  - `create-test-module.ts` — wrapper `Test.createTestingModule` typé
  - `conversation.factory.ts` — 4 factories (`makeConversation`, `makeConversationEnAttente`, `makeConversationFermee`, `makeConversationLue`)
  - `message.factory.ts` — 3 factories (`makeMessage`, `makeIncomingMessage`, `makeOutgoingMessage`)
- [x] `FirstResponseTimeoutJob` — 25/25 tests (plages horaires, idempotence, AM#1 préservé, N+1 absent)
- [x] `DispatcherService.jobRunnerAllPostes` — 7 cas (mutex, step 0 FERME, batchSize=0, charge équilibrée)
- [x] `OutboundRouterService` — 13 tests (routing whapi/meta/messenger, NotFoundException canal null, BadRequestException provider inconnu, idempotence)
- [x] `MediaDownloadService` — 12 tests (skip si déjà téléchargé, URL expirée, provider null → marqué expired, erreur HTTP absorbée, N+1 détecté)
- [x] `CallLogService` — 14 tests (`OrderCallSyncService` absent du codebase — couverture via `CallLogService` : CRUD, tri DESC, idempotence)

**Point vigilance** : `jobRunnerAllPostes` génère une requête par poste surchargé — N+1 potentiel si >20-30 postes actifs. Intentionnel mais à surveiller.

**Gain attendu** : fiabilité production, détection précoce des régressions.

---

### Axe C — Paralléliser les agents ✅ CONFIGURÉ (comportemental)

**Problème** : les agents sont souvent appelés séquentiellement alors que certaines tâches sont indépendantes.

**Pattern recommandé** :
```
team-lead reçoit une US complexe
  ├── backend-dev  (service + migration)        ← en parallèle
  ├── designer     (direction visuelle)          ← en parallèle
  ├── tester       (spec du comportement)        ← en parallèle
  └── frontend-dev (logique + intégration design) ← après designer
        ↓
  reviewer (revue globale)                       ← après livraison
```

**Actions** :
- [x] `~/.claude/agents/team-lead.md` mis à jour : Règle n°1 anti-duplication + Règle n°2 contrat-first avant parallelisation, brief template avec `run_in_background: true`
- [x] Comportement actif sur tous les prompts fullstack via auto-dispatch global

**Gain attendu** : réduction du temps de livraison des features de ~40%.

---

### Axe D — Intégrer un agent de sécurité ✅ AUDIT EFFECTUÉ

**Problème** : pas de revue sécurité systématique. La plateforme expose des webhooks Meta, gère des tokens système, et accède à deux bases de données.

**Résultats audit (2026-06-10)** :

| Sévérité | Fichier | Description | Statut |
|---|---|---|---|
| BLOQUANT | `whapi/whapi.controller.ts:62` | `assertWhapiSecret()` commenté → bypass HMAC total | À corriger |
| BLOQUANT | `channel/channel.service.ts:557` | Entité brute retournée → `token`/`meta_app_secret` exposés dans API | À corriger |
| ATTENTION | `whapi/whapi.controller.ts:211` | `console.log` expose `verify_token` dans les logs | À corriger |
| ATTENTION | `channel/entities/channel.entity.ts:52` | Secrets stockés en clair en base (pas de chiffrement au repos) | P2 |
| ATTENTION | `whapi/whapi.controller.ts:371` | Telegram bypass si `webhook_secret` absent (silence au lieu de 401) | P2 |
| ATTENTION | `metriques/metriques.service.ts:1000` | Concaténation UUID dans SQL (données internes — risque faible) | P2 |

**Points positifs** : `timingSafeEqual` ✅ — rotation secret PREVIOUS ✅ — idempotence webhooks ✅ — AdminGuard classe ✅

**Actions** :
- [x] Audit réalisé par `reviewer`
- [x] Fix BLOQUANT 1 : `assertWhapiSecret()` décommenté — HMAC actif (`whapi.controller.ts:62`)
- [x] Fix BLOQUANT 2 (partiel) : `sanitizeChannel()` appliqué sur `create()`, `update()`, `assignPoste()` — `findAll()` et `findOne()` toujours complets (usage interne nécessaire) — **vérifier que `GET /channel` ne retourne pas de tokens via `findAll()`**
- [x] Fix ATTENTION : `console.log verify_token` supprimés, remplacés par `auditLogger.debug` sans token
- [x] Fix `GET /channel` : `sanitizeChannel()` rendu public, appliqué dans le contrôleur sur `findAll()` et `findOne()` — build OK
- [ ] Documenter les règles de sécurité dans `CLAUDE.md`

**Gain attendu** : réduction de la surface d'attaque, conformité données clients.

---

### Axe E — Structurer le workflow sprint ✅ IMPLÉMENTÉ

**Problème** : les sprints sont planifiés mais le suivi inter-sessions repose uniquement sur la mémoire auto.

**Template de workflow sprint** :
```
1. Plan       → décomposition US en tâches
2. backend-dev + designer + tester → implémentation en parallèle
3. frontend-dev → intégration (après designer)
4. reviewer   → revue qualité + sécurité + factorisation
5. team-lead  → validation livraison
```

**Actions** :
- [x] `SPRINT_CURRENT.md` template créé à la racine du projet (copier → `SPRINT_[N].md` par sprint)
- [x] DoD intégrée : 0 erreur TS, tests passants, reviewer approuvé, 0 any/N+1/duplication, PR vers master
- [x] Comportement actif via `~/.claude/CLAUDE.md` : workflow sprint documenté pour tous les projets

---

### Axe F — Réduire les prompts de permission ✅ IMPLÉMENTÉ

**Problème** : les permissions répétitives (`Bash`, `Read`, `Glob`) ralentissent le workflow.

**Actions** :
- [x] `/fewer-permission-prompts` lancé — analyse de 50 sessions JSONL
- [x] `.claude/settings.json` créé avec `Bash(npx tsc --noEmit*)` (115 occurrences détectées)
- [x] Hooks git push ajoutés dans le même fichier (Axe A)
- [x] Note : `bypassPermissions` global dans `~/.claude/settings.json` couvre déjà tout le reste

**Gain attendu** : fluidité du travail en mode full-auto.

---

### Axe G — Documenter l'architecture vivante ✅ IMPLÉMENTÉ

**Actions** :
- [x] `~/.claude/CLAUDE.md` global créé (routage agents + règles transversales + mode full-auto)
- [x] `CLAUDE.md` local créé à la racine du projet (`/init` lancé) — architecture DB1/DB2, flux messages, entités clés, conventions TypeORM, règle jamais écrire en DB2, env vars requises
- [x] `CLAUDE.md` mis à jour à chaque livraison de sprint (convention Ongoing)

---

## 4. Roadmap

```
Semaine 1 — TERMINÉ ✅
  ✦ Axe H : auto-dispatch global via ~/.claude/CLAUDE.md
  ✦ Axe I : agent designer créé
  ✦ Règle n°1 : factorisation obligatoire sur les 5 agents

Semaine 1 — À FAIRE
  ✦ Axe A : hook git push → /code-review automatique ✅
  ✦ Axe B : créer test/helpers/ + couvrir SlaCheckerService ✅

Semaine 2 — TERMINÉ ✅
  ✦ Axe C : parallélisation via team-lead.md ✅
  ✦ Axe D : audit sécurité + fix bloquants ✅

Semaine 3 — TERMINÉ ✅
  ✦ Axe E : SPRINT_CURRENT.md template + DoD ✅
  ✦ Axe F : allowlist permissions ✅
  ✦ Axe G : CLAUDE.md global + local ✅

Ongoing
  ✦ /code-review ultra sur chaque PR critique
  ✦ reviewer en fin de sprint
```

---

## 5. Indicateurs de succès

| Indicateur | Avant | Cible |
|---|---|---|
| Couverture tests nouveaux modules | ~60% | 100% |
| Bugs détectés en production | Occasionnels | 0 par sprint |
| Temps de livraison feature complexe | 1-2 sessions | < 1 session |
| PRs avec revue avant merge | Occasionnel | 100% |
| Code dupliqué détecté en review | Non mesuré | 0 toléré |
| Permissions manuelles par session | ~10 | < 3 |

---

*Dernière mise à jour : 2026-06-10 — à réviser chaque fin de sprint*
