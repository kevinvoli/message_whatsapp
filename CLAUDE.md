# CLAUDE.md — Projet WhatsApp Messagerie

## Structure du repo

```
message_whatsapp/   — Backend NestJS 11 + TypeORM 0.3 + MySQL + BullMQ + Redis + Socket.io
front/              — Frontend Next.js 16 + React 19 (agents commerciaux, port 3000)
admin/              — Panel admin Next.js 16 + React 19 (superviseurs, port 3006)
programmeTest/      — Scripts de test ponctuels
scripts/            — Scripts utilitaires
shared/             — Code partagé inter-apps
```

---

## Commands

### Backend (`message_whatsapp/`)
```bash
npm run start:dev       # dev avec watch
npm run build           # nest build
npm run start:prod      # node dist/main
npm run test            # jest (rootDir: src, pattern *.spec.ts)
npm run test:cov        # jest --coverage
npm run lint            # eslint --fix
npm run migration:generate  # génération TypeORM (dev uniquement)
npx tsc --noEmit        # vérification TypeScript
```

### Frontend (`front/`)
```bash
npm run dev             # next dev -p 3000
npm run build           # next build
npm run test            # vitest run
npm run lint            # eslint
```

### Admin (`admin/`)
```bash
npm run dev             # next dev -p 3006
npm run build           # next build
npm run test            # vitest run
npm run lint            # eslint
```

---

## Architecture

### Flux principaux
- Webhook entrant (Whapi/Meta) → `src/webhooks/` → `DispatcherModule` → file BullMQ → traitement
- Message sortant agent : `POST /messages` [AdminGuard] ou `POST /messages/media` [JWT commercial]
- `OutboundRouterService` choisit le provider (whapi vs meta) selon `channel.provider`
- Temps réel : Socket.io avec adaptateur Redis (`@socket.io/redis-adapter`)

### Bases de données
- **DB1 (principale)** — MySQL, toutes les tables `whatsapp_*` + `messaging_*`. TypeORM avec `migrationsRun: true` au démarrage.
- **DB2 (commandes, optionnelle)** — MySQL externe (ERP/GICOP). Injectée via `ORDER_DB_DATA_SOURCE` (null si `ORDER_DB_HOST` absent). Lecture seule sur tables natives DB2. Écriture uniquement dans tables miroir `messaging_*`.

### Modules clés
| Module | Chemin | Rôle |
|---|---|---|
| `DatabaseModule` | `src/database/` | Connexion DB1, `migrationsRun: true` |
| `OrderDbModule` | `src/order-db/` | Connexion DB2 null-safe |
| `DispatcherModule` | `src/dispatcher/` | Routage conversations → commerciaux |
| `WindowModule` | `src/window/` | Fenêtre glissante de validation |
| `ApplicationModule` | `src/application/` | `MessagingApplication` (app_id, app_secret, system_token) |
| `BroadcastModule` | `src/broadcast/` | Broadcasts HSM via BullMQ |
| `FlowBotModule` | `src/flowbot/` | Automatisation (DELAY, HTTP_REQUEST, SEND_TEMPLATE…) |

---

## Conventions ORM / backend

```typescript
// Entités : camelCase pour les properties, snake_case dans les décorateurs
@Column({ name: 'created_at' })
createdAt: Date;

// QueryBuilder : utiliser les property names camelCase, pas les column names
.orderBy('audit.createdAt', 'DESC')        // correct
.orderBy('audit.created_at', 'DESC')       // FAUX

// find options : idem
order: { createdAt: 'DESC' }               // correct
order: { created_at: 'DESC' }              // FAUX

// DTOs recevant des données externes Whapi : snake_case toléré
```

### Migrations
- **Naming obligatoire** : classe TypeScript dont le nom se termine par un timestamp JS 13 chiffres.
  Ex : `AddLocalMediaStorage1749427200001`, `Phase6Features1744761600006`
  Sinon erreur au déploiement.
- **Migrations auto** : `migrationsRun: true` dans `DatabaseModule` — ne jamais proposer `migration:run` manuel.
- Les migrations `20260xxx_*.ts` (ancien format date) coexistent dans le dossier — à ne pas reproduire pour les nouvelles.
- **Jamais d'écriture** dans les tables natives DB2 — uniquement lecture + écriture dans `messaging_*`.

---

## Conventions frontend / admin

- **Dates** : toujours via `dateUtils.ts` (`front/src/lib/dateUtils.ts` et `admin/src/app/lib/dateUtils.ts`).
  Fonctions : `formatTime`, `formatDateShort`, `formatDate`, `formatDateLong`, `formatRelativeDate`, `formatConversationTime`.
  Locale `fr-FR` partout. Valeur nulle/invalide → `"-"` (jamais `Date.now()` en fallback).
- **Types API admin** : `admin/src/app/lib/definitions.ts`
- **Appels HTTP admin** : structure modulaire `admin/src/app/lib/api/*.api.ts` + client HTTP dans `admin/src/app/lib/api/_http.ts`
- **Appels HTTP front** : `front/src/lib/api.ts` + fichiers `*Api.ts` dans `front/src/lib/`
- **Zéro `any` TypeScript** — point bloquant en review. Utiliser `unknown` + type guard si nécessaire.

---

## Variables d'environnement requises

### Backend (`message_whatsapp/`)
```
# DB1 — obligatoires
MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
SERVER_PORT
JWT_SECRET

# Webhooks Whapi
WHAPI_WEBHOOK_SECRET_HEADER
WHAPI_WEBHOOK_SECRET_VALUE

# Redis (optionnel mais requis pour BullMQ/Socket.io multi-instance)
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

# DB2 commandes — optionnel (désactivé si absent)
ORDER_DB_HOST, ORDER_DB_PORT, ORDER_DB_USER, ORDER_DB_PASSWORD, ORDER_DB_NAME

# Admin initial (production : obligatoire)
ADMIN_EMAIL, ADMIN_PASSWORD

# IA (optionnel)
ANTHROPIC_API_KEY   # ou AI_PROVIDER selon config
```

### Frontend / Admin
```
NEXT_PUBLIC_API_URL       # URL backend (ex: http://localhost:3002)
NEXT_PUBLIC_TENANT_ID     # identifiant tenant (défaut: "default")
```

---

## Points d'attention

- **Migrations** : classe finissant par timestamp 13 chiffres. Auto au démarrage. Ne jamais proposer `migration:run` manuel.
- **DB2** : lecture seule sur tables natives. `ORDER_DB_DATA_SOURCE` peut être null — toujours null-safe.
- **Idempotence** : les jobs BullMQ et webhooks doivent être idempotents.
- **Canal dédié** : `WhapiChannel.poste_id IS NOT NULL` → mode dédié exclusif (rate limit, cooldown, idle disconnect désactivés pour ce commercial).
- **Baseline TS backend** : 4 erreurs pré-existantes dans `order-call-sync/__tests__/` — ne pas considérer comme régression.
- **Zéro N+1** — pas de requête dans une boucle.

---

## Règles de sécurité

- Ne jamais retourner ni loguer : `JWT_SECRET`, `MYSQL_PASSWORD`, `ORDER_DB_PASSWORD`, `ANTHROPIC_API_KEY`, tokens Meta/Whapi.
- Toujours des paramètres liés dans les requêtes SQL — jamais de concaténation.
- Webhooks entrants : vérifier `WHAPI_WEBHOOK_SECRET_HEADER` / `WHAPI_WEBHOOK_SECRET_VALUE`.

---

## Stratégie git

- **master** est destiné à remplacer production — tout développement cible master.
- **production** ne reçoit que des hotfixes critiques pendant la convergence.
- Ne jamais commiter ni merger sans instruction explicite.
- Ne jamais créer de branche sans autorisation explicite — travailler sur la branche courante.
- Toujours passer par une Pull Request pour merger dans master.
- Toujours répondre en français.