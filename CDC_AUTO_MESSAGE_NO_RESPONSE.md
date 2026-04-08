# Cahier des Charges — Système de Messages Automatiques Avancé
# Système de Tickets d'Implémentation

> **Projet :** WhatsApp CRM — Refonte & Extension du système auto-message  
> **Date :** 2026-04-08  
> **Branche cible :** `feature/auto-message-advanced` (depuis `master`)

---

## Vue d'ensemble fonctionnelle

Le système de messages automatiques existant ne gère qu'un seul déclencheur : le **nouveau contact** (séquence step 1, 2, 3…). Ce CDC étend le système pour supporter **9 critères de déclenchement** distincts, tous gérés par **un unique job CRON maître** qui s'exécute à intervalle configurable et vérifie séquentiellement chaque trigger activé.

### Les 9 critères de déclenchement

| ID | Critère | Description |
|----|---------|-------------|
| **A** | **Sans réponse** | Le client attend depuis X minutes sans réponse agent |
| **B** | **Nouveau contact** *(existant)* | Premier message — séquence step 1, 2, 3… |
| **C** | **Hors horaires** | Le client écrit en dehors des horaires d'ouverture |
| **D** | **Réouverture** | Le client réécrit après qu'une conversation a été fermée |
| **E** | **Attente en queue** | Le client non assigné attend depuis plus de X minutes |
| **F** | **Mot-clé détecté** | Le dernier message client contient un mot-clé configuré |
| **G** | **Type de client** | Message différent selon si c'est un nouveau client ou un client connu |
| **H** | **Inactivité totale** | Aucune activité des deux côtés depuis X minutes |
| **I** | **Après assignation** | Message envoyé quand un agent est assigné à la conversation |

---

## Architecture — Un seul CRON maître

### Principe

Tous les triggers sont vérifiés par **un unique job CRON** (`AutoMessageMasterJob`) planifié via une seule entrée `cron_config` (clé `auto-message-master`). Chaque trigger possède sa propre entrée `cron_config` mais avec `scheduleType: 'config'` — ces entrées servent uniquement à stocker la configuration (seuils, enabled, etc.), elles ne planifient rien.

```
┌─────────────────────────────────────────────────────────────┐
│  CronConfig key="auto-message-master"                       │
│  scheduleType: 'interval'  intervalMinutes: 5               │
│  → déclenche AutoMessageMasterJob.run() toutes les 5 min    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  AutoMessageMasterJob.run()                                 │
│                                                             │
│  1. Charger toutes les trigger configs                      │
│  2. Vérifier plage horaire globale (activeHourStart/End)    │
│  3. Pour chaque trigger activé, dans l'ordre :              │
│     ├─ A  no_response    → requête + envoi                  │
│     ├─ C  out_of_hours   → requête + envoi                  │
│     ├─ D  reopened       → requête + envoi                  │
│     ├─ E  queue_wait     → requête + envoi                  │
│     ├─ F  keyword        → requête msgs récents + match     │
│     ├─ G  client_type    → requête + envoi                  │
│     ├─ H  inactivity     → requête + envoi                  │
│     └─ I  on_assign      → requête + envoi                  │
│                                                             │
│  Note: B (séquence) reste géré par AutoMessageOrchestrator │
│  (event-driven au webhook, non concerné par ce CRON)        │
└─────────────────────────────────────────────────────────────┘
```

### Clés CronConfig

| Clé | Rôle | `scheduleType` |
|-----|------|----------------|
| `auto-message-master` | Planification du job maître | `interval` — **seule clé schedulée** |
| `auto-message` | Config trigger B (séquence) | `event` — inchangé |
| `no-response-auto-message` | Config trigger A | `config` |
| `out-of-hours-auto-message` | Config trigger C | `config` |
| `reopened-auto-message` | Config trigger D | `config` |
| `queue-wait-auto-message` | Config trigger E | `config` |
| `keyword-auto-message` | Config trigger F | `config` |
| `client-type-auto-message` | Config trigger G | `config` |
| `inactivity-auto-message` | Config trigger H | `config` |
| `on-assign-auto-message` | Config trigger I | `config` |

### Détection polling pour les triggers "événementiels"

Les triggers C, D, F, G, I sont naturellement événementiels mais sont traités ici en mode polling. Chaque passage du CRON maître inspecte une **fenêtre glissante** (= `intervalMinutes * 2` pour absorber les retards éventuels) :

| Trigger | Condition de ciblage polling |
|---------|------------------------------|
| C — Hors horaires | `last_client_message_at` dans la fenêtre glissante + hors horaires + `out_of_hours_auto_sent = false` |
| D — Réouverture | `reopened_at` dans la fenêtre glissante + `reopened_auto_sent = false` |
| F — Mot-clé | `last_client_message_at` dans la fenêtre glissante + dernier message contient keyword + `keyword_auto_sent_at < last_client_message_at` |
| G — Type client | `last_client_message_at` dans la fenêtre glissante + `client_type_auto_sent = false` |
| I — Après assignation | `assigned_at` dans la fenêtre glissante + `on_assign_auto_sent = false` |

---

## Épiques

| Épique | Périmètre | Tickets |
|--------|-----------|---------|
| **E1** | BDD & Entités | AM-01 → AM-07 |
| **E2** | Backend — Logique commune | AM-08 → AM-11 |
| **E3** | Backend — Job CRON maître | AM-12 → AM-14 |
| **E4** | Backend — Module & Réinitialisation | AM-15 → AM-16 |
| **E5** | Admin UI | AM-17 → AM-24 |
| **E6** | Tests | AM-25 → AM-28 |

---
---

# ÉPIQUE E1 — BDD & Entités

---

## AM-01 — Migration BDD globale

**Type :** Migration  
**Priorité :** 🔴 Critique — bloquant pour tous les autres tickets  
**Dépendances :** aucune  
**Fichier :** `message_whatsapp/src/database/migrations/20260408_auto_message_advanced.ts`

### Table `messages_predefinis` (`MessageAuto`)

| Colonne | Type SQL | Nullable | Défaut | Description |
|---------|----------|----------|--------|-------------|
| `trigger_type` | `ENUM('sequence','no_response','out_of_hours','reopened','queue_wait','keyword','client_type','inactivity','on_assign')` | NON | `'sequence'` | Critère de déclenchement |
| `scope_type` | `ENUM('poste','canal')` | OUI | NULL | Restriction de périmètre |
| `scope_id` | `VARCHAR(100)` | OUI | NULL | ID du poste ou canal ciblé |
| `scope_label` | `VARCHAR(200)` | OUI | NULL | Libellé lisible |
| `client_type_target` | `ENUM('new','returning','all')` | OUI | `'all'` | Trigger G : cibler nouveau ou connu |

### Table `cron_config`

| Colonne | Type SQL | Nullable | Défaut | Description |
|---------|----------|----------|--------|-------------|
| `no_response_threshold_minutes` | `INT` | OUI | NULL | Seuil trigger A |
| `queue_wait_threshold_minutes` | `INT` | OUI | NULL | Seuil trigger E |
| `inactivity_threshold_minutes` | `INT` | OUI | NULL | Seuil trigger H |
| `apply_to_read_only` | `BOOLEAN` | OUI | FALSE | Inclure conversations verrouillées |
| `apply_to_closed` | `BOOLEAN` | OUI | FALSE | Inclure conversations fermées |
| `active_hour_start` | `INT` | OUI | 5 | Heure de début du job maître |
| `active_hour_end` | `INT` | OUI | 21 | Heure de fin du job maître |

> **Note :** `active_hour_start` / `active_hour_end` sont portés **uniquement** sur la clé `auto-message-master` et s'appliquent à tous les triggers. Pas de plage horaire individuelle par trigger.

### Table `whatsapp_chat`

| Colonne | Type SQL | Nullable | Défaut | Description |
|---------|----------|----------|--------|-------------|
| `no_response_auto_step` | `INT` | NON | 0 | Étape — trigger A |
| `last_no_response_auto_sent_at` | `TIMESTAMP` | OUI | NULL | Dernier envoi — trigger A |
| `out_of_hours_auto_sent` | `BOOLEAN` | NON | FALSE | Envoi hors-horaires — trigger C |
| `reopened_at` | `TIMESTAMP` | OUI | NULL | Date de réouverture — trigger D |
| `reopened_auto_sent` | `BOOLEAN` | NON | FALSE | Envoi réouverture — trigger D |
| `queue_wait_auto_step` | `INT` | NON | 0 | Étape — trigger E |
| `last_queue_wait_auto_sent_at` | `TIMESTAMP` | OUI | NULL | Dernier envoi — trigger E |
| `keyword_auto_sent_at` | `TIMESTAMP` | OUI | NULL | Dernier envoi mot-clé — trigger F |
| `client_type_auto_sent` | `BOOLEAN` | NON | FALSE | Envoi type-client — trigger G |
| `is_known_client` | `BOOLEAN` | OUI | NULL | NULL=inconnu, TRUE=connu, FALSE=nouveau |
| `inactivity_auto_step` | `INT` | NON | 0 | Étape — trigger H |
| `last_inactivity_auto_sent_at` | `TIMESTAMP` | OUI | NULL | Dernier envoi — trigger H |
| `on_assign_auto_sent` | `BOOLEAN` | NON | FALSE | Envoi après assignation — trigger I |

### Nouvelle table `auto_message_keyword`

| Colonne | Type SQL | Nullable | Défaut | Description |
|---------|----------|----------|--------|-------------|
| `id` | `UUID` | NON | — | PK |
| `keyword` | `VARCHAR(100)` | NON | — | Mot ou phrase déclencheur |
| `match_type` | `ENUM('exact','contains','starts_with')` | NON | `'contains'` | Mode de correspondance |
| `case_sensitive` | `BOOLEAN` | NON | FALSE | Sensible à la casse |
| `message_auto_id` | `UUID` | NON | — | FK → `messages_predefinis.id` ON DELETE CASCADE |
| `actif` | `BOOLEAN` | NON | TRUE | Activer/désactiver |
| `created_at` | `TIMESTAMP` | NON | NOW() | |
| `updated_at` | `TIMESTAMP` | NON | NOW() | |

### Nouvelle table `business_hours_config`

| Colonne | Type SQL | Nullable | Défaut | Description |
|---------|----------|----------|--------|-------------|
| `id` | `UUID` | NON | — | PK |
| `day_of_week` | `TINYINT` | NON | — | 0=Dimanche … 6=Samedi (unique) |
| `open_hour` | `INT` | NON | 8 | Heure d'ouverture |
| `open_minute` | `INT` | NON | 0 | Minute d'ouverture |
| `close_hour` | `INT` | NON | 18 | Heure de fermeture |
| `close_minute` | `INT` | NON | 0 | Minute de fermeture |
| `is_open` | `BOOLEAN` | NON | TRUE | Ouvert ce jour |
| `created_at` | `TIMESTAMP` | NON | NOW() | |
| `updated_at` | `TIMESTAMP` | NON | NOW() | |

### Critères d'acceptation

- [ ] Migration exécutée sans erreur sur base propre
- [ ] Migration réversible (`down()` restaure l'état initial)
- [ ] `messages_predefinis` existants ont `trigger_type = 'sequence'`
- [ ] `whatsapp_chat` existants ont tous les nouveaux champs à leur valeur par défaut
- [ ] `business_hours_config` initialisée avec 7 lignes : lun–ven 8h–18h ouvert, sam–dim fermé
- [ ] Index unique sur `business_hours_config.day_of_week`

---

## AM-02 — Entité `MessageAuto` : `trigger_type`, scope & ciblage client

**Type :** Enhancement  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-01  
**Fichier :** `message_whatsapp/src/message-auto/entities/message-auto.entity.ts`

### Changements

```ts
export enum AutoMessageTriggerType {
  SEQUENCE     = 'sequence',
  NO_RESPONSE  = 'no_response',
  OUT_OF_HOURS = 'out_of_hours',
  REOPENED     = 'reopened',
  QUEUE_WAIT   = 'queue_wait',
  KEYWORD      = 'keyword',
  CLIENT_TYPE  = 'client_type',
  INACTIVITY   = 'inactivity',
  ON_ASSIGN    = 'on_assign',
}

// Champs à ajouter dans la classe MessageAuto :

@Column({ type: 'enum', enum: AutoMessageTriggerType, default: AutoMessageTriggerType.SEQUENCE })
trigger_type: AutoMessageTriggerType;

@Column({ name: 'scope_type', type: 'enum', enum: ['poste', 'canal'], nullable: true })
scope_type?: 'poste' | 'canal' | null;

@Column({ name: 'scope_id', type: 'varchar', length: 100, nullable: true })
scope_id?: string | null;

@Column({ name: 'scope_label', type: 'varchar', length: 200, nullable: true })
scope_label?: string | null;

@Column({
  name: 'client_type_target',
  type: 'enum',
  enum: ['new', 'returning', 'all'],
  default: 'all',
  nullable: true,
})
client_type_target?: 'new' | 'returning' | 'all' | null;

@OneToMany(() => AutoMessageKeyword, (k) => k.messageAuto, { cascade: true, eager: false })
keywords?: AutoMessageKeyword[];
```

### Critères d'acceptation

- [ ] Entité compile sans erreur TypeScript
- [ ] Templates existants ont `trigger_type = 'sequence'`
- [ ] Relation `keywords` fonctionnelle avec cascade delete

---

## AM-03 — Entité `CronConfig` : champs master & seuils multi-triggers

**Type :** Enhancement  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-01  
**Fichier :** `message_whatsapp/src/jorbs/entities/cron-config.entity.ts`

### Changements

```ts
// ──────────── Seuils par trigger (portés sur chaque clé trigger) ──────────

@Column({ name: 'no_response_threshold_minutes', type: 'int', nullable: true })
noResponseThresholdMinutes: number | null;

@Column({ name: 'queue_wait_threshold_minutes', type: 'int', nullable: true })
queueWaitThresholdMinutes: number | null;

@Column({ name: 'inactivity_threshold_minutes', type: 'int', nullable: true })
inactivityThresholdMinutes: number | null;

// ──────────── Filtres (portés sur les clés trigger qui en ont besoin) ─────

@Column({ name: 'apply_to_read_only', type: 'boolean', nullable: true, default: false })
applyToReadOnly: boolean | null;

@Column({ name: 'apply_to_closed', type: 'boolean', nullable: true, default: false })
applyToClosed: boolean | null;

// ──────────── Plage horaire globale (portée uniquement sur auto-message-master) ──

@Column({ name: 'active_hour_start', type: 'int', nullable: true, default: 5 })
activeHourStart: number | null;

@Column({ name: 'active_hour_end', type: 'int', nullable: true, default: 21 })
activeHourEnd: number | null;
```

### Ajout du `scheduleType` enum

Ajouter `'config'` à l'enum `CronScheduleType` :
```ts
export type CronScheduleType = 'interval' | 'cron' | 'event' | 'config';
```

`'config'` = entrée de configuration pure, jamais schedulée par `CronConfigService.scheduleOne()`.

### Critères d'acceptation

- [ ] Entité compile sans erreur TypeScript
- [ ] `scheduleType = 'config'` → `scheduleOne()` loggue et retourne sans scheduler
- [ ] Anciens champs intacts

---

## AM-04 — Entité `WhatsappChat` : champs de suivi multi-triggers

**Type :** Enhancement  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-01  
**Fichier :** `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

### Changements

```ts
// Trigger A — Sans réponse
@Column({ name: 'no_response_auto_step', type: 'int', default: 0 })
no_response_auto_step: number;

@Column({ name: 'last_no_response_auto_sent_at', type: 'timestamp', nullable: true })
last_no_response_auto_sent_at: Date | null;

// Trigger C — Hors horaires
@Column({ name: 'out_of_hours_auto_sent', type: 'boolean', default: false })
out_of_hours_auto_sent: boolean;

// Trigger D — Réouverture
@Column({ name: 'reopened_at', type: 'timestamp', nullable: true })
reopened_at: Date | null;

@Column({ name: 'reopened_auto_sent', type: 'boolean', default: false })
reopened_auto_sent: boolean;

// Trigger E — Attente queue
@Column({ name: 'queue_wait_auto_step', type: 'int', default: 0 })
queue_wait_auto_step: number;

@Column({ name: 'last_queue_wait_auto_sent_at', type: 'timestamp', nullable: true })
last_queue_wait_auto_sent_at: Date | null;

// Trigger F — Mot-clé
@Column({ name: 'keyword_auto_sent_at', type: 'timestamp', nullable: true })
keyword_auto_sent_at: Date | null;

// Trigger G — Type client
@Column({ name: 'client_type_auto_sent', type: 'boolean', default: false })
client_type_auto_sent: boolean;

@Column({ name: 'is_known_client', type: 'boolean', nullable: true })
is_known_client: boolean | null;

// Trigger H — Inactivité
@Column({ name: 'inactivity_auto_step', type: 'int', default: 0 })
inactivity_auto_step: number;

@Column({ name: 'last_inactivity_auto_sent_at', type: 'timestamp', nullable: true })
last_inactivity_auto_sent_at: Date | null;

// Trigger I — Après assignation
@Column({ name: 'on_assign_auto_sent', type: 'boolean', default: false })
on_assign_auto_sent: boolean;
```

### Critères d'acceptation

- [ ] Entité compile sans erreur TypeScript
- [ ] Champs existants (`auto_message_step`, `last_auto_message_sent_at`, etc.) intacts

---

## AM-05 — Nouvelle entité `AutoMessageKeyword`

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-01  
**Fichier nouveau :** `message_whatsapp/src/message-auto/entities/auto-message-keyword.entity.ts`

```ts
export enum KeywordMatchType {
  EXACT       = 'exact',
  CONTAINS    = 'contains',
  STARTS_WITH = 'starts_with',
}

@Entity({ name: 'auto_message_keyword', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class AutoMessageKeyword {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 100 })
  keyword: string;

  @Column({ name: 'match_type', type: 'enum', enum: KeywordMatchType, default: KeywordMatchType.CONTAINS })
  matchType: KeywordMatchType;

  @Column({ name: 'case_sensitive', type: 'boolean', default: false })
  caseSensitive: boolean;

  @Column({ name: 'message_auto_id', type: 'uuid' })
  messageAutoId: string;

  @ManyToOne(() => MessageAuto, (m) => m.keywords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_auto_id' })
  messageAuto: MessageAuto;

  @Column({ type: 'boolean', default: true })
  actif: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
```

### Critères d'acceptation

- [ ] Suppression d'un `MessageAuto` → cascade supprime ses keywords
- [ ] Un template peut avoir 0 à N mots-clés

---

## AM-06 — Nouvelle entité `BusinessHoursConfig` + `BusinessHoursService`

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-01  
**Fichiers nouveaux :**
- `message_whatsapp/src/message-auto/entities/business-hours-config.entity.ts`
- `message_whatsapp/src/message-auto/business-hours.service.ts`

### Entité

```ts
@Entity({ name: 'business_hours_config', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_business_hours_day', ['dayOfWeek'], { unique: true })
export class BusinessHoursConfig {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'day_of_week', type: 'tinyint' }) dayOfWeek: number; // 0=Dim … 6=Sam
  @Column({ name: 'open_hour', type: 'int', default: 8 }) openHour: number;
  @Column({ name: 'open_minute', type: 'int', default: 0 }) openMinute: number;
  @Column({ name: 'close_hour', type: 'int', default: 18 }) closeHour: number;
  @Column({ name: 'close_minute', type: 'int', default: 0 }) closeMinute: number;
  @Column({ name: 'is_open', type: 'boolean', default: true }) isOpen: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
```

### Service

```ts
@Injectable()
export class BusinessHoursService {
  async isCurrentlyOpen(): Promise<boolean>   // vérifie l'heure actuelle vs config du jour
  async getAll(): Promise<BusinessHoursConfig[]>
  async updateDay(dayOfWeek: number, dto: UpdateBusinessHoursDto): Promise<BusinessHoursConfig>
}
```

### Critères d'acceptation

- [ ] `isCurrentlyOpen()` retourne `false` hors plage ou si `is_open = false`
- [ ] Index unique sur `day_of_week` empêche les doublons
- [ ] 7 lignes créées à l'initialisation via migration

---

## AM-07 — `CronConfigService` : défauts master + triggers config-only

**Type :** Enhancement  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-03  
**Fichier :** `message_whatsapp/src/jorbs/cron-config.service.ts`

### Nouveaux défauts dans `CRON_DEFAULTS`

```ts
// ─── Clé maître — seule clé réellement schedulée ───────────────────────────
'auto-message-master': {
  label: 'Job maître — Messages automatiques',
  description:
    'Job unique qui vérifie séquentiellement tous les triggers de messages automatiques activés. ' +
    'Tous les autres CRON "auto-message-*" sont des entrées de configuration, pas des planifications.',
  enabled: false,
  scheduleType: 'interval',
  intervalMinutes: 5,
  activeHourStart: 5,
  activeHourEnd: 21,
  // autres champs null
},

// ─── Clés config-only (scheduleType: 'config') ─────────────────────────────
'no-response-auto-message': {
  label: 'Config trigger — Sans réponse',
  description: "Envoie un message si le client attend depuis plus de X minutes sans réponse.",
  enabled: false, scheduleType: 'config',
  noResponseThresholdMinutes: 60, maxSteps: 1,
  applyToReadOnly: false, applyToClosed: false,
},
'out-of-hours-auto-message': {
  label: 'Config trigger — Hors horaires',
  description: "Envoie un message quand le client contacte en dehors des horaires d'ouverture.",
  enabled: false, scheduleType: 'config', maxSteps: 1,
},
'reopened-auto-message': {
  label: 'Config trigger — Réouverture',
  description: "Envoie un message quand le client réécrit après fermeture de la conversation.",
  enabled: false, scheduleType: 'config', maxSteps: 1,
},
'queue-wait-auto-message': {
  label: 'Config trigger — Attente en queue',
  description: "Envoie un message si le client non assigné attend depuis plus de X minutes.",
  enabled: false, scheduleType: 'config',
  queueWaitThresholdMinutes: 30, maxSteps: 1,
},
'keyword-auto-message': {
  label: 'Config trigger — Mot-clé détecté',
  description: "Envoie un message quand le client utilise un mot-clé configuré.",
  enabled: false, scheduleType: 'config',
},
'client-type-auto-message': {
  label: 'Config trigger — Type de client',
  description: "Envoie un message différent selon que le client est nouveau ou connu.",
  enabled: false, scheduleType: 'config',
},
'inactivity-auto-message': {
  label: 'Config trigger — Inactivité totale',
  description: "Envoie un message si aucune activité des deux côtés depuis plus de X minutes.",
  enabled: false, scheduleType: 'config',
  inactivityThresholdMinutes: 120, maxSteps: 1,
},
'on-assign-auto-message': {
  label: "Config trigger — Après assignation",
  description: "Envoie un message quand un agent commercial est assigné à la conversation.",
  enabled: false, scheduleType: 'config',
},
```

### Modification de `scheduleOne()`

```ts
scheduleOne(config: CronConfig): void {
  this.stopSchedule(config.key);

  // Nouveau cas : config-only → jamais schedulé
  if (config.scheduleType === 'config') {
    this.logger.log(`Cron "${config.key}" is config-only — no scheduling`);
    return;
  }
  // ... reste inchangé (interval, cron, event)
}
```

### Validation dans `update()`

Pour la clé `auto-message-master` :
```ts
if (dto.activeHourStart !== undefined || dto.activeHourEnd !== undefined) {
  const start = dto.activeHourStart ?? config.activeHourStart ?? 5;
  const end   = dto.activeHourEnd   ?? config.activeHourEnd   ?? 21;
  if (start >= end) throw new BadRequestException(
    `activeHourStart (${start}) doit être inférieur à activeHourEnd (${end})`
  );
}
```

### Critères d'acceptation

- [ ] Seule la clé `auto-message-master` planifie un job
- [ ] Les 8 clés trigger sont créées en BDD au boot avec `scheduleType: 'config'`
- [ ] `scheduleOne()` sur une clé `config` → log + return sans créer d'interval
- [ ] `PATCH /cron-config/auto-message-master` modifie l'intervalle et reschedule
- [ ] Validation plage horaire respectée

---
---

# ÉPIQUE E2 — Backend : Logique commune

---

## AM-08 — DTOs `MessageAuto` : trigger, scope, keywords, client_type

**Type :** Enhancement  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-02, AM-05  
**Fichiers :**
- `message_whatsapp/src/message-auto/dto/create-message-auto.dto.ts`
- `message_whatsapp/src/message-auto/dto/update-message-auto.dto.ts`

### Changements dans `CreateMessageAutoDto`

```ts
@IsOptional()
@IsEnum(AutoMessageTriggerType)
trigger_type?: AutoMessageTriggerType;                  // défaut: 'sequence'

@IsOptional()
@IsIn(['poste', 'canal'])
scope_type?: 'poste' | 'canal';

@IsOptional()
@IsString()
@MaxLength(100)
scope_id?: string;

@IsOptional()
@IsString()
@MaxLength(200)
scope_label?: string;

@IsOptional()
@IsIn(['new', 'returning', 'all'])
client_type_target?: 'new' | 'returning' | 'all';

@IsOptional()
@IsArray()
@ValidateNested({ each: true })
@Type(() => CreateAutoMessageKeywordDto)
keywords?: CreateAutoMessageKeywordDto[];
```

### Nouveau DTO `CreateAutoMessageKeywordDto`

```ts
export class CreateAutoMessageKeywordDto {
  @IsString() @MaxLength(100)   keyword: string;
  @IsOptional() @IsEnum(KeywordMatchType)  matchType?: KeywordMatchType;
  @IsOptional() @IsBoolean()    caseSensitive?: boolean;
  @IsOptional() @IsBoolean()    actif?: boolean;
}
```

### Validations croisées

- Si `scope_type` fourni → `scope_id` obligatoire → sinon 400
- Si `trigger_type = 'keyword'` → `keywords` doit contenir au moins 1 élément → sinon 400
- Si `trigger_type != 'keyword'` → `keywords` ignoré (pas d'erreur)

### Critères d'acceptation

- [ ] `POST /message-auto` persiste tous les nouveaux champs
- [ ] Validation croisée scope : `scope_type` sans `scope_id` → 400
- [ ] Validation keyword : trigger keyword sans keyword → 400
- [ ] `GET /message-auto/by-trigger/:trigger` retourne les templates filtrés

---

## AM-09 — `MessageAutoService` : sélection de template universelle

**Type :** Feature  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-02, AM-08  
**Fichier :** `message_whatsapp/src/message-auto/message-auto.service.ts`

### Signature

```ts
async getTemplateForTrigger(
  trigger: AutoMessageTriggerType,
  step: number,
  options?: {
    posteId?: string | null,
    channelId?: string | null,
    clientTypeTarget?: 'new' | 'returning' | 'all',
  }
): Promise<MessageAuto | null>
```

### Algorithme de sélection (priorité scope + tirage aléatoire)

```
1. Charger tous les MessageAuto actifs :
   WHERE trigger_type = trigger AND position = step

2. Filtrer par client_type_target si pertinent :
   'new'       → garder client_type_target IN ('new', 'all')
   'returning' → garder client_type_target IN ('returning', 'all')
   sinon       → pas de filtre

3. Construire 3 pools de priorité :
   poolPoste  = templates WHERE scope_type='poste'  AND scope_id = posteId
   poolCanal  = templates WHERE scope_type='canal'  AND scope_id = channelId
   poolGlobal = templates WHERE scope_type IS NULL

4. Sélectionner le premier pool non vide :
   poolPoste non vide → utiliser poolPoste
   sinon poolCanal non vide → utiliser poolCanal
   sinon → utiliser poolGlobal

5. Tirage aléatoire dans le pool retenu → retourner 1 template ou null
```

### Critères d'acceptation

- [ ] Template scopé poste → priorité absolue sur canal et global
- [ ] Template scopé canal → priorité sur global uniquement
- [ ] Filtre `client_type_target` respecté
- [ ] Tirage aléatoire uniforme (vérifié sur 1000 itérations en test)
- [ ] Aucun template actif → `null`
- [ ] Méthode pure, aucun effet de bord

---

## AM-10 — `MessageAutoService` : envoi universel `sendAutoMessageForTrigger`

**Type :** Feature  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-09, AM-04  
**Fichier :** `message_whatsapp/src/message-auto/message-auto.service.ts`

### Signature

```ts
async sendAutoMessageForTrigger(
  chatId: string,
  trigger: AutoMessageTriggerType,
  step: number,
  options?: { clientTypeTarget?: 'new' | 'returning' | 'all' },
): Promise<void>
```

### Comportement

```
1. Charger le chat → introuvable : return
2. Vérifier last_msg_client_channel_id → absent : throw Error
3. getTemplateForTrigger(trigger, step, { posteId, channelId, clientTypeTarget })
4. Template null → log debug → return
5. Typing WA start (best-effort, silencieux)
6. Formater le message via formatMessageAuto()
7. createAgentMessage({ chat_id, poste_id: null, text, timestamp: new Date(), channel_id })
8. gateway.notifyAutoMessage(message, chat)
9. Mettre à jour les champs de suivi propres au trigger (tableau ci-dessous)
10. Typing WA stop (finally, best-effort)
11. Erreur d'envoi → logger → rethrow
```

### Champs mis à jour après envoi selon trigger

| Trigger | Champs mis à jour |
|---------|-------------------|
| A — no_response | `no_response_auto_step = step`, `last_no_response_auto_sent_at = NOW()` |
| C — out_of_hours | `out_of_hours_auto_sent = true` |
| D — reopened | `reopened_auto_sent = true` |
| E — queue_wait | `queue_wait_auto_step = step`, `last_queue_wait_auto_sent_at = NOW()` |
| F — keyword | `keyword_auto_sent_at = NOW()` |
| G — client_type | `client_type_auto_sent = true` |
| H — inactivity | `inactivity_auto_step = step`, `last_inactivity_auto_sent_at = NOW()` |
| I — on_assign | `on_assign_auto_sent = true` |

### Critères d'acceptation

- [ ] Message envoyé via le bon canal
- [ ] Uniquement les champs propres au trigger sont mis à jour
- [ ] `auto_message_step` (trigger B) non modifié pour les autres triggers
- [ ] `read_only` non modifié
- [ ] Template null → sortie silencieuse, pas d'erreur
- [ ] Typing WA appelé en best-effort

---

## AM-11 — `MessageAutoService` : endpoint `findByTrigger` + CRUD keywords

**Type :** Enhancement  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-08  
**Fichiers :**
- `message_whatsapp/src/message-auto/message-auto.service.ts`
- `message_whatsapp/src/message-auto/message-auto.controller.ts`

### Nouveaux endpoints

```ts
@Get('by-trigger/:trigger')
findByTrigger(@Param('trigger') trigger: AutoMessageTriggerType)
// Retourne templates filtrés, triés scope_type ASC, position ASC

@Post(':id/keywords')
addKeyword(@Param('id') id: string, @Body() dto: CreateAutoMessageKeywordDto)

@Delete(':id/keywords/:keywordId')
removeKeyword(@Param('id') id: string, @Param('keywordId') keywordId: string)

@Get(':id/keywords')
getKeywords(@Param('id') id: string)
```

### Critères d'acceptation

- [ ] `GET /message-auto/by-trigger/no_response` → uniquement templates no_response
- [ ] `GET /message-auto/:id` inclut `keywords` dans la réponse (eager ou join)
- [ ] CRUD keywords fonctionnel avec validation

---
---

# ÉPIQUE E3 — Backend : Job CRON maître

---

## AM-12 — `AutoMessageMasterJob` : structure et orchestration

**Type :** Feature  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-07, AM-09, AM-10, AM-04, AM-06  
**Fichier nouveau :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`

### Interface du service

```ts
@Injectable()
export class AutoMessageMasterJob implements OnModuleInit {
  onModuleInit(): void   // enregistre le handler + preview
  run(): Promise<void>   // exécution principale
  preview(): Promise<MasterPreviewResult>  // aperçu sans action
}
```

### Logique de `run()` — Structure principale

```
ÉTAPE 1 — Config maître
  masterConfig = await cronConfigService.findByKey('auto-message-master')
  if (!masterConfig.enabled) → return

ÉTAPE 2 — Plage horaire
  hour = new Date().getHours()
  start = masterConfig.activeHourStart ?? 5
  end   = masterConfig.activeHourEnd   ?? 21
  if (hour < start || hour >= end) → log debug → return

ÉTAPE 3 — Charger toutes les trigger configs en une seule requête
  triggerConfigs = Map<key, CronConfig> (toutes les clés auto-message-*)

ÉTAPE 4 — Calcul de la fenêtre glissante pour les triggers polling
  windowMs = (masterConfig.intervalMinutes ?? 5) * 2 * 60_000
  windowStart = new Date(Date.now() - windowMs)

ÉTAPE 5 — Exécution de chaque trigger activé (séquentiellement, try/catch isolé)
  await this.runTriggerA(triggerConfigs.get('no-response-auto-message'))
  await this.runTriggerC(triggerConfigs.get('out-of-hours-auto-message'), windowStart)
  await this.runTriggerD(triggerConfigs.get('reopened-auto-message'), windowStart)
  await this.runTriggerE(triggerConfigs.get('queue-wait-auto-message'))
  await this.runTriggerF(triggerConfigs.get('keyword-auto-message'), windowStart)
  await this.runTriggerG(triggerConfigs.get('client-type-auto-message'), windowStart)
  await this.runTriggerH(triggerConfigs.get('inactivity-auto-message'))
  await this.runTriggerI(triggerConfigs.get('on-assign-auto-message'), windowStart)
```

> Chaque `runTrigger*()` est entouré d'un `try/catch` : une erreur sur un trigger n'interrompt pas les suivants.

### Critères d'acceptation

- [ ] Handler enregistré sous la clé `auto-message-master`
- [ ] `enabled = false` → aucune action
- [ ] Hors plage horaire → aucune action
- [ ] Erreur sur trigger A → trigger C s'exécute quand même
- [ ] Toutes les configs trigger chargées en une seule requête BDD

---

## AM-13 — `AutoMessageMasterJob` : implémentation des triggers A, E, H (CRON-natifs)

**Type :** Feature  
**Priorité :** 🔴 Critique  
**Dépendances :** AM-12  
**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`

### Trigger A — Sans réponse (`runTriggerA`)

```
if (!config?.enabled) return

thresholdMs = (config.noResponseThresholdMinutes ?? 60) * 60_000
maxSteps    = config.maxSteps ?? 1

Requête WhatsappChat :
  WHERE:
    last_client_message_at IS NOT NULL
    AND (last_poste_message_at IS NULL OR last_client_message_at > last_poste_message_at)
    AND no_response_auto_step < maxSteps
    AND last_client_message_at >= NOW() - 23h
    AND (
      (no_response_auto_step = 0 AND last_client_message_at <= NOW() - threshold)
      OR
      (no_response_auto_step > 0
        AND last_no_response_auto_sent_at <= NOW() - threshold
        AND last_no_response_auto_sent_at >= last_client_message_at)
    )
    AND (config.applyToReadOnly OR read_only = false)
    AND (config.applyToClosed   OR status != 'fermé')

Pour chaque chat :
  scope check → skip si disabled
  sendAutoMessageForTrigger(chat_id, 'no_response', chat.no_response_auto_step + 1)
```

### Trigger E — Attente en queue (`runTriggerE`)

```
if (!config?.enabled) return

thresholdMs = (config.queueWaitThresholdMinutes ?? 30) * 60_000

Requête :
  WHERE:
    poste_id IS NULL
    AND status = 'en attente'
    AND last_client_message_at IS NOT NULL
    AND last_client_message_at >= NOW() - 23h
    AND queue_wait_auto_step < maxSteps
    AND (
      (queue_wait_auto_step = 0 AND last_client_message_at <= NOW() - threshold)
      OR
      (queue_wait_auto_step > 0
        AND last_queue_wait_auto_sent_at <= NOW() - threshold
        AND last_queue_wait_auto_sent_at >= last_client_message_at)
    )

Pour chaque chat :
  scope check → skip si disabled
  sendAutoMessageForTrigger(chat_id, 'queue_wait', chat.queue_wait_auto_step + 1)
```

### Trigger H — Inactivité totale (`runTriggerH`)

```
if (!config?.enabled) return

thresholdMs = (config.inactivityThresholdMinutes ?? 120) * 60_000

Requête :
  WHERE:
    status IN ('actif', 'en attente')
    AND last_activity_at IS NOT NULL
    AND last_activity_at <= NOW() - threshold
    AND inactivity_auto_step < maxSteps
    AND (
      (inactivity_auto_step = 0)
      OR
      (inactivity_auto_step > 0 AND last_inactivity_auto_sent_at <= NOW() - threshold)
    )
    AND (config.applyToReadOnly OR read_only = false)

Pour chaque chat :
  scope check → skip si disabled
  sendAutoMessageForTrigger(chat_id, 'inactivity', chat.inactivity_auto_step + 1)
```

### Critères d'acceptation

- [ ] Trigger A : conversation avec réponse agent récente → ignorée
- [ ] Trigger A : fenêtre 23h expirée → ignorée
- [ ] Trigger A : `applyToReadOnly = false` + `read_only = true` → ignorée
- [ ] Trigger E : conversation déjà assignée → ignorée
- [ ] Trigger H : activité récente → ignorée
- [ ] Tous : max steps atteint → ignoré
- [ ] Tous : erreur sur un chat individuel → les autres chats continuent

---

## AM-14 — `AutoMessageMasterJob` : implémentation des triggers C, D, F, G, I (polling)

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-12, AM-06, AM-05  
**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`

### Trigger C — Hors horaires (`runTriggerC`)

```
if (!config?.enabled) return
isOpen = await businessHoursService.isCurrentlyOpen()
if (isOpen) return   // dans les horaires → rien à faire

Requête :
  WHERE:
    last_client_message_at >= windowStart   (fenêtre glissante)
    AND out_of_hours_auto_sent = false
    AND status != 'fermé'

Pour chaque chat :
  scope check → skip si disabled
  sendAutoMessageForTrigger(chat_id, 'out_of_hours', 1)
```

### Trigger D — Réouverture (`runTriggerD`)

```
if (!config?.enabled) return

Requête :
  WHERE:
    reopened_at >= windowStart   (fenêtre glissante)
    AND reopened_auto_sent = false

Pour chaque chat :
  scope check → skip si disabled
  sendAutoMessageForTrigger(chat_id, 'reopened', 1)
```

> `reopened_at` est mis à jour dans `WhatsappChatService` quand une conversation fermée reçoit un nouveau message (ticket AM-16).

### Trigger F — Mot-clé (`runTriggerF`)

```
if (!config?.enabled) return

keywords = await autoMessageKeywordRepo.find({ where: { actif: true }, relations: ['messageAuto'] })
if (keywords.length === 0) return

Requête :
  WHERE:
    last_client_message_at >= windowStart
    AND (keyword_auto_sent_at IS NULL OR keyword_auto_sent_at < last_client_message_at)
    AND status != 'fermé'

Pour chaque chat :
  Charger le texte du dernier message client (via WhatsappMessageService)
  Pour chaque keyword actif :
    Si le texte match → scope check → sendAutoMessageForTrigger(chat_id, 'keyword', keyword.messageAuto.position)
    break après le premier match
```

### Trigger G — Type de client (`runTriggerG`)

```
if (!config?.enabled) return

Requête :
  WHERE:
    last_client_message_at >= windowStart
    AND client_type_auto_sent = false

Pour chaque chat :
  clientTypeTarget = (chat.is_known_client === true) ? 'returning' : 'new'
  scope check → skip si disabled
  sendAutoMessageForTrigger(chat_id, 'client_type', 1, { clientTypeTarget })
```

### Trigger I — Après assignation (`runTriggerI`)

```
if (!config?.enabled) return

Requête :
  WHERE:
    assigned_at >= windowStart   (champ existant dans WhatsappChat)
    AND poste_id IS NOT NULL
    AND on_assign_auto_sent = false

Pour chaque chat :
  scope check → skip si disabled
  sendAutoMessageForTrigger(chat_id, 'on_assign', 1)
```

### Critères d'acceptation

- [ ] Trigger C : dans les horaires → aucun envoi
- [ ] Trigger C : hors horaires + `out_of_hours_auto_sent = true` → pas de second envoi
- [ ] Trigger D : `reopened_at` hors fenêtre → ignoré
- [ ] Trigger F : message sans keyword → ignoré
- [ ] Trigger F : `keyword_auto_sent_at >= last_client_message_at` → ignoré (déjà traité)
- [ ] Trigger G : client connu → template 'returning' sélectionné
- [ ] Trigger I : `assigned_at` hors fenêtre → ignoré (conversation déjà traitée)

---
---

# ÉPIQUE E4 — Backend : Module & Réinitialisation

---

## AM-15 — Modules `jorbs` & `message-auto` : enregistrement

**Type :** Configuration  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-12, AM-05, AM-06  
**Fichiers :**
- `message_whatsapp/src/jorbs/jorbs.module.ts`
- `message_whatsapp/src/message-auto/message-auto.module.ts`

### `jorbs.module.ts`

- Ajouter `AutoMessageMasterJob` en provider
- Ajouter `WhatsappChat`, `WhatsappMessage` en `TypeOrmModule.forFeature([...])`
- Importer `MessageAutoModule` (pour `MessageAutoService`, `AutoMessageScopeConfigService`)
- Importer `BusinessHoursModule` (ou ajouter `BusinessHoursService` directement)

### `message-auto.module.ts`

- Ajouter `AutoMessageKeyword`, `BusinessHoursConfig` en `TypeOrmModule.forFeature([...])`
- Ajouter `BusinessHoursService` en provider et export
- Exporter `BusinessHoursService` pour usage dans `JorbsModule`

### Critères d'acceptation

- [ ] Application démarre sans erreur de dépendances NestJS
- [ ] Log au boot : `Handler registered for cron key="auto-message-master"`
- [ ] Log au boot : `Cron "auto-message-master" scheduled as interval every 5 min`
- [ ] Les 8 clés config-only loggent : `Cron "X" is config-only — no scheduling`

---

## AM-16 — `WhatsappChatService` : réinitialisations & `reopened_at`

**Type :** Enhancement  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-04  
**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

### Règles de réinitialisation dans `update()`

```ts
// Quand last_poste_message_at est fourni → agent a répondu
if (patch.last_poste_message_at !== undefined) {
  patch.no_response_auto_step = 0;
  patch.last_no_response_auto_sent_at = null;
}

// Quand poste_id est fourni → conversation assignée
if (patch.poste_id !== undefined && patch.poste_id !== null) {
  patch.queue_wait_auto_step = 0;
  patch.last_queue_wait_auto_sent_at = null;
}

// Quand last_activity_at est mis à jour → toute activité réinitialise l'inactivité
if (patch.last_activity_at !== undefined) {
  patch.inactivity_auto_step = 0;
  patch.last_inactivity_auto_sent_at = null;
}
```

### Gestion de `reopened_at` (trigger D)

Dans le service ou handler qui traite la réception d'un message sur une conversation fermée :
```ts
if (chat.status === WhatsappChatStatus.FERME) {
  patch.reopened_at = new Date();
  patch.reopened_auto_sent = false;
  // ... logique de réouverture existante
}
```

### Réinitialisation du cycle hors-horaires (trigger C)

`out_of_hours_auto_sent = false` quand :
- La conversation est réouverte
- Un nouveau message client arrive un jour différent du dernier envoi (vérification date)

### Tableau complet des réinitialisations

| Événement | Champs réinitialisés |
|-----------|---------------------|
| Agent répond (`last_poste_message_at`) | `no_response_auto_step=0`, `last_no_response_auto_sent_at=null` |
| Conversation assignée (`poste_id`) | `queue_wait_auto_step=0`, `last_queue_wait_auto_sent_at=null` |
| Toute activité (`last_activity_at`) | `inactivity_auto_step=0`, `last_inactivity_auto_sent_at=null` |
| Conversation réouverte | `reopened_at=NOW()`, `reopened_auto_sent=false`, `out_of_hours_auto_sent=false` |
| Nouveau message client (jour différent) | `out_of_hours_auto_sent=false` |
| Nouvelle assignation (poste changé) | `on_assign_auto_sent=false` |

### Critères d'acceptation

- [ ] Réponse agent → cycle no_response repart de zéro
- [ ] Assignation poste → cycle queue_wait repart de zéro
- [ ] Toute activité → cycle inactivity repart de zéro
- [ ] Conversation réouverte → `reopened_at` mis à jour
- [ ] Les réinitialisations n'affectent pas les cycles d'autres triggers
- [ ] Cycle séquence (`auto_message_step`) non affecté

---
---

# ÉPIQUE E5 — Admin UI

---

## AM-17 — Types TypeScript admin : `definitions.ts` & `api.ts`

**Type :** Enhancement  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-02 → AM-06, AM-11  
**Fichiers :**
- `admin/src/app/lib/definitions.ts`
- `admin/src/app/lib/api.ts`

### Nouveaux types `definitions.ts`

```ts
export type AutoMessageTriggerType =
  | 'sequence' | 'no_response' | 'out_of_hours' | 'reopened'
  | 'queue_wait' | 'keyword' | 'client_type' | 'inactivity' | 'on_assign';

export type KeywordMatchType = 'exact' | 'contains' | 'starts_with';

export interface AutoMessageKeyword {
  id: string;
  keyword: string;
  matchType: KeywordMatchType;
  caseSensitive: boolean;
  actif: boolean;
}

export interface BusinessHoursConfig {
  id: string;
  dayOfWeek: number;     // 0=Dim … 6=Sam
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  isOpen: boolean;
}

// MessageAuto — ajouter :
trigger_type: AutoMessageTriggerType;
scope_type?: 'poste' | 'canal' | null;
scope_id?: string | null;
scope_label?: string | null;
client_type_target?: 'new' | 'returning' | 'all' | null;
keywords?: AutoMessageKeyword[];

// CronConfig — ajouter :
noResponseThresholdMinutes?: number | null;
queueWaitThresholdMinutes?: number | null;
inactivityThresholdMinutes?: number | null;
applyToReadOnly?: boolean | null;
applyToClosed?: boolean | null;
activeHourStart?: number | null;
activeHourEnd?: number | null;
```

### Nouvelles fonctions `api.ts`

```ts
getMessageAutoByTrigger(trigger: AutoMessageTriggerType): Promise<MessageAuto[]>
addKeywordToTemplate(id: string, dto: Partial<AutoMessageKeyword>): Promise<AutoMessageKeyword>
removeKeywordFromTemplate(id: string, keywordId: string): Promise<void>
getBusinessHours(): Promise<BusinessHoursConfig[]>
updateBusinessHoursDay(dayOfWeek: number, dto: Partial<BusinessHoursConfig>): Promise<BusinessHoursConfig>
```

### Critères d'acceptation

- [ ] Aucune erreur TypeScript dans `admin/`
- [ ] Toutes les nouvelles fonctions API compilent et retournent le bon type

---

## AM-18 — `MessageAutoView.tsx` : refonte en onglets par trigger

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-17  
**Fichier :** `admin/src/app/ui/MessageAutoView.tsx`

### Structure visuelle

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Messages Automatiques                                                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Job maître : [●ACTIF]  Intervalle: 5 min  Plage: 5h–21h       │    │
│  │  Dernière exécution : 08/04/2026 14:35  [Exécuter] [Aperçu]    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  [Séquence] [Sans réponse] [Hors horaires] [Réouverture] [Queue wait]  │
│  [Mot-clé]  [Type client]  [Inactivité]    [Après assign.]             │
│  ─────────────────────────────────────────────────────────────────────   │
│  [Panneau config du trigger actif]                                      │
│  [Table des templates du trigger actif]                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### Panneau maître (hors onglets)

Toujours visible en haut de page, indépendant des onglets :
- Toggle activer/désactiver le job maître
- Input intervalle (minutes)
- Inputs plage horaire (heure début / fin)
- Badge `lastRunAt`
- Bouton "Exécuter maintenant" (`POST /cron-config/auto-message-master/run`)
- Bouton "Aperçu global" → modale listant les conversations ciblées par chaque trigger

### Métadonnées des onglets

```ts
const TRIGGER_TABS = [
  { key: 'sequence',     label: 'Séquence',         cronKey: 'auto-message',             hasSteps: true,  hasScope: false, hasThreshold: false, hasKeywords: false, hasClientType: false, hasBusinessHours: false },
  { key: 'no_response',  label: 'Sans réponse',      cronKey: 'no-response-auto-message', hasSteps: true,  hasScope: true,  hasThreshold: true,  hasKeywords: false, hasClientType: false, hasBusinessHours: false },
  { key: 'out_of_hours', label: 'Hors horaires',     cronKey: 'out-of-hours-auto-message',hasSteps: false, hasScope: true,  hasThreshold: false, hasKeywords: false, hasClientType: false, hasBusinessHours: true  },
  { key: 'reopened',     label: 'Réouverture',       cronKey: 'reopened-auto-message',    hasSteps: false, hasScope: true,  hasThreshold: false, hasKeywords: false, hasClientType: false, hasBusinessHours: false },
  { key: 'queue_wait',   label: 'Attente queue',     cronKey: 'queue-wait-auto-message',  hasSteps: true,  hasScope: true,  hasThreshold: true,  hasKeywords: false, hasClientType: false, hasBusinessHours: false },
  { key: 'keyword',      label: 'Mot-clé',           cronKey: 'keyword-auto-message',     hasSteps: false, hasScope: true,  hasThreshold: false, hasKeywords: true,  hasClientType: false, hasBusinessHours: false },
  { key: 'client_type',  label: 'Type de client',    cronKey: 'client-type-auto-message', hasSteps: false, hasScope: true,  hasThreshold: false, hasKeywords: false, hasClientType: true,  hasBusinessHours: false },
  { key: 'inactivity',   label: 'Inactivité',        cronKey: 'inactivity-auto-message',  hasSteps: true,  hasScope: true,  hasThreshold: true,  hasKeywords: false, hasClientType: false, hasBusinessHours: false },
  { key: 'on_assign',    label: 'Après assignation', cronKey: 'on-assign-auto-message',   hasSteps: false, hasScope: true,  hasThreshold: false, hasKeywords: false, hasClientType: false, hasBusinessHours: false },
];
```

### Critères d'acceptation

- [ ] Panneau maître visible en permanence en haut
- [ ] 9 onglets navigables
- [ ] Chaque onglet charge ses templates via `getMessageAutoByTrigger(key)`
- [ ] State isolé par onglet
- [ ] Template créé depuis un onglet → `trigger_type` pré-rempli automatiquement

---

## AM-19 — `MessageAutoView.tsx` : panneau de configuration par trigger

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-18  
**Fichier :** `admin/src/app/ui/MessageAutoView.tsx`

### Composant `TriggerConfigPanel`

Composant générique qui reçoit la métadata de l'onglet et affiche les champs pertinents.

### Matrice des champs affichés

| Champ | A | B | C | D | E | F | G | H | I |
|-------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Toggle activer/désactiver | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Seuil en minutes | ✓ | — | — | — | ✓ | — | — | ✓ | — |
| Nb max d'étapes | ✓ | ✓ | — | — | ✓ | — | — | ✓ | — |
| Apply to read_only | ✓ | — | — | — | — | — | — | ✓ | — |
| Apply to closed | ✓ | — | — | — | — | — | — | — | — |
| Délai min/max (séquence) | — | ✓ | — | — | — | — | — | — | — |
| Config horaires | — | — | ✓ | — | — | — | — | — | — |
| Badge lastRunAt (master) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

> La plage horaire (activeHourStart/End) n'est affichée que dans le panneau maître, pas dans les panneaux trigger.

### Critères d'acceptation

- [ ] Seuls les champs pertinents sont affichés par onglet
- [ ] Sauvegarde via `PATCH /cron-config/:cronKey`
- [ ] Feedback toast succès/erreur
- [ ] Badge `lastRunAt` reflète la dernière exécution du **job maître** (toujours le même timestamp)

---

## AM-20 — `MessageAutoView.tsx` : formulaire template enrichi

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-18, AM-19  
**Fichier :** `admin/src/app/ui/MessageAutoView.tsx`

### Champs du formulaire

**Communs à tous :**
- Corps (`body`) avec hint placeholders `#name#`, `#numero#`
- Position / Étape (min 1)
- Canal (whatsapp / sms / email / tous)
- Actif / inactif

**Conditionnels selon la métadata de l'onglet :**

```tsx
{/* Scope dédié — si hasScope */}
{tab.hasScope && (
  <select value={scope_type ?? ''}>
    <option value="">Tous (global)</option>
    <option value="poste">Un poste spécifique</option>
    <option value="canal">Un canal spécifique</option>
  </select>
  // Sous-select poste ou canal selon scope_type
)}

{/* Ciblage client — si hasClientType */}
{tab.hasClientType && (
  <select value={client_type_target ?? 'all'}>
    <option value="all">Tous les clients</option>
    <option value="new">Nouveau client uniquement</option>
    <option value="returning">Client connu uniquement</option>
  </select>
)}

{/* Mots-clés — si hasKeywords */}
{tab.hasKeywords && <KeywordsSection templateId={id} keywords={template.keywords} />}
```

### Badge scope dans la table

- `scope_type = null` → badge gris "Global"
- `scope_type = 'poste'` → badge bleu "Poste : [scope_label]"
- `scope_type = 'canal'` → badge violet "Canal : [scope_label]"

### Critères d'acceptation

- [ ] Formulaire s'adapte à la métadata du trigger actif
- [ ] Scope vide → `scope_type = null` envoyé (template global)
- [ ] `scope_label` auto-peuplé depuis le nom du poste/canal sélectionné
- [ ] En mode édition, toutes les valeurs sont pré-remplies
- [ ] Badge scope visible dans la table

---

## AM-21 — `MessageAutoView.tsx` : section mots-clés (trigger F)

**Type :** Feature  
**Priorité :** 🟡 Moyenne  
**Dépendances :** AM-20  
**Fichier :** `admin/src/app/ui/MessageAutoView.tsx`

### Composant `KeywordsSection`

```
Mots-clés déclencheurs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[contient "prix"]      [×]   badge violet
[exact "stop"]         [×]   badge rouge
[commence par "aide"]  [×]   badge bleu

┌─────────────────┐ ┌────────────┐ ┌─────────┐ ┌────────┐
│ Mot ou phrase…  │ │ Contient ▼ │ │ Casse □ │ │Ajouter │
└─────────────────┘ └────────────┘ └─────────┘ └────────┘
```

### Critères d'acceptation

- [ ] Badge coloré par type de match (exact=rouge, contains=violet, starts_with=bleu)
- [ ] Ajout → `POST /message-auto/:id/keywords` + refresh
- [ ] Suppression avec confirmation → `DELETE` + refresh
- [ ] Toggle actif/inactif par keyword

---

## AM-22 — `MessageAutoView.tsx` : config horaires d'ouverture (trigger C)

**Type :** Feature  
**Priorité :** 🟡 Moyenne  
**Dépendances :** AM-19  
**Fichier :** `admin/src/app/ui/MessageAutoView.tsx`

### Composant `BusinessHoursPanel`

```
Horaires d'ouverture
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         Ouvert   Ouverture   Fermeture
Lundi      ✓       08 h 00     18 h 00
Mardi      ✓       08 h 00     18 h 00
Mercredi   ✓       08 h 00     18 h 00
Jeudi      ✓       08 h 00     18 h 00
Vendredi   ✓       08 h 00     17 h 00
Samedi     □        —  —        —  —
Dimanche   □        —  —        —  —
                              [Sauvegarder]
```

### Critères d'acceptation

- [ ] 7 lignes affichées
- [ ] Toggle "Ouvert" = false → champs heure désactivés visuellement
- [ ] Sauvegarde par jour via `PATCH /business-hours/:dayOfWeek`
- [ ] Validation `openHour >= closeHour` → erreur inline
- [ ] Feedback toast après sauvegarde

---

## AM-23 — Endpoint admin `BusinessHoursConfig`

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-06  
**Fichier nouveau :** `message_whatsapp/src/message-auto/business-hours.controller.ts`

```ts
@Controller('business-hours')
@UseGuards(AdminGuard)
export class BusinessHoursController {
  @Get()
  getAll(): Promise<BusinessHoursConfig[]>

  @Patch(':dayOfWeek')
  updateDay(
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Body() dto: UpdateBusinessHoursDto,
  ): Promise<BusinessHoursConfig>
}
```

### DTO `UpdateBusinessHoursDto`

```ts
@IsOptional() @IsInt() @Min(0) @Max(23) openHour?: number;
@IsOptional() @IsInt() @Min(0) @Max(59) openMinute?: number;
@IsOptional() @IsInt() @Min(0) @Max(23) closeHour?: number;
@IsOptional() @IsInt() @Min(0) @Max(59) closeMinute?: number;
@IsOptional() @IsBoolean() isOpen?: boolean;
```

### Critères d'acceptation

- [ ] `GET /business-hours` → 7 entrées
- [ ] `PATCH /business-hours/1` → met à jour lundi uniquement
- [ ] `openHour >= closeHour` → 400 BadRequest
- [ ] Route protégée par `AdminGuard`

---

## AM-24 — Endpoint admin `MessageAutoKeyword`

**Type :** Feature  
**Priorité :** 🟠 Haute  
**Dépendances :** AM-11  
**Fichier :** `message_whatsapp/src/message-auto/message-auto.controller.ts`

> Les routes keywords sont déjà définies dans AM-11. Ce ticket couvre leur intégration dans le module et les guards.

### Critères d'acceptation

- [ ] `POST /message-auto/:id/keywords` protégé par `AdminGuard`
- [ ] `DELETE /message-auto/:id/keywords/:keywordId` protégé par `AdminGuard`
- [ ] `GET /message-auto/:id/keywords` protégé par `AdminGuard`
- [ ] Réponses correctement typées

---
---

# ÉPIQUE E6 — Tests

---

## AM-25 — Tests `AutoMessageMasterJob` — triggers CRON natifs (A, E, H)

**Type :** Test  
**Priorité :** 🟡 Moyenne  
**Dépendances :** AM-12, AM-13  
**Fichier nouveau :** `message_whatsapp/src/jorbs/auto-message-master.job.spec.ts`

### Cas communs

- [ ] `auto-message-master` disabled → aucun trigger exécuté
- [ ] Heure hors plage → aucun trigger exécuté
- [ ] Erreur sur trigger A → trigger E s'exécute quand même

### Trigger A — Sans réponse

- [ ] Conversation avec réponse agent récente → ignorée
- [ ] Fenêtre 23h expirée → ignorée
- [ ] Seuil non atteint → ignorée
- [ ] Max steps atteint → ignorée
- [ ] `applyToReadOnly=false` + `read_only=true` → ignorée
- [ ] `applyToClosed=false` + `status=fermé` → ignorée
- [ ] Multi-steps : step 1 envoyé → step 2 envoyé au passage suivant si seuil atteint

### Trigger E — Attente queue

- [ ] Conversation assignée (`poste_id != null`) → ignorée
- [ ] `status != 'en attente'` → ignorée
- [ ] Seuil non atteint → ignorée

### Trigger H — Inactivité

- [ ] Activité récente → ignorée
- [ ] Conversation fermée → ignorée (sauf `applyToClosed = true`)
- [ ] Seuil non atteint → ignorée

---

## AM-26 — Tests `AutoMessageMasterJob` — triggers polling (C, D, F, G, I)

**Type :** Test  
**Priorité :** 🟡 Moyenne  
**Dépendances :** AM-14  
**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.spec.ts`

### Trigger C — Hors horaires

- [ ] Dans les horaires → aucun envoi
- [ ] Hors horaires + `out_of_hours_auto_sent=false` → envoi
- [ ] Hors horaires + `out_of_hours_auto_sent=true` → pas de second envoi
- [ ] `last_client_message_at` hors fenêtre glissante → ignorée

### Trigger D — Réouverture

- [ ] `reopened_at` dans la fenêtre + `reopened_auto_sent=false` → envoi
- [ ] `reopened_auto_sent=true` → ignorée
- [ ] `reopened_at` hors fenêtre → ignorée

### Trigger F — Mot-clé

- [ ] Message contient keyword "contains" → envoi
- [ ] Message ne contient pas le keyword → aucun envoi
- [ ] `keyword_auto_sent_at >= last_client_message_at` → ignorée
- [ ] `case_sensitive=true` + mauvaise casse → aucun envoi

### Trigger G — Type client

- [ ] `is_known_client=null` → template 'new' envoyé
- [ ] `is_known_client=true` → template 'returning' envoyé
- [ ] `client_type_auto_sent=true` → ignorée

### Trigger I — Après assignation

- [ ] `assigned_at` dans fenêtre + `on_assign_auto_sent=false` → envoi
- [ ] `on_assign_auto_sent=true` → ignorée
- [ ] `assigned_at` hors fenêtre → ignorée

---

## AM-27 — Tests `MessageAutoService` : sélection de template

**Type :** Test  
**Priorité :** 🟡 Moyenne  
**Dépendances :** AM-09  
**Fichier :** `message_whatsapp/src/message-auto/message-auto.service.spec.ts`

- [ ] Template scopé poste → priorité absolue sur canal et global
- [ ] Template scopé canal → priorité sur global
- [ ] Templates globaux → tirage aléatoire uniforme (1000 itérations)
- [ ] `client_type_target='new'` → template 'returning' non retourné
- [ ] Aucun template actif → `null`
- [ ] `posteId=null` → poolPoste ignoré, canal/global utilisés

---

## AM-28 — Tests `BusinessHoursService`

**Type :** Test  
**Priorité :** 🟡 Moyenne  
**Dépendances :** AM-06  
**Fichier :** `message_whatsapp/src/message-auto/business-hours.service.spec.ts`

- [ ] Lundi 10h → `isCurrentlyOpen() = true` (lun ouvert 8h–18h)
- [ ] Lundi 19h → `isCurrentlyOpen() = false`
- [ ] Samedi (is_open=false) → `isCurrentlyOpen() = false` quelle que soit l'heure
- [ ] Exactement à l'heure de fermeture → `false`
- [ ] Exactement à l'heure d'ouverture → `true`

---
---

# Récapitulatif de tous les tickets

| Ticket | Titre | Épique | Priorité | Dépendances |
|--------|-------|--------|----------|-------------|
| AM-01 | Migration BDD globale | E1 | 🔴 Critique | — |
| AM-02 | Entité `MessageAuto` | E1 | 🔴 Critique | AM-01 |
| AM-03 | Entité `CronConfig` + scheduleType 'config' | E1 | 🔴 Critique | AM-01 |
| AM-04 | Entité `WhatsappChat` | E1 | 🔴 Critique | AM-01 |
| AM-05 | Entité `AutoMessageKeyword` | E1 | 🟠 Haute | AM-01 |
| AM-06 | Entité `BusinessHoursConfig` + service | E1 | 🟠 Haute | AM-01 |
| AM-07 | `CronConfigService` : master + 8 configs | E1 | 🔴 Critique | AM-03 |
| AM-08 | DTOs `MessageAuto` | E2 | 🟠 Haute | AM-02, AM-05 |
| AM-09 | Sélection template universelle | E2 | 🔴 Critique | AM-02, AM-08 |
| AM-10 | Envoi universel `sendAutoMessageForTrigger` | E2 | 🔴 Critique | AM-09, AM-04 |
| AM-11 | Endpoints `findByTrigger` + CRUD keywords | E2 | 🟠 Haute | AM-08 |
| AM-12 | `AutoMessageMasterJob` — structure | E3 | 🔴 Critique | AM-07, AM-09, AM-10, AM-06 |
| AM-13 | Triggers A, E, H dans le job maître | E3 | 🔴 Critique | AM-12 |
| AM-14 | Triggers C, D, F, G, I dans le job maître | E3 | 🟠 Haute | AM-12, AM-06, AM-05 |
| AM-15 | Modules jorbs & message-auto | E4 | 🟠 Haute | AM-12, AM-05, AM-06 |
| AM-16 | `WhatsappChatService` : réinitialisations + `reopened_at` | E4 | 🟠 Haute | AM-04 |
| AM-17 | Types admin + api.ts | E5 | 🟠 Haute | AM-02→AM-06, AM-11 |
| AM-18 | Vue multi-onglets + panneau maître | E5 | 🟠 Haute | AM-17 |
| AM-19 | Panneaux config par trigger | E5 | 🟠 Haute | AM-18 |
| AM-20 | Formulaire template enrichi | E5 | 🟠 Haute | AM-18, AM-19 |
| AM-21 | Section mots-clés UI (trigger F) | E5 | 🟡 Moyenne | AM-20 |
| AM-22 | Config horaires d'ouverture UI (trigger C) | E5 | 🟡 Moyenne | AM-19 |
| AM-23 | Endpoint admin `BusinessHoursConfig` | E5 | 🟠 Haute | AM-06 |
| AM-24 | Endpoint admin keywords (guards) | E5 | 🟠 Haute | AM-11 |
| AM-25 | Tests job maître — triggers A, E, H | E6 | 🟡 Moyenne | AM-12, AM-13 |
| AM-26 | Tests job maître — triggers C, D, F, G, I | E6 | 🟡 Moyenne | AM-14 |
| AM-27 | Tests sélection template | E6 | 🟡 Moyenne | AM-09 |
| AM-28 | Tests `BusinessHoursService` | E6 | 🟡 Moyenne | AM-06 |

---

# Graphe de dépendances simplifié

```
AM-01 (Migration)
  ├── AM-02 (MessageAuto) ──→ AM-08 (DTOs) ──→ AM-09 (Sélection) ──→ AM-10 (Envoi)
  │                                                                         │
  ├── AM-03 (CronConfig) ──→ AM-07 (Defaults)                              │
  │                                │                                        │
  ├── AM-04 (WhatsappChat) ──────→ ├──────────────────────────────────────→ │
  │                                │                                        │
  ├── AM-05 (Keyword entity) ────→ ├──→ AM-12 (Job maître) ←───────────────┘
  │                                │         │
  └── AM-06 (BusinessHours) ─────→ ┘         ├── AM-13 (Triggers A, E, H)
                                              └── AM-14 (Triggers C, D, F, G, I)

AM-12 → AM-15 (Modules)
AM-04 → AM-16 (Réinitialisations)

AM-17 (Types admin) → AM-18 (Onglets) → AM-19 (Config panels) → AM-20 (Formulaire)
                                                                      └── AM-21 (Keywords UI)
                                        AM-19 → AM-22 (Horaires UI)
AM-06 → AM-23 (Endpoint business-hours)
AM-11 → AM-24 (Endpoint keywords guards)
```

---

# Option future — OPT-01 : Seuil par scope

**Complexité :** Élevée — hors scope v1  
**Description :** Permettre un seuil de déclenchement différent selon le poste ou le canal pour les triggers A, E, H.  
**Architecture :** Nouvelle table `auto_message_trigger_scope_override(trigger_type, scope_type, scope_id, threshold_minutes)`. Le job maître charge les overrides au démarrage et calcule le seuil effectif par conversation avant chaque décision d'envoi.  
**Prérequis :** Tous les tickets AM terminés et stabilisés en production.
