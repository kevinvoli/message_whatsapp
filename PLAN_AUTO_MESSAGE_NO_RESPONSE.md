# Plan d'implémentation — Auto-message "Sans réponse"

> **Branche cible :** feature/auto-message-no-response (depuis `master`)  
> **Date :** 2026-04-08  
> **Statut :** 🔴 À implémenter

---

## Vue d'ensemble

### Ce qui existe (mode SÉQUENCE)
Le système actuel est **event-driven** : dès qu'un message client arrive → l'`AutoMessageOrchestrator` programme un message auto après un délai aléatoire (step 1, 2, 3…). Il est piloté par la clé cron `auto-message`.

### Ce qu'on ajoute (mode SANS RÉPONSE)
Un **job CRON** qui scrute périodiquement les conversations où un message client est resté sans réponse d'un agent depuis plus de X minutes. Il envoie un message auto configurable, supporte plusieurs étapes, et respecte les filtres de scope (poste / canal).

Les deux modes **coexistent** et utilisent les mêmes templates `MessageAuto`, distingués par un nouveau champ `type`.

---

## Architecture cible

```
MessageAuto.type = 'sequence'     → déclenché par AutoMessageOrchestrator (existant)
MessageAuto.type = 'no_response'  → déclenché par NoResponseAutoMessageJob (nouveau)

MessageAuto.scope_type / scope_id → template dédié à un poste ou canal
                                    (null = global, s'applique à tout)
```

---

## Phase 1 — Entités & Migration BDD

### 1a. Modifier `MessageAuto` entity

**Fichier :** `message_whatsapp/src/message-auto/entities/message-auto.entity.ts`

Ajouts :
```ts
// Nouvel enum
export enum AutoMessageType {
  SEQUENCE    = 'sequence',    // comportement actuel
  NO_RESPONSE = 'no_response', // nouveau : déclenché si pas de réponse après X min
}

// Dans la classe MessageAuto :

@Column({
  type: 'enum',
  enum: AutoMessageType,
  default: AutoMessageType.SEQUENCE,
})
type: AutoMessageType;

// Scope dédié — null = global (s'applique à toutes les conversations)
@Column({
  name: 'scope_type',
  type: 'enum',
  enum: ['poste', 'canal'],
  nullable: true,
})
scope_type?: 'poste' | 'canal' | null;

@Column({
  name: 'scope_id',
  type: 'varchar',
  length: 100,
  nullable: true,
})
scope_id?: string | null;

@Column({
  name: 'scope_label',
  type: 'varchar',
  length: 200,
  nullable: true,
})
scope_label?: string | null;
```

**Pourquoi `scope_type/scope_id` sur le template plutôt que dans `conditions` JSON ?**  
→ `conditions` est un blob JSON non indexé. Les nouvelles colonnes sont indexables et permettent des requêtes SQL directes dans le job.

### 1b. Modifier `CronConfig` entity

**Fichier :** `message_whatsapp/src/jorbs/entities/cron-config.entity.ts`

Ajouts dans la section "Champs spécifiques" :
```ts
// ──────────────── Champs spécifiques no-response-auto-message ────────────────

/** Seuil en minutes sans réponse avant déclenchement (key = 'no-response-auto-message') */
@Column({ name: 'no_response_threshold_minutes', type: 'int', nullable: true })
noResponseThresholdMinutes: number | null;

/** Nb max d'étapes no-response avant arrêt (key = 'no-response-auto-message') */
// Réutilise maxSteps — déjà présent dans l'entité ✅

/** Appliquer aux conversations read_only=true ? (key = 'no-response-auto-message') */
@Column({ name: 'apply_to_read_only', type: 'boolean', nullable: true, default: false })
applyToReadOnly: boolean | null;

/** Appliquer aux conversations fermées ? (key = 'no-response-auto-message') */
@Column({ name: 'apply_to_closed', type: 'boolean', nullable: true, default: false })
applyToClosed: boolean | null;
```

### 1c. Modifier `WhatsappChat` entity

**Fichier :** `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

Ajout :
```ts
@Column({
  name: 'no_response_auto_step',
  type: 'int',
  default: 0,
})
no_response_auto_step: number;

@Column({
  name: 'last_no_response_auto_sent_at',
  type: 'timestamp',
  nullable: true,
})
last_no_response_auto_sent_at: Date | null;
```

### 1d. Migration BDD

**Fichier :** `message_whatsapp/src/database/migrations/20260408_no_response_auto_message.ts`

```sql
-- MessageAuto
ALTER TABLE messages_predefinis
  ADD COLUMN type ENUM('sequence','no_response') NOT NULL DEFAULT 'sequence',
  ADD COLUMN scope_type ENUM('poste','canal') NULL,
  ADD COLUMN scope_id VARCHAR(100) NULL,
  ADD COLUMN scope_label VARCHAR(200) NULL;

-- CronConfig
ALTER TABLE cron_config
  ADD COLUMN no_response_threshold_minutes INT NULL,
  ADD COLUMN apply_to_read_only BOOLEAN NULL DEFAULT FALSE,
  ADD COLUMN apply_to_closed BOOLEAN NULL DEFAULT FALSE;

-- WhatsappChat
ALTER TABLE whatsapp_chat
  ADD COLUMN no_response_auto_step INT NOT NULL DEFAULT 0,
  ADD COLUMN last_no_response_auto_sent_at TIMESTAMP NULL;
```

---

## Phase 2 — DTOs & CronConfig

### 2a. DTO `CreateMessageAutoDto`

**Fichier :** `message_whatsapp/src/message-auto/dto/create-message-auto.dto.ts`

Ajouts :
```ts
@IsOptional()
@IsEnum(AutoMessageType)
type?: AutoMessageType;

@IsOptional()
@IsIn(['poste', 'canal'])
scope_type?: 'poste' | 'canal';

@IsOptional()
@IsString()
scope_id?: string;

@IsOptional()
@IsString()
scope_label?: string;
```

### 2b. DTO `UpdateCronConfigDto`

**Fichier :** `message_whatsapp/src/jorbs/dto/update-cron-config.dto.ts`

Ajouts :
```ts
@IsOptional()
@IsInt()
@Min(1)
noResponseThresholdMinutes?: number;

@IsOptional()
@IsBoolean()
applyToReadOnly?: boolean;

@IsOptional()
@IsBoolean()
applyToClosed?: boolean;
```

### 2c. `CronConfigService` — Nouveau défaut & validation

**Fichier :** `message_whatsapp/src/jorbs/cron-config.service.ts`

Ajout dans `CRON_DEFAULTS` :
```ts
'no-response-auto-message': {
  label: 'Message auto — Sans réponse commerciale',
  description:
    "Envoie un message automatique si le client n'a pas reçu de réponse depuis plus de X minutes. " +
    "Supporte plusieurs étapes (position 1, 2, 3...) avec tirage aléatoire si plusieurs templates actifs. " +
    "Configurable par poste et par canal.",
  enabled: false,
  scheduleType: 'interval',
  intervalMinutes: 10,               // fréquence du scan
  noResponseThresholdMinutes: 60,    // 1h sans réponse = déclenchement
  maxSteps: 1,                       // 1 seule relance par défaut
  applyToReadOnly: false,
  applyToClosed: false,
  cronExpression: null,
  ttlDays: null,
  delayMinSeconds: null,
  delayMaxSeconds: null,
},
```

Ajout dans `update()` — bloc de mise à jour :
```ts
if (dto.noResponseThresholdMinutes !== undefined) config.noResponseThresholdMinutes = dto.noResponseThresholdMinutes;
if (dto.applyToReadOnly !== undefined) config.applyToReadOnly = dto.applyToReadOnly;
if (dto.applyToClosed !== undefined) config.applyToClosed = dto.applyToClosed;
```

---

## Phase 3 — Méthode de sélection du template dans `MessageAutoService`

**Fichier :** `message_whatsapp/src/message-auto/message-auto.service.ts`

Nouvelle méthode :
```ts
/**
 * Récupère un template no_response actif pour une conversation donnée.
 * Priorité : template scopé (poste > canal) > template global.
 * Tirage aléatoire si plusieurs templates au même niveau.
 */
async getNoResponseTemplate(
  step: number,
  posteId?: string | null,
  channelId?: string | null,
): Promise<MessageAuto | null>
```

Logique :
1. Charger tous les `MessageAuto` actifs avec `type = no_response` ET `position = step`
2. Filtrer en priorité :
   - Templates scopés `scope_type='poste'` ET `scope_id = posteId` → pool prioritaire
   - Si pool vide → templates scopés `scope_type='canal'` ET `scope_id = channelId`
   - Si pool vide → templates globaux (`scope_type IS NULL`)
3. Tirage aléatoire dans le pool retenu

---

## Phase 4 — Job `NoResponseAutoMessageJob`

**Fichier nouveau :** `message_whatsapp/src/jorbs/no-response-auto-message.job.ts`

### Enregistrement cron
```ts
onModuleInit(): void {
  this.cronConfigService.registerHandler('no-response-auto-message', () => this.run());
  this.cronConfigService.registerPreviewHandler('no-response-auto-message', () => this.preview());
}
```

### Méthode `run()` — Logique complète

```
1. Charger config 'no-response-auto-message' — si disabled → stop
2. Vérifier plage horaire (5h–21h) — hors plage → stop
3. Construire la requête WhatsappChat :
   WHERE :
     last_client_message_at IS NOT NULL
     AND (last_poste_message_at IS NULL OR last_client_message_at > last_poste_message_at)
     AND (
       -- étape 0 → pas encore envoyé pour ce cycle client
       (no_response_auto_step = 0 AND last_client_message_at <= NOW() - threshold)
       OR
       -- étape > 0 → dernier envoi auto fait il y a plus de threshold
       (no_response_auto_step > 0
         AND last_no_response_auto_sent_at IS NOT NULL
         AND last_no_response_auto_sent_at <= NOW() - threshold
         AND last_no_response_auto_sent_at >= last_client_message_at)
     )
     AND no_response_auto_step < maxSteps
     -- Filtre fenêtre WhatsApp 23h
     AND last_client_message_at >= NOW() - INTERVAL 23 HOUR
     -- Filtres configurables :
     AND (applyToReadOnly = true OR read_only = false)
     AND (applyToClosed = true OR status != 'fermé')
4. Pour chaque chat trouvé :
   a. Scope check via AutoMessageScopeConfigService.isEnabledFor()
   b. getNoResponseTemplate(step + 1, posteId, channelId)
   c. Si template trouvé → envoyer via messageAutoService.sendNoResponseAutoMessage()
   d. Mettre à jour : no_response_auto_step++, last_no_response_auto_sent_at = NOW()
5. Mettre à jour lastRunAt
```

### Réinitialisation du cycle

La réinitialisation de `no_response_auto_step` se fait dans le service `WhatsappChatService` lors de la mise à jour de `last_poste_message_at` : quand un agent répond → `no_response_auto_step = 0`, `last_no_response_auto_sent_at = null`.

### Méthode `preview()` — Aperçu sans action

Retourne la liste des conversations qui seraient ciblées lors du prochain passage.

---

## Phase 5 — Méthode d'envoi dédiée dans `MessageAutoService`

```ts
async sendNoResponseAutoMessage(chatId: string, step: number): Promise<void>
```

Similaire à `sendAutoMessage()` mais :
- Utilise `getNoResponseTemplate()` au lieu de `getAutoMessageByPosition()`
- Ne modifie pas `auto_message_step` / `auto_message_status` (champs séquence)
- Met à jour `no_response_auto_step` et `last_no_response_auto_sent_at`
- Pas de `read_only = true` après envoi (sauf config)

---

## Phase 6 — Module `jorbs.module.ts`

**Fichier :** `message_whatsapp/src/jorbs/jorbs.module.ts`

- Importer et déclarer `NoResponseAutoMessageJob`
- Ajouter `WhatsappChat` dans les imports TypeORM si pas déjà présent

---

## Phase 7 — Réinitialisation dans `WhatsappChatService`

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

Lors de l'appel à `update()` avec `last_poste_message_at` → ajouter automatiquement :
```ts
no_response_auto_step: 0,
last_no_response_auto_sent_at: null,
```
Ainsi dès qu'un agent répond, le cycle no-response repart de zéro pour ce client.

---

## Phase 8 — Admin UI

### 8a. Mise à jour des types TypeScript admin

**Fichier :** `admin/src/app/lib/definitions.ts`

```ts
// Ajout dans MessageAuto
export type AutoMessageType = 'sequence' | 'no_response';

export interface MessageAuto {
  // ...existant...
  type: AutoMessageType;
  scope_type?: 'poste' | 'canal' | null;
  scope_id?: string | null;
  scope_label?: string | null;
}

// Ajout dans CronConfig
export interface CronConfig {
  // ...existant...
  noResponseThresholdMinutes?: number | null;
  applyToReadOnly?: boolean | null;
  applyToClosed?: boolean | null;
}

// Ajout dans UpdateCronConfigPayload
export interface UpdateCronConfigPayload {
  // ...existant...
  noResponseThresholdMinutes?: number;
  applyToReadOnly?: boolean;
  applyToClosed?: boolean;
}
```

### 8b. `MessageAutoView.tsx` — Refonte en 2 onglets

Structure :
```
[Onglet "Séquence"]  [Onglet "Sans réponse"]
```

**Onglet Séquence** = comportement actuel (inchangé)

**Onglet Sans réponse** :
- Panneau config `NoResponseConfigPanel` (analogue à `GlobalConfigPanel`) :
  - Toggle activer/désactiver
  - Input : seuil en minutes (défaut 60)
  - Input : nb max d'étapes (défaut 1)
  - Input : intervalle scan en minutes (défaut 10)
  - Toggle : appliquer aux conversations `read_only` ?
  - Toggle : appliquer aux conversations fermées ?
  - Badge : dernière exécution (`lastRunAt`)
  - Bouton "Aperçu" → liste les conversations actuellement ciblées
- Table des templates `no_response` avec CRUD complet
- Badge "Scope" sur chaque template (global / dédié poste / dédié canal)

### 8c. Formulaire template — Nouveaux champs

Dans `MessageAutoFormFields` — ajout conditionnel selon l'onglet actif :

```tsx
{/* Champ type — caché, défini par l'onglet */}

{/* Scope dédié */}
<div>
  <label>Dédié à</label>
  <select value={scope_type ?? ''} onChange={...}>
    <option value="">Tous (global)</option>
    <option value="poste">Un poste spécifique</option>
    <option value="canal">Un canal spécifique</option>
  </select>
</div>

{scope_type === 'poste' && (
  <select value={scope_id} onChange={...}>
    {postes.map(p => <option value={p.id}>{p.nom}</option>)}
  </select>
)}

{scope_type === 'canal' && (
  <select value={scope_id} onChange={...}>
    {channels.map(c => <option value={c.channel_id}>{c.name}</option>)}
  </select>
)}
```

---

## Ordre d'implémentation recommandé

| # | Étape | Fichiers | Durée estimée |
|---|-------|----------|---------------|
| 1 | Migration BDD + entités | entity MessageAuto, CronConfig, WhatsappChat | Court |
| 2 | DTOs + CronConfigService défaut | dto/, cron-config.service.ts | Court |
| 3 | Méthode `getNoResponseTemplate()` | message-auto.service.ts | Court |
| 4 | Méthode `sendNoResponseAutoMessage()` | message-auto.service.ts | Moyen |
| 5 | Job `NoResponseAutoMessageJob` | jorbs/ | Moyen |
| 6 | Réinitialisation dans WhatsappChatService | whatsapp_chat.service.ts | Court |
| 7 | Module jorbs.module.ts | jorbs.module.ts | Court |
| 8 | Types admin (definitions.ts) | admin/lib/definitions.ts | Court |
| 9 | UI admin — onglets + formulaire | MessageAutoView.tsx | Long |
| 10 | Tests | *.spec.ts | Moyen |

---

## Options de paramétrage — Récapitulatif complet

| Option | Statut dans ce plan | Implémentation |
|--------|--------------------|-|
| **Scope par canal** (n'envoyer qu'aux conversations d'un canal donné) | ✅ Inclus | `AutoMessageScopeConfigService.isEnabledFor()` — déjà en place, réutilisé tel quel dans le job |
| **Scope par poste** (n'envoyer qu'aux conversations d'un poste donné) | ✅ Inclus | Même mécanisme — `AutoMessageScopeConfig` scope_type=POSTE |
| **Template par canal / poste** (message différent selon le canal ou poste) | ✅ Inclus | `MessageAuto.scope_type` + `scope_id` — Phase 1a + Phase 3 |
| **Plage horaire configurable** (remplacer le hard-code 5h–21h par un paramètre UI) | ✅ Inclus | Voir Phase 9 ci-dessous |
| **Seuil par scope** (seuil différent selon le poste ou canal) | 🟡 Extension future | Voir Phase 10 ci-dessous — table dédiée, hors scope v1 |

---

## Phase 9 — Plage horaire configurable

> **Actuellement :** la plage 5h–21h est hard-codée dans le job.  
> **Objectif :** la rendre configurable via le dashboard admin.

### 9a. Ajout sur `CronConfig`

**Fichier :** `message_whatsapp/src/jorbs/entities/cron-config.entity.ts`

```ts
/** Heure de début d'activité (0–23) — s'applique aux jobs avec plage horaire */
@Column({ name: 'active_hour_start', type: 'int', nullable: true, default: 5 })
activeHourStart: number | null;

/** Heure de fin d'activité (0–23) — s'applique aux jobs avec plage horaire */
@Column({ name: 'active_hour_end', type: 'int', nullable: true, default: 21 })
activeHourEnd: number | null;
```

Ajout dans le défaut `no-response-auto-message` :
```ts
activeHourStart: 5,
activeHourEnd: 21,
```

Ajout dans `UpdateCronConfigDto` :
```ts
@IsOptional() @IsInt() @Min(0) @Max(23) activeHourStart?: number;
@IsOptional() @IsInt() @Min(0) @Max(23) activeHourEnd?: number;
```

Validation dans `CronConfigService.update()` : si `activeHourStart >= activeHourEnd` → `BadRequestException`.

### 9b. Job — Utiliser les valeurs DB

Dans `NoResponseAutoMessageJob.run()`, remplacer :
```ts
const hour = new Date().getHours();
if (hour >= 21 || hour < 5) return;
```
Par :
```ts
const start = config.activeHourStart ?? 5;
const end   = config.activeHourEnd   ?? 21;
const hour  = new Date().getHours();
if (hour < start || hour >= end) return;
```

### 9c. UI admin — Champs dans `NoResponseConfigPanel`

```tsx
<div className="flex gap-4">
  <div>
    <label>Heure de début</label>
    <input type="number" min={0} max={23} value={activeHourStart} onChange={...} />
  </div>
  <div>
    <label>Heure de fin</label>
    <input type="number" min={1} max={23} value={activeHourEnd} onChange={...} />
  </div>
</div>
<p className="text-xs text-gray-400">
  Le job ne s'exécutera qu'entre {activeHourStart}h et {activeHourEnd}h.
</p>
```

Migration :
```sql
ALTER TABLE cron_config
  ADD COLUMN active_hour_start INT NULL DEFAULT 5,
  ADD COLUMN active_hour_end   INT NULL DEFAULT 21;
```

---

## Phase 10 — Extension future : Seuil par scope

> **Complexité élevée — hors scope v1.**  
> Permet de définir un seuil de délai différent selon le poste ou le canal (ex: poste "VIP" → 30 min, canal "WhatsApp" → 2h).

### Architecture cible

Nouvelle table `no_response_scope_threshold` :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | PK |
| `scope_type` | enum('poste','canal') | Type de scope |
| `scope_id` | varchar(100) | ID du poste ou canal |
| `scope_label` | varchar(200) | Libellé affiché |
| `threshold_minutes` | int | Seuil spécifique en minutes |
| `enabled` | boolean | Actif ou non |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

Index unique sur `(scope_type, scope_id)`.

### Logique dans le job

Dans `NoResponseAutoMessageJob.run()`, avant de filtrer les conversations :
1. Charger tous les overrides de seuil depuis `no_response_scope_threshold`
2. Pour chaque conversation, calculer le seuil effectif :
   - Override poste → prioritaire
   - Override canal → secondaire
   - Config globale → fallback
3. Ne cibler que les conversations où `last_client_message_at <= NOW() - seuil_effectif`

### Quand implémenter

Uniquement si le besoin métier est confirmé après la v1.  
La v1 (seuil global configurable) couvre la majorité des cas d'usage.

---

## Règles métier clés

| Règle | Description |
|-------|-------------|
| **Fenêtre 23h** | Jamais envoyer si `last_client_message_at` > 23h (règle WhatsApp) |
| **Plage horaire** | Job actif uniquement entre 5h et 21h |
| **Anti double-envoi** | `last_no_response_auto_sent_at >= last_client_message_at` → déjà traité |
| **Priorité scope template** | Poste scopé > Canal scopé > Global |
| **Tirage aléatoire** | Parmi les templates du même niveau de priorité et même step |
| **Réinitialisation cycle** | Dès qu'un agent répond → `no_response_auto_step = 0` |
| **Indépendance des modes** | Séquence et no_response n'interfèrent pas entre eux |
| **Scope global = autorisation** | `AutoMessageScopeConfigService.isEnabledFor()` s'applique aussi au mode no_response |

---

## Tests à écrire

- `no-response-auto-message.job.spec.ts` :
  - Conversations avec réponse agent → ignorées
  - Conversations sans réponse après seuil → ciblées
  - Seuil non atteint → ignorées
  - Fenêtre 23h expirée → ignorées
  - Filtre `read_only` selon config
  - Filtre `status=fermé` selon config
  - Max steps atteint → ignoré
  - Réinitialisation sur réponse agent

- `message-auto.service.spec.ts` (compléments) :
  - `getNoResponseTemplate()` : priorité poste > canal > global
  - `getNoResponseTemplate()` : tirage aléatoire dans le pool
  - `getNoResponseTemplate()` : aucun template → null
