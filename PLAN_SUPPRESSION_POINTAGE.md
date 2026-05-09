# Plan de suppression — Fonctionnalité Pointage (Call Obligations)

Date : 2026-05-09

---

## Contexte

Suppression complète de la fonctionnalité de pointage des appels commerciaux
("Annulées 0/5 / Livrées 0/5 / Sans cmd 0/5") du projet, frontend, backend et admin.

---

## P0 — Migration de suppression des tables DB

Créer une migration `DropCallObligationsTables<timestamp>` qui DROP :

- `call_task`
- `commercial_obligation_batch`
- `call_event`
- `call_device`
- `call_event_unresolved`
- `order_call_sync_cursor`

Supprimer également la clé `FF_CALL_OBLIGATIONS_ENABLED` de `system_configs` :

```sql
DELETE FROM system_configs WHERE config_key = 'FF_CALL_OBLIGATIONS_ENABLED';
```

> ⚠ Cette migration s'exécute EN DERNIER, après que tout le code référençant ces entités soit supprimé.

---

## T1 — Supprimer les modules backend (feuilles d'abord)

### Modules à supprimer entièrement

#### `src/call-obligations/`
- `call-obligation.controller.ts`
- `call-obligation.module.ts`
- `call-obligation.service.ts`
- `obligation-quality-check.job.ts`
- `entities/call-task.entity.ts`
- `entities/commercial-obligation-batch.entity.ts`
- `__tests__/call-obligation.service.spec.ts`
- `__tests__/obligation-quality-check.job.spec.ts`

#### `src/order-call-sync/`
- `order-call-sync.module.ts`
- `order-call-sync.service.ts`
- `order-call-sync.job.ts`
- `order-sync-admin.controller.ts`
- `entities/call-event-unresolved.entity.ts`
- `entities/order-call-sync-cursor.entity.ts`
- `__tests__/order-call-sync.service.spec.ts`
- `__tests__/order-db-integration.setup.ts`
- `__tests__/order-db.repository.integration.spec.ts`
- `__tests__/resolve-client-category.integration.spec.ts`
- `__tests__/resolve-client-category.spec.ts`

#### `src/order-read/`
- `order-read.module.ts`
- `services/order-segmentation-read.service.ts`
- `entities/giocop-user.entity.ts`
- `entities/order-call-log.entity.ts`
- `entities/order-command-status.entity.ts`
- `entities/order-command.entity.ts`

#### `src/order-db/`
- `order-db.module.ts`
- `order-db.repository.ts`
- `order-db.constants.ts`

#### `src/call-device/` (si dossier séparé)
- `call-device.module.ts`
- `call-device.service.ts`
- `call-device.controller.ts`
- `entities/call-device.entity.ts`

### Fichiers `src/window/` à supprimer

- `src/window/entities/call-event.entity.ts`
- `src/window/entities/call-event-unresolved.entity.ts`
- `src/window/entities/call-device.entity.ts`
- `src/window/services/call-event.service.ts`

### Migrations à supprimer

Tous dans `src/database/migrations/` :

- `20260422_sprint6_call_obligations.ts`
- `20260424_order_call_sync_cursor.ts`
- `20260508_add_device_id_call_event.ts`
- `20260508_create_call_device.ts`
- `20260509_add_attribution_source_call_event.ts`
- `20260509_call_event_unique_composite.ts`
- `20260509_create_call_event_unresolved.ts`
- `20260509_normalize_call_status_lowercase.ts`

---

## T2 — Nettoyer les modules qui importent ces features

### `src/app.module.ts`

Supprimer les imports et leur usage :
- `CallObligationModule`
- `OrderDbModule`
- `OrderCallSyncModule`
- `CallDeviceModule`
- `OrderReadModule`
- Variables d'env `ORDER_DB_HOST`, `ORDER_DB_PORT`, `ORDER_DB_NAME`, `ORDER_DB_USER`, `ORDER_DB_PASSWORD`

### `src/window/window.module.ts`

Supprimer :
- Import `CallObligationModule`
- `CallEventService` des providers/exports
- `CallEvent` de `TypeOrmModule.forFeature([...])`
- `CallDevice` de `TypeOrmModule.forFeature([...])`

### `src/commercial-action-gate/commercial-action-gate.module.ts`

Supprimer :
- Import `CallObligationModule`
- Toute référence à `isObligationComplete` ou `CallObligationService`

### `src/contact/contact.module.ts`

Supprimer :
- Import `OrderReadModule`

---

## T3 — Frontend commercial (`front/`)

### Fichiers à supprimer

- `front/src/components/sidebar/ObligationProgressBar.tsx`

### Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `front/src/components/sidebar/ConversationList.tsx` (ou Sidebar) | Retirer import et rendu de `ObligationProgressBar` |
| `front/src/modules/realtime/services/socket-event-router.ts` | Supprimer handlers `call_obligation*` |
| `front/src/modules/conversations/store/conversation.store.ts` | Supprimer champs liés aux obligations |
| `front/src/store/chatStore.ts` | Supprimer références obligations |
| Tests associés | Supprimer assertions ObligationProgressBar |

---

## T4 — Admin (`admin/`)

### Fichiers à supprimer

- `admin/src/app/ui/GicopSupervisionView.tsx`
- `admin/src/app/ui/CallDevicesView.tsx`

### Fichiers à modifier

| Fichier | Action |
|---------|--------|
| Page(s) admin affichant ces vues | Retirer imports et onglets |
| `admin/src/app/lib/definitions.ts` | Supprimer types `CallObligation*`, `CallDevice*`, `SyncDiagnostics` |
| `admin/src/app/lib/api.ts` | Supprimer fonctions d'appel aux endpoints supprimés |

---

## T5 — Variables d'environnement et configuration

Supprimer des fichiers `.env`, `docker-compose.yml` et toute documentation :

- `ORDER_DB_HOST`
- `ORDER_DB_PORT`
- `ORDER_DB_NAME`
- `ORDER_DB_USER`
- `ORDER_DB_PASSWORD`

---

## Ordre d'exécution

```
T1  →  T2  →  npx tsc --noEmit (vérif)  →  T3  →  T4  →  T5  →  P0 (migration DROP)
```

### Critères de validation par étape

| Étape | Critère |
|-------|---------|
| Après T1+T2 | `npx tsc --noEmit` → 0 erreur backend |
| Après T3 | `npx tsc --noEmit` dans `front/` → 0 erreur |
| Après T4 | `npx tsc --noEmit` dans `admin/` → 0 erreur |
| Après P0 | Serveur démarre sans erreur, tables absentes en DB |

---

## Résumé des fichiers affectés

| Catégorie | Fichiers entiers supprimés | Fichiers partiellement modifiés |
|-----------|---------------------------|--------------------------------|
| Backend modules | ~36 | ~4 |
| Migrations | 8 | 0 |
| Frontend | 1 | ~5 |
| Admin | 2 | ~3 |
| **Total** | **~47** | **~12** |
