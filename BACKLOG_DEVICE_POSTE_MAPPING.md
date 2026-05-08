# BACKLOG — Association device_id ↔ poste

**Contexte :** Chaque téléphone physique de l'entreprise possède un `device_id` présent dans la colonne `device_id` de la table `call_logs` (DB2). Actuellement, ce champ n'est pas capturé dans DB1. L'objectif est de :

1. Propager `device_id` dans `call_event` (DB1) lors de chaque sync DB2→DB1
2. Auto-découvrir tous les appareils actifs en groupant `call_event` par `device_id`
3. Permettre à l'admin d'associer manuellement chaque device à un poste (`channel.poste_id`)
4. Utiliser cette association comme fallback dans le matching des obligations appels

---

## Tickets

| Ticket | Titre | Effort | Statut |
|--------|-------|--------|--------|
| D1 | `device_id` dans `call_event` — migration + entité | XS | ✅ Code livré · ✅ Migration déployée |
| D2 | Passer `device_id` dans `ingestFromDb2()` | XS | ✅ Livré |
| D3 | Table `call_device` + entité — annuaire des appareils | S | ✅ Code livré · ✅ Migration déployée |
| D4 | Auto-découverte devices dans la sync | S | ✅ Livré |
| D5 | Endpoints admin device-poste | S | ✅ Livré |
| D6 | Vue admin `CallDevicesView.tsx` | M | ✅ Livré |
| D7 | Fallback device→poste dans `matchObligation()` | S | ✅ Livré |

---

## D1 — `device_id` dans `call_event` (migration + entité)

**Fichiers impactés :**
- `src/window/entities/call-event.entity.ts`
- `src/migrations/` → nouvelle migration

**Actions :**
- Ajouter colonne `device_id VARCHAR(64) NULL` à la table `call_event`
- Ajouter `@Column({ name: 'device_id', nullable: true })` dans l'entité `CallEvent`
- Créer une migration TypeORM (ex : `AddDeviceIdToCallEvent1746700000001`)

---

## D2 — Passer `device_id` dans `ingestFromDb2()`

**Fichiers impactés :**
- `src/window/services/call-event.service.ts`
- `src/order-call-sync/order-call-sync.service.ts`
- `src/order-read/entities/order-call-log.entity.ts`

**Actions :**
- Vérifier que `device_id` est mappé dans l'entité `OrderCallLog` (colonne DB2)
- Ajouter `deviceId?: string` dans le type de paramètre de `ingestFromDb2()`
- Mapper `device_id: params.deviceId ?? null` dans le `.values({...})`
- Dans `syncNewCalls()`, passer `deviceId: call.deviceId` au call de `ingestFromDb2()`

> **Important :** La sync doit lire **tous les types d'appels** (outgoing, missed, incoming) pour constituer l'inventaire complet des devices. Le filtre `isEligibleForObligation()` reste uniquement sur la partie matching obligations.

---

## D3 — Table `call_device` + entité

**Fichiers à créer :**
- `src/call-device/entities/call-device.entity.ts`
- `src/migrations/` → migration `CreateCallDevice1746700000002`

**Schéma de la table `call_device` :**

```sql
CREATE TABLE call_device (
  id          VARCHAR(36)  PRIMARY KEY,
  device_id   VARCHAR(64)  NOT NULL UNIQUE,  -- identifiant issu de DB2
  label       VARCHAR(128) NULL,             -- libellé libre (ex: "Poste Bureau 12")
  poste_id    VARCHAR(64)  NULL,             -- référence au canal/poste DB1
  first_seen  DATETIME     NOT NULL,         -- date du 1er appel observé
  last_seen   DATETIME     NOT NULL,         -- date du dernier appel observé
  call_count  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## D4 — Auto-découverte devices dans la sync

**Fichiers impactés :**
- `src/order-call-sync/order-call-sync.service.ts`

**Actions :**
- Après l'ingestion de chaque appel (ou en batch), faire un `UPSERT` sur `call_device` :
  - si `device_id` inconnu → INSERT avec `first_seen = last_seen = callTimestamp`
  - si déjà connu → UPDATE `last_seen`, incrémenter `call_count`
- Utiliser `INSERT INTO call_device ... ON DUPLICATE KEY UPDATE` via QueryBuilder ou `save()` avec `conflictPaths: ['device_id']`
- Cette étape ne doit PAS bloquer la sync en cas d'erreur (try/catch silencieux + log)

---

## D5 — Endpoints admin device-poste

**Fichiers à créer / modifier :**
- `src/call-device/call-device.controller.ts` (ou dans `order-sync-admin.controller.ts`)
- `src/call-device/call-device.service.ts`
- `src/call-device/call-device.module.ts`

**Endpoints :**

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/admin/call-devices` | Liste tous les devices avec poste_id et statistiques |
| `PATCH` | `/admin/call-devices/:deviceId` | Associe un poste (body: `{ poste_id, label }`) |
| `DELETE` | `/admin/call-devices/:deviceId/poste` | Dissocie le poste d'un device |

---

## D6 — Vue admin `CallDevicesView.tsx`

**Fichiers à créer :**
- `admin/src/app/ui/CallDevicesView.tsx`

**Fonctionnalités :**
- Tableau des devices : `device_id`, `label`, `poste_id` associé, `last_seen`, `call_count`
- Badge "Non associé" en rouge si `poste_id = null`
- Sélecteur de poste (liste déroulante des canaux existants) par ligne
- Bouton "Enregistrer" par ligne — appel `PATCH /admin/call-devices/:id`
- Champ libre "Label" pour nommer chaque appareil
- Filtre rapide : "Tous / Non associés / Associés"
- Intégration dans `IntegrationView.tsx` comme nouvel onglet "Appareils"

---

## D7 — Fallback device→poste dans `matchObligation()`

**Fichiers impactés :**
- `src/order-call-sync/order-call-sync.service.ts`
- `src/call-obligations/call-obligation.service.ts`

**Logique :**

```
Si idCommercialDb2 est null ET localNumber ne matche aucun commercial
  → chercher call_device.poste_id via device_id
  → si poste_id trouvé → récupérer le commercial associé au canal (channel.poste_id)
  → passer commercialId résolu à tryMatchCallToTask()
```

**Priorité de résolution du commercial :**
1. `id_commercial` DB2 → `CommercialIdentityMapping` → UUID DB1
2. `local_number` → `WhatsappCommercial.phone` → UUID DB1
3. `device_id` → `CallDevice.poste_id` → `Channel` → commercial affecté

---

## Prérequis

- La colonne `device_id` doit exister dans `call_logs` DB2 (à confirmer avec l'équipe DB2)
- Lire **tous** les `call_type` (outgoing, missed, incoming) dans `syncNewCalls()` — actuellement OK, aucun filtre de type dans la requête QueryBuilder
- L'entité `OrderCallLog` doit exposer `deviceId` (à vérifier / ajouter si absent)

---

## Ordre d'implémentation recommandé

```
D1 → D2 → D3 → D4   (infrastructure, déployable ensemble)
           ↓
          D5 → D6    (admin UI, déployable en 2e itération)
                ↓
               D7    (logique métier, après validation du mapping en production)
```
