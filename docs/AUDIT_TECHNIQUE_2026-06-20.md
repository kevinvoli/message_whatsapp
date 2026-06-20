# Audit technique — Projet WhatsApp Messagerie

Date : 2026-06-20
Périmètre : `message_whatsapp/` (backend NestJS), `front/` (Next.js commerciaux), `admin/` (Next.js panel), CI/CD, infrastructure.
Mode : lecture seule, aucun fichier de code modifié.

---

## 1. Synthèse — notes par domaine

| Domaine | Note | Commentaire |
|---|---|---|
| Architecture globale | B | Modularité forte, mais nombre de modules très élevé (~90) et quelques doublons de nommage |
| Sécurité backend | B+ | HMAC webhooks robuste, guards globaux, validation stricte — quelques endpoints non protégés |
| Performance backend | B | Pas de N+1 flagrant détecté, boucles séquentielles justifiées (locks/rate-limit) |
| Migrations / DB | C+ | Double exécution des migrations (CI + runtime), 2 formats de nommage coexistants |
| Qualité TypeScript | B | `any`/`as any` résiduels (40 + 66 backend, ~40 frontend) |
| Tests | B | 94 specs, modules critiques couverts (dispatcher, webhooks, flowbot) |
| Frontend (front + admin) | B | Pas de XSS, états gérés, mais token en sessionStorage |
| CI/CD | B | Backup pré-migration + rollback présents — pas de gate tests/lint |
| Infra / SPOF | C | MySQL sur l'hôte, Redis et backend mono-instance |

Verdict global : **approuvé avec réserves**. Aucun blocage critique de sécurité, mais plusieurs points majeurs à traiter avant montée en charge (idempotence broadcast, double migration, SPOF).

---

## 2. Findings par criticité

### 🔴 Critique

Aucun finding critique de sécurité (pas de SQL injection, pas de XSS, pas de secret en dur, HMAC vérifié).

**🔴-1 — Idempotence du worker de broadcast non garantie**
`message_whatsapp/src/broadcast/workers/broadcast.worker.ts:68-110`
Le worker charge les destinataires via `recipientRepo.findByIds(recipientIds)` sans filtrer ceux déjà `SENT`. Si le job lève une exception après avoir envoyé une partie du batch (ligne 131 `throw err`), BullMQ rejoue le job entier et **re-envoie les messages aux destinataires déjà `SENT`**. Sur un canal Meta facturé au message, c'est une double facturation + spam client.
Recommandation : filtrer `WHERE status IN (PENDING, FAILED)` au chargement, ou court-circuiter `if (recipient.status === SENT) continue;` dans la boucle.

### 🟠 Majeur

**🟠-1 — Double exécution des migrations (CI + runtime)**
`.github/workflows/deploy-production.yml:201-205` lance `npm run migration:run:prod` dans un container dédié AVANT le démarrage, puis `message_whatsapp/src/database/database.module.ts:39` a `migrationsRun: true` qui relance les migrations au boot du backend.
Risque : sur des migrations non idempotentes, la seconde passe peut échouer ou produire un état incohérent (la table `migrations` de TypeORM protège en théorie, mais le pattern est fragile et masque les erreurs). Choisir UNE seule stratégie. Recommandé : garder l'étape CI dédiée (gating clair avant rollout) et passer `migrationsRun: false` au runtime.

**🟠-2 — Endpoint de métriques webhook non protégé**
`message_whatsapp/src/whapi/webhook-metrics.controller.ts:5` — `@Controller('metrics/webhook')` expose `GET /metrics/webhook` et `GET /metrics/webhook/prometheus` sans aucun guard. Cela divulgue des données opérationnelles (volumes, taux d'échec de signature, santé interne) à tout client non authentifié.
Recommandation : protéger par `AdminGuard` ou restreindre l'accès au réseau interne (Nginx allowlist).

**🟠-3 — Token JWT stocké en `sessionStorage` côté commercial**
`front/src/app/auto_connexion/page.tsx:34`, `front/src/contexts/AuthProvider.tsx:60`
Le JWT est lisible par tout script s'exécutant dans la page → exposition en cas de faille XSS. Le code utilise par ailleurs `credentials: 'include'` (`front/src/lib/api.ts:35`), ce qui suggère un mécanisme cookie en parallèle : la double source de vérité est ambiguë.
Recommandation : privilégier un cookie `httpOnly` + `Secure` + `SameSite` pour le token, et supprimer le stockage `sessionStorage`. Au minimum, documenter et unifier la stratégie.

**🟠-4 — Pas de gate qualité dans la CI**
`.github/workflows/ci-cd.yml` et `deploy-production.yml` ne lancent ni tests (`npm run test`), ni lint, ni `tsc --noEmit` avant de builder/déployer. Une régression TS ou un test cassé partent en production.
Recommandation : ajouter un job `quality` (test + lint + typecheck pour les 3 apps) en `needs` du build.

**🟠-5 — SPOF infrastructure**
- MySQL n'est pas dans `docker-compose.yml` (accédé via `host.docker.internal`, `docker-compose.yml:73`). Sa résilience/sauvegarde dépend entièrement de l'hôte ; seul un `mysqldump` pré-migration existe (`deploy-production.yml:161-175`) — pas de backup planifié continu visible.
- Redis mono-instance avec `--maxmemory-policy noeviction` (`docker-compose.yml:31`) : si la mémoire est atteinte, les écritures BullMQ échouent (choix volontaire pour ne pas perdre les jobs, mais sans alerting c'est un point de blocage silencieux).
- Backend mono-instance alors que l'adaptateur Redis Socket.io (`@socket.io/redis-adapter`) est configuré pour le multi-instance — capacité prévue mais non exploitée, et donc point de défaillance unique.
Recommandation : backup MySQL planifié + monitoring mémoire Redis + alerting ; documenter la stratégie de scale horizontal du backend.

### 🟡 Mineur

**🟡-1 — `any` / `as any` résiduels**
Backend : 40 occurrences `: any` + 66 `as any` (hors specs). Frontend : ~15 (`front/`) + ~25 (`admin/`). La convention CLAUDE.md impose « zéro `any` ». Exemples connus : cast `helmet as any` (`main.ts:35`).
Recommandation : campagne de résorption progressive, `unknown` + type guards.

**🟡-2 — Code de debug commenté laissé en place**
`message_whatsapp/src/whapi/whapi.controller.ts:1050,1070,1076` — `// console.log("affichage du post:...")` dans `verifyHmacSignature` (chemin critique de sécurité). 10 occurrences `// console` et 10 `console.log` actifs hors specs/migrations.
Recommandation : nettoyer, utiliser le `Logger` NestJS si trace nécessaire.

**🟡-3 — Deux formats de nommage de migrations coexistent**
123 migrations au format date `20260xxx_*.ts` et 40 au format timestamp `XxxNNNNNNNNNNNNN`. CLAUDE.md l'assume (« coexistent — à ne pas reproduire ») mais l'ordre d'exécution mélangé entre les deux conventions est un risque de confusion. 163 migrations au total : envisager un squash baseline post-convergence master.

**🟡-4 — Doublons de modules / nommage ambigu**
`whatsapp_template/` ET `whatsapp-template/`, `whatsapp-template` controller vide (`whatsapp_template.controller.ts:4`). `auth/` ET `auth_admin/`. Risque de dispersion de la logique et de duplication.
Recommandation : consolider et supprimer les modules/contrôleurs vides.

**🟡-5 — CSP désactivée**
`message_whatsapp/src/main.ts:36` — `contentSecurityPolicy: false` (commentaire renvoie à Nginx). Vérifier qu'une CSP est bien appliquée en amont, sinon les fronts Next.js sont sans CSP.

**🟡-6 — Fichier vide suspect à la racine**
`interprete` (0 octet) à la racine du repo — résidu à supprimer.

**🟡-7 — `@Request() req` non typé dans auth.controller**
`message_whatsapp/src/auth/auth.controller.ts:137` — `req` implicitement `any`. Typer avec une interface `AuthenticatedRequest`.

### 🟢 Positif

- **🟢-1 — Sécurité des webhooks exemplaire.** `whapi.controller.ts` : HMAC SHA-256 avec `timingSafeEqual` (`:1072-1074`), support rotation de secret (`SECRET_VALUE_PREVIOUS`), vérification de taille de payload (`:1100`), rate limiting par IP+tenant, circuit breaker, validation stricte de structure (`assertWhapiPayload`/`assertMetaPayload`), signature Meta par `x-hub-signature-256` avec secret par canal.
- **🟢-2 — Pas de SQL injection.** Aucune interpolation de variable utilisateur dans les requêtes runtime ; les seules interpolations sont dans les migrations sur des noms de tables/colonnes en dur. QueryBuilder paramétré partout.
- **🟢-3 — Validation centralisée.** `ValidationPipe` global avec `whitelist`, `forbidNonWhitelisted`, `transform` (`main.ts:24-31`). `ThrottlerGuard` global (`app.module.ts:297`). `helmet` + `cookie-parser` + CORS allowlist stricte.
- **🟢-4 — Pas de XSS frontend.** Zéro `dangerouslySetInnerHTML` dans `front/` et `admin/`. Pas de secret/token sensible loggé.
- **🟢-5 — DB2 null-safe.** Séparation lecture seule DB2 / écriture `messaging_*` respectée (cf. `order-db/`, `integration-sync/`).
- **🟢-6 — CI/CD avec backup + rollback.** `mysqldump --single-transaction` gzippé avant migration, tag `:prod-previous` et bascule automatique en cas d'échec du `docker compose up`.
- **🟢-7 — Couverture de test des modules critiques.** dispatcher, webhooks (`inbound-message-pipeline.spec.ts`), flowbot (4 specs : engine, trigger, variable, pipeline), idempotence webhook (`webhook-idempotency.service.ts` + tests).
- **🟢-8 — Idempotence webhook entrant** gérée (`src/webhooks/idempotency/`) et `migrationsRun` documenté.
- **🟢-9 — Persistance et healthchecks Docker** soignés (volumes nommés, `stop_grace_period` pour drain BullMQ, healthchecks sur les 4 services, rotation des logs).

---

## 3. Dette technique prioritaire (ordre recommandé)

1. **🔴-1** Idempotence broadcast — risque financier/client immédiat.
2. **🟠-1** Choisir une seule stratégie de migration (désactiver `migrationsRun` au runtime).
3. **🟠-2** Protéger `metrics/webhook`.
4. **🟠-4** Ajouter le gate qualité (test + lint + typecheck) en CI.
5. **🟠-3** Unifier la stratégie de stockage du JWT (cookie httpOnly).
6. **🟠-5** Backup MySQL planifié + monitoring Redis.
7. **🟡-1 / 🟡-2** Résorption `any` + nettoyage debug.
8. **🟡-3 / 🟡-4** Consolidation migrations + modules dupliqués.

---

## 4. Note pour CLAUDE.md (désynchronisation possible)

CLAUDE.md indique « Migrations auto : `migrationsRun: true` — ne jamais proposer `migration:run` manuel ». Or la CI exécute explicitement `npm run migration:run:prod` (`deploy-production.yml:205`). Les deux mécanismes sont actifs simultanément. La documentation devrait clarifier la stratégie cible et le découplage entre la migration de déploiement (CI) et le comportement runtime.

*Note : aucun outil d'édition utilisé pour ce point — à déléguer à `general-purpose` si correction souhaitée.*
