# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Monorepo structure

```
message_whatsapp/   — Backend NestJS (API + WebSocket + crons)
front/              — Frontend Next.js port 3000 (agents commerciaux)
admin/              — Panel admin Next.js port 3006
programmeTest/      — Scripts de test manuels
```

---

## Commands

### Backend (`message_whatsapp/`)
```bash
npm run start:dev          # dev avec hot-reload
npm run build              # compile TypeScript (vérification zéro erreur)
npm test                   # tous les tests Jest
npm test -- --testPathPattern=service-name   # test ciblé
npm run test:cov           # coverage
npm run migration:generate -- --name NomMigration   # génère une migration
npm run migration:run      # applique les migrations
npm run migration:revert   # annule la dernière migration
npm run lint               # ESLint avec auto-fix
```

### Frontend (`front/`) et Admin (`admin/`)
```bash
npm run dev    # front: port 3000, admin: port 3006
npm run build  # build Next.js
npm run lint   # ESLint
```

---

## Architecture backend

### Flux d'un message entrant

```
Webhook Whapi/Meta
  → webhooks/unified-ingress.service.ts  (déduplique via WebhookIdempotencyService)
  → dispatcher/dispatcher.service.ts     (assigne la conversation à un poste via mutex)
  → whatsapp_message/                    (persiste le message)
  → WhatsappMessageGateway               (émet l'événement Socket.io vers le front)
```

### Envoi de message sortant

```
POST /messages (AuthGuard jwt)     → messages commercial
POST /messages (AdminGuard)        → messages admin
  → OutboundRouterService          (choisit whapi ou meta selon channel.provider)
  → CommunicationWhapiService      (provider = 'whapi')
  → MetaOutboundService            (provider = 'meta')
```

### Dispatcher et assignation

`DispatcherService` gère l'assignation des conversations (`WhatsappChat`) aux postes (`WhatsappPoste`). Un mutex par `chatId` (`async-mutex`) garantit qu'une conversation ne peut pas être assignée deux fois simultanément.

**Mode canal dédié** : `WhapiChannel.poste_id IS NOT NULL` → messages routés exclusivement vers ce poste, hors queue globale. Le rate-limit, cooldown et idle-disconnect sont désactivés pour ces postes.

**Mode queue globale** : `WhapiChannel.poste_id IS NULL` → conversation distribuée selon les règles du dispatcher.

### Entités clés

| Entité | Table | Rôle |
|---|---|---|
| `WhatsappChat` | `whatsapp_chat` | Conversation. Statuts : `actif`, `en attente`, `fermé` |
| `WhatsappMessage` | `whatsapp_message` | Message individuel |
| `WhapiChannel` | `whapi_channels` | Canal WhatsApp (provider: `whapi` ou `meta`) |
| `WhatsappPoste` | `whatsapp_poste` | Poste agent commercial |
| `WhatsappCommercial` | `whatsapp_commercial` | Compte agent |

Toutes les entités utilisent le **soft-delete** (`@DeleteDateColumn deletedAt`). Filtrer avec `IsNull()` ou `withDeleted()`.

### Deux bases de données

- **DB1** (MySQL principale) — toutes les entités `messaging_*` — lecture + écriture
- **DB2** (externe, ORDER_DB_DATA_SOURCE) — tables commandes/ERP — **lecture seule** — jamais d'écriture dans les tables natives DB2, uniquement dans `messaging_*`

### Crons et jobs

Les crons NestJS (`@Cron`) sont déclarés dans les services des modules concernés (pas dans `jorbs/tasks.service.ts` qui est un placeholder vide). Modules avec crons actifs : `dispatcher/`, `media-storage/`, `jorbs/`.

### Feature flags

Variables d'environnement préfixées `FF_` (ex: `FF_UNIFIED_WEBHOOK_ROUTER`, `FF_GICOP_REPORT_REQUIRED`). Lues via `process.env` ou `ConfigService`.

---

## Conventions TypeORM obligatoires

```typescript
// Propriétés camelCase + décorateur name snake_case
@Column({ name: 'created_at' })
createdAt: Date;

// QueryBuilder : toujours les property names camelCase (PAS les column names)
.orderBy('entity.createdAt', 'DESC')   // ✅
.orderBy('entity.created_at', 'DESC')  // ❌

// Migrations : class name doit finir par un timestamp JS 13 chiffres
export class NomFeature1744761600001 implements MigrationInterface {}

// Soft-delete dans les requêtes
{ where: { deletedAt: IsNull() } }
```

---

## Conventions frontend/admin

- Dates : toujours via `lib/dateUtils.ts` — fonctions `formatTime`, `formatDate`, `formatRelativeDate`, etc. — locale `fr-FR` — nulls → `"-"`
- Types API : dans `lib/definitions.ts` (front) et `admin/src/app/lib/definitions.ts` (admin)
- Appels HTTP : dans `lib/api.ts` uniquement
- Composants partagés `front/` ↔ `admin/` : impossible (projets séparés) — dupliquer en signalant la source

---

## Variables d'environnement requises (backend)

```
MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
SERVER_PORT
WHAPI_WEBHOOK_SECRET_HEADER + WHAPI_WEBHOOK_SECRET_VALUE  (obligatoires ensemble)
MESSAGE_RESPONSE_TIMEOUT_HOURS  (défaut: 24)
LOG_LEVEL  (défaut: info)
```

---

## Points d'attention

- **Migrations** : `TYPEORM_SYNCHRONIZE=false` en prod — toujours générer et appliquer une migration explicite pour tout changement de schéma
- **DB2** : `ORDER_DB_DATA_SOURCE` injectable — utilisé dans `src/order-db/` — lecture seule
- **DTOs Whapi** : peuvent garder le snake_case (données externes)
- **Idempotence** : tout webhook handler et job BullMQ doit déduplicationner par `external_id`/`message_id` avant d'agir
- **Zéro `any`** TypeScript — point bloquant en review
- **Zéro N+1** — pas de requête dans une boucle — utiliser `leftJoinAndSelect` ou `IN (:...ids)`
