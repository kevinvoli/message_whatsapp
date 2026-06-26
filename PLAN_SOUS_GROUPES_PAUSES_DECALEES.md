# Plan d'implémentation — Sous-groupes et pauses décalées

> **Branche cible : `production`**
> Le module `commercial-group` existait sur `master`. Il a été porté sur `production` via `git checkout master -- src/commercial-group/` et `git stash pop`.
> Toute implémentation se fait sur la branche `production` directement. Ne jamais travailler sur `master` pour cette feature.
> La section 15 documente les angles morts identifiés par analyse croisée `production` ↔ `master` — à lire avant tout développement.
>
> **Architecture des branches :**
> - `production` = branche de déploiement active. C'est là que vit cette feature.
> - `master` = branche future (refactoring complet). N'est PAS la cible de déploiement actuelle.
> - CommercialGroup, CommercialPlanningService, GroupScheduleService ont été portés de `master` → `production` via stash.
> - Les nouvelles entités (CommercialSubGroup, SubGroupBreakSchedule, BreakExclusion, BreakSession) et les migrations sont créées directement sur `production`.

---

## 1. Vue d'ensemble

Assurer la continuité du service commercial sans heure creuse grâce à des **sous-groupes** (`CommercialSubGroup`) rattachés à un `CommercialGroup` parent. Chaque sous-groupe possède un **emploi du temps de pause journalier décalé** : pendant que le sous-groupe A est en pause, le sous-groupe B reste en service.

Bénéfices :
- Zéro rupture de couverture commerciale (pauses échelonnées).
- Rappel automatique au commercial (pop-up + audio) à l'heure de sa pause.
- Expiration de la pause non prise (discipline horaire).
- Supervision admin des déconnexions anormalement longues.
- Réutilisation intégrale du moteur de planning existant (cycles, absences, remplacements).

### Périmètre fonctionnel
1. Hiérarchie groupe parent → sous-groupes.
2. Configuration admin des plages de pause par sous-groupe.
3. Pop-up commercial avec rappel récurrent + audio.
4. Expiration de la pause si non prise avant la fin de plage.
5. Surveillance des déconnexions longues (notification admin).
6. Page supervision admin (présence + pauses + déconnexions).
7. Exclusions (par poste, par commercial).

---

## 2. Éléments réutilisables identifiés

| Élément existant | Chemin | Réutilisation |
|---|---|---|
| `CommercialGroup` entity | `message_whatsapp/src/commercial-group/entities/commercial-group.entity.ts` | Parent des sous-groupes — ajouter relation `OneToMany subGroups` |
| `GroupScheduleDay` entity | `message_whatsapp/src/commercial-group/entities/group-schedule-day.entity.ts` | Le cycle jours travaillés/repos reste au niveau **groupe parent** — pas de duplication |
| `GroupScheduleService` | `message_whatsapp/src/commercial-group/group-schedule.service.ts` | Génération calendrier inchangée — les sous-groupes héritent du calendrier parent |
| `CommercialPlanningService` | `message_whatsapp/src/commercial-group/commercial-planning.service.ts` | Absences/remplacements inchangés (par commercial) |
| `CommercialGroupController` (AdminGuard) | `message_whatsapp/src/commercial-group/commercial-group.controller.ts` | Étendre avec routes sous-groupes + config pauses |
| `AgentPresenceService` | `message_whatsapp/src/redis/agent-presence.service.ts` | `isPresent()`, `setPresent/setAbsent`, event `agent.presence_expired` — base de la détection déconnexion |
| `AgentConnectionService` | `message_whatsapp/src/realtime/connections/agent-connection.service.ts` | `onConnect`/`onDisconnect` — point d'accroche pour tracer début/fin de déconnexion |
| `WhatsappMessageGateway` | `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Rooms `commercial:{id}`, `poste:{id}`, `tenant:{id}` — émission ciblée du pop-up |
| Constantes socket (BE) | `message_whatsapp/src/realtime/events/socket-events.constants.ts` | Ajouter les nouveaux types d'événements |
| Constantes socket (FE miroir) | `front/src/lib/socket/socket-events.constants.ts` | **Doit rester identique au BE** — ajout symétrique obligatoire |
| `CalendarRegenJob` (pattern cron) | `message_whatsapp/src/commercial-group/jobs/calendar-regen.job.ts` | Modèle pour le cron de surveillance déconnexions |
| `SystemConfigService` | `message_whatsapp/src/system-config/system-config.service.ts` | Stockage des seuils configurables (timezone déjà lu ainsi) |
| Médiathèque / assets audio | `message_whatsapp/src/catalog/` + `admin/src/app/ui/MediathequeView.tsx` | Source des URL audio du pop-up (type `AssetMediaType.AUDIO` déjà géré) |
| `WhatsappCommercial` | `message_whatsapp/src/whatsapp_commercial/entities/user.entity.ts` | `groupId`, `isWorkingToday`, `workingTodaySince` déjà présents — ajouter `subGroupId` |
| Présence admin | `admin/src/app/commercial-groups/presence/page.tsx`, `admin/src/app/ui/PresenceView.tsx`, `GroupPresenceTable.tsx` | Étendre pour colonnes pauses/déconnexions |
| Vue groupes admin | `admin/src/app/ui/CommercialGroupsView.tsx` | Étendre avec gestion sous-groupes |
| API groupes admin | `admin/src/app/lib/api/commercial-groups.api.ts` | Étendre avec appels sous-groupes + pauses |
| Filtre période global | (style existant `PresenceView`) | Réutiliser le composant de filtre période |
| `SocketProvider` (FE) | `front/src/contexts/SocketProvider.tsx` | Socket déjà disponible — y brancher l'écoute du pop-up |

### Décision d'architecture clé
Le **cycle de travail (jours ON/OFF), les absences et les remplacements restent au niveau du `CommercialGroup` parent et du commercial individuel**. Les sous-groupes n'ajoutent **que** la dimension « plage de pause journalière ». On évite ainsi de dupliquer `GroupScheduleDay` et `CommercialPlanning` par sous-groupe.

---

## 3. Risques de duplication

- **Calcul timezone / date du jour** : la logique `new Intl.DateTimeFormat('fr-CA', { timeZone })` est répétée dans `GroupScheduleService` et `CommercialPlanningService`. Avant d'ajouter une 3e copie dans le moteur de pauses, **extraire un utilitaire commun** `getTodayLocalString(tz)` / `nowLocal(tz)`.
  - Tâche dédiée : `message_whatsapp/src/commercial-group/utils/local-date.util.ts`.
- **Détection présence/déconnexion** : ne pas réimplémenter un suivi de présence — réutiliser `AgentPresenceService.isPresent()` et l'event `agent.presence_expired`. Le moteur de surveillance ne fait qu'**agréger** une durée à partir de ces signaux.
- **Émission socket ciblée** : ne pas créer de nouvelle gateway — réutiliser la room `commercial:{id}` de `WhatsappMessageGateway`.
- **Lecture audio** : ne pas créer un nouveau stockage d'audio — réutiliser la médiathèque (`information_category_asset` type `audio`).

---

## 4. Contrat d'interface (Tâche 0 — obligatoire avant parallélisation)

### 4.1 DTOs d'entrée (backend)

```ts
// Création / mise à jour sous-groupe
CreateSubGroupDto {
  parentGroupId: string;        // UUID groupe parent — requis
  name: string;                 // requis, 1..100
  description?: string;         // optionnel, max 255
}
UpdateSubGroupDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

// Configuration d'une plage de pause d'un sous-groupe
UpsertBreakScheduleDto {
  startTime: string;            // 'HH:mm' (24h) — requis
  endTime: string;              // 'HH:mm' — requis, > startTime
  reminderIntervalMinutes: number;  // défaut 5, min 1, max 60
  popupMessageText?: string;        // texte du pop-up, max 1000
  popupAudioAssetId?: string;       // UUID asset médiathèque (type audio), nullable
  maxDurationMinutes: number;       // durée max avant expiration, min 1
}

// Exclusions
CreateBreakExclusionDto {
  subGroupId: string;           // UUID — requis
  scope: 'poste' | 'commercial';// requis
  posteId?: string;             // requis si scope='poste'
  commercialId?: string;        // requis si scope='commercial'
}

// Action commerciale : prise de pause
TakeBreakDto {
  breakScheduleId: string;      // UUID de la plage active
}

// Config supervision (SystemConfig)
// clé: BREAK_DISCONNECT_ALERT_MINUTES (int, défaut 15)
```

### 4.2 Interfaces de réponse

```ts
SubGroupResponse {
  id: string;
  parentGroupId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  breakSchedules: BreakScheduleResponse[];
  memberCount: number;
}

BreakScheduleResponse {
  id: string;
  subGroupId: string;
  startTime: string;            // 'HH:mm'
  endTime: string;
  reminderIntervalMinutes: number;
  popupMessageText: string | null;
  popupAudioUrl: string | null; // résolue depuis l'asset médiathèque
  maxDurationMinutes: number;
}

// Pop-up poussé au commercial (socket)
BreakPromptPayload {
  breakScheduleId: string;
  subGroupName: string;
  endTime: string;              // 'HH:mm' fin de plage
  messageText: string | null;
  audioUrl: string | null;
  reminderIntervalMinutes: number;
  expiresAt: string;            // ISO — fin de plage (pause perdue après)
}

// Ligne supervision admin
BreakSupervisionRow {
  commercialId: string;
  commercialName: string;
  subGroupId: string | null;
  subGroupName: string | null;
  scheduledBreak: { startTime: string; endTime: string } | null;
  hasTakenBreak: boolean;
  breakTakenAt: string | null;  // ISO
  disconnectDurationMinutes: number | null;
  status: 'en_service' | 'en_pause' | 'pause_manquee' | 'deconnecte' | 'repos' | 'absent';
}

DisconnectAlert {
  commercialId: string;
  commercialName: string;
  disconnectedSince: string;    // ISO
  totalDisconnectMinutes: number;
}
```

### 4.3 Endpoints

| Méthode | Route | Guard | Body | Réponse |
|---|---|---|---|---|
| POST | `/commercial-groups/sub-groups` | AdminGuard | `CreateSubGroupDto` | `SubGroupResponse` |
| GET | `/commercial-groups/:id/sub-groups` | AdminGuard | — | `SubGroupResponse[]` |
| PATCH | `/commercial-groups/sub-groups/:id` | AdminGuard | `UpdateSubGroupDto` | `SubGroupResponse` |
| DELETE | `/commercial-groups/sub-groups/:id` | AdminGuard | — | `204` (soft-delete) |
| POST | `/commercial-groups/sub-groups/:id/members` | AdminGuard | `{ commercialId }` | `SubGroupResponse` |
| DELETE | `/commercial-groups/sub-groups/:id/members/:commercialId` | AdminGuard | — | `SubGroupResponse` |
| PUT | `/commercial-groups/sub-groups/:id/break-schedule` | AdminGuard | `UpsertBreakScheduleDto` | `BreakScheduleResponse` |
| GET | `/commercial-groups/sub-groups/:id/break-schedule` | AdminGuard | — | `BreakScheduleResponse[]` |
| DELETE | `/commercial-groups/break-schedule/:id` | AdminGuard | — | `204` |
| POST | `/commercial-groups/sub-groups/:id/exclusions` | AdminGuard | `CreateBreakExclusionDto` | `BreakExclusion` |
| DELETE | `/commercial-groups/exclusions/:id` | AdminGuard | — | `204` |
| GET | `/commercial-groups/break-supervision?from=&to=` | AdminGuard | — | `BreakSupervisionRow[]` |
| GET | `/commercial-groups/disconnect-alerts` | AdminGuard | — | `DisconnectAlert[]` |
| POST | `/commercial/break/take` | AuthGuard('jwt') | `TakeBreakDto` | `{ ok: true }` |

> Attention ordre des routes NestJS : déclarer toutes les routes statiques (`sub-groups`, `break-schedule`, `break-supervision`, `disconnect-alerts`) **avant** les routes paramétrées `:id` du `CommercialGroupController` existant (même contrainte déjà respectée dans le fichier actuel).

---

## 5. Épics et User Stories

### E1 — Modèle de données sous-groupes (BE)
- **US-1.1** Entité `CommercialSubGroup` + relation parent/membres.
  - AC : table `commercial_sub_group`, FK parent, soft-delete, `subGroupId` ajouté sur `whatsapp_commercial`. (BE)
- **US-1.2** Entité `SubGroupBreakSchedule` (plages de pause).
  - AC : champs start/end/intervalle/message/audio/maxDuration ; plusieurs plages possibles par sous-groupe. (BE)
- **US-1.3** Entité `BreakExclusion` (exclusions poste/commercial).
  - AC : un commercial exclu (direct ou via son poste) ne reçoit jamais de pop-up. (BE)
- **US-1.4** Entité `BreakSession` (trace des pauses prises) + `DisconnectLog` (suivi déconnexions).
  - AC : enregistre prise de pause (qui, quand, plage) et fenêtres de déconnexion. (BE)
- **US-1.5** Migration TypeORM unique regroupant E1.
  - AC : `SubGroupsAndBreaks<timestamp13>`. (BE)

### E2 — API admin sous-groupes & config pauses (BE + Admin)
- **US-2.1** CRUD sous-groupes + gestion membres. AC : endpoints section 4.3 fonctionnels, validation conflit poste héritée du parent. (BE)
- **US-2.2** CRUD plages de pause. AC : validation `endTime > startTime`, résolution `popupAudioUrl` depuis médiathèque. (BE)
- **US-2.3** CRUD exclusions. AC : scope poste ou commercial, cohérence validée. (BE)
- **US-2.4** UI admin gestion sous-groupes. AC : créer/éditer sous-groupe sous un groupe, configurer plages, sélectionner audio médiathèque, gérer exclusions. (Admin)

### E3 — Moteur de pauses & pop-up commercial (BE + FE)
- **US-3.1** Service `BreakScheduleEngine` : détermine, pour un commercial connecté, s'il entre dans sa plage de pause.
  - AC : tient compte sous-groupe, jour travaillé (calendrier parent), absences, exclusions. (BE)
- **US-3.2** Émission socket du pop-up à l'entrée de plage + rappel toutes les N minutes.
  - AC : event `BREAK_PROMPT` poussé sur room `commercial:{id}` ; arrêt des rappels si pause prise ou plage terminée. (BE)
- **US-3.3** Endpoint `POST /commercial/break/take` → enregistre `BreakSession` et déclenche la mise en pause/déconnexion.
  - AC : idempotent, refuse si hors plage ou déjà pris. (BE)
- **US-3.4** Expiration de la pause non prise.
  - AC : à `endTime`, si pas de `BreakSession`, marquer `pause_manquee`, stopper les pop-ups. (BE)
- **US-3.5** Composant pop-up commercial (FE).
  - AC : modal récurrente, lecture audio, bouton « Prendre ma pause », disparaît à la fin de plage. (FE)

### E4 — Surveillance des déconnexions (BE + Admin)
- **US-4.1** Trace début/fin de déconnexion via `AgentConnectionService` (onDisconnect/onConnect).
  - AC : `DisconnectLog` ouvert au disconnect, fermé au reconnect. (BE)
- **US-4.2** Cron de détection des déconnexions longues (> seuil configurable).
  - AC : génère `DisconnectAlert`, émet event admin temps réel. (BE)
- **US-4.3** Affichage des alertes dans le panel admin. (Admin)

### E5 — Supervision admin (Admin + BE)
- **US-5.1** Endpoint `GET /commercial-groups/break-supervision?from=&to=`. AC : agrège présence + pauses + déconnexions. (BE)
- **US-5.2** Page supervision : colonnes Nom / Sous-groupe / Heure pause prévue / A pris sa pause / Durée déconnexion / Statut + filtre période. (Admin)

---

## 6. Modèle de données

### 6.1 Nouvelles entités TypeORM

> Conventions : property `camelCase` + `name: 'snake_case'`, soft-delete `@DeleteDateColumn deletedAt`, PK uuid.

**`CommercialSubGroup`** — table `commercial_sub_group`
`message_whatsapp/src/commercial-group/entities/commercial-sub-group.entity.ts`

| Property | Colonne | Type SQL | Notes |
|---|---|---|---|
| id | id | char(36) PK | uuid |
| parentGroupId | parent_group_id | char(36) | FK → commercial_group.id |
| name | name | varchar(100) | |
| description | description | varchar(255) nullable | |
| isActive | is_active | tinyint(1) default 1 | |
| createdAt | created_at | datetime | `@CreateDateColumn` |
| updatedAt | updated_at | datetime | `@UpdateDateColumn` |
| deletedAt | deleted_at | datetime nullable | `@DeleteDateColumn` |

Relations : `@ManyToOne CommercialGroup` (onDelete CASCADE), `@OneToMany SubGroupBreakSchedule`, `@OneToMany WhatsappCommercial`.
Index : `IDX_sub_group_parent (parent_group_id)`, unique `UQ_sub_group_name (parent_group_id, name)`.

**`SubGroupBreakSchedule`** — table `sub_group_break_schedule`
`message_whatsapp/src/commercial-group/entities/sub-group-break-schedule.entity.ts`

| Property | Colonne | Type SQL | Notes |
|---|---|---|---|
| id | id | char(36) PK | |
| subGroupId | sub_group_id | char(36) | FK → commercial_sub_group.id |
| startTime | start_time | time | 'HH:mm:ss' |
| endTime | end_time | time | |
| reminderIntervalMinutes | reminder_interval_minutes | int default 5 | |
| popupMessageText | popup_message_text | varchar(1000) nullable | |
| popupAudioAssetId | popup_audio_asset_id | char(36) nullable | FK → information_category_asset.id (SET NULL) |
| maxDurationMinutes | max_duration_minutes | int default 60 | |
| createdAt / updatedAt / deletedAt | … | datetime | |

Index : `IDX_break_schedule_subgroup (sub_group_id)`.

**`BreakExclusion`** — table `break_exclusion`
`message_whatsapp/src/commercial-group/entities/break-exclusion.entity.ts`

| Property | Colonne | Type SQL | Notes |
|---|---|---|---|
| id | id | char(36) PK | |
| subGroupId | sub_group_id | char(36) | FK |
| scope | scope | enum('poste','commercial') | |
| posteId | poste_id | char(36) nullable | FK → whatsapp_poste (SET NULL) |
| commercialId | commercial_id | char(36) nullable | FK → whatsapp_commercial (SET NULL) |
| createdAt / deletedAt | … | datetime | |

Index : `IDX_exclusion_subgroup (sub_group_id)`.

**`BreakSession`** — table `break_session`
`message_whatsapp/src/commercial-group/entities/break-session.entity.ts`

| Property | Colonne | Type SQL | Notes |
|---|---|---|---|
| id | id | char(36) PK | |
| commercialId | commercial_id | char(36) | FK |
| breakScheduleId | break_schedule_id | char(36) | FK |
| date | date | date | jour de la pause (clé d'idempotence) |
| takenAt | taken_at | datetime | moment du clic « Prendre ma pause » |
| status | status | enum('taken','missed') default 'taken' | |
| createdAt | created_at | datetime | |

Index : unique `UQ_break_session (commercial_id, break_schedule_id, date)` (idempotence prise de pause).

**`DisconnectLog`** — table `disconnect_log`
`message_whatsapp/src/commercial-group/entities/disconnect-log.entity.ts`

| Property | Colonne | Type SQL | Notes |
|---|---|---|---|
| id | id | char(36) PK | |
| commercialId | commercial_id | char(36) | FK |
| posteId | poste_id | char(36) nullable | |
| disconnectedAt | disconnected_at | datetime | |
| reconnectedAt | reconnected_at | datetime nullable | NULL = encore déconnecté |
| durationMinutes | duration_minutes | int nullable | calculé au reconnect |
| alertedAt | alerted_at | datetime nullable | anti-doublon notification |
| createdAt | created_at | datetime | |

Index : `IDX_disconnect_commercial (commercial_id)`, `IDX_disconnect_open (reconnected_at)`.

### 6.2 Modifications d'entités existantes

**`WhatsappCommercial`** (`message_whatsapp/src/whatsapp_commercial/entities/user.entity.ts`)
- Ajouter `subGroupId` / `sub_group_id` char(36) nullable + `@ManyToOne(() => CommercialSubGroup)`.

**`CommercialGroup`** (`message_whatsapp/src/commercial-group/entities/commercial-group.entity.ts`)
- Ajouter `@OneToMany(() => CommercialSubGroup, (s) => s.parentGroup) subGroups?`.

### 6.3 Migration

`message_whatsapp/src/database/migrations/<NomFichier>.ts`
- Classe : `SubGroupsAndBreaks1750000000000` (suffixe timestamp JS 13 chiffres — adapter à la date réelle de génération).
- Contenu : créer les 5 tables ci-dessus + colonne `sub_group_id` sur `whatsapp_commercial` + FK + index.
- `TYPEORM_SYNCHRONIZE=false` : générer via `npm run migration:generate -- --name SubGroupsAndBreaks` puis vérifier le SQL. (Migrations appliquées automatiquement au déploiement — ne pas lancer `migration:run` manuellement.)

---

## 7. API Backend — services

| Service / fichier | Rôle |
|---|---|
| `commercial-sub-group.service.ts` | CRUD sous-groupes + membres (réutilise la validation conflit-poste de `CommercialGroupService.addMember`) |
| `break-schedule.service.ts` | CRUD plages de pause + résolution `popupAudioUrl` via repo `information_category_asset` |
| `break-exclusion.service.ts` | CRUD exclusions + helper `isExcluded(commercialId, posteId, subGroupId)` |
| `break-schedule-engine.service.ts` | Cœur métier : pour chaque commercial connecté, calcule l'état de pause (entrée plage, rappel dû, expiration) ; émet `BREAK_PROMPT` |
| `break-session.service.ts` | `takeBreak()` idempotent, marquage `missed` à l'expiration |
| `disconnect-monitor.service.ts` | Ouvre/ferme les `DisconnectLog` (branché sur `AgentConnectionService`), produit les `DisconnectAlert` |
| `break-supervision.service.ts` | Agrégation `BreakSupervisionRow[]` pour l'admin (présence + sessions + déconnexions) |
| `utils/local-date.util.ts` | **Extraction** du calcul timezone/date locale (factorisation, cf. section 3) |

Contrôleurs :
- Étendre `commercial-group.controller.ts` (AdminGuard) avec les routes sous-groupes / pauses / exclusions / supervision / disconnect-alerts.
- Nouveau `commercial-break.controller.ts` (AuthGuard('jwt')) pour `POST /commercial/break/take`.

Module : enregistrer les nouvelles entités et services dans `message_whatsapp/src/commercial-group/commercial-group.module.ts` ; importer `RedisModule` (présence) et le module catalog/médiathèque pour le repo asset.

---

## 8. Frontend commercial (`front/`)

| Fichier | Nature |
|---|---|
| `front/src/components/break/BreakPromptModal.tsx` | **Nouveau** — modal pop-up : message, lecture `<audio>`, bouton « Prendre ma pause », compte à rebours jusqu'à `expiresAt` |
| `front/src/hooks/useBreakPrompt.ts` | **Nouveau** — écoute l'event socket `BREAK_PROMPT`, gère l'état (visible, rappel, expiré), appelle l'API `take` |
| `front/src/lib/socket/socket-events.constants.ts` | **Modifier** — ajouter les types d'événements (miroir BE) |
| `front/src/lib/api.ts` | **Modifier** — ajouter `takeBreak(breakScheduleId)` → `POST /commercial/break/take` |
| `front/src/app/whatsapp/page.tsx` | **Modifier** — monter `<BreakPromptModal>` via le hook, au niveau du layout connecté |
| Lecture audio | Utiliser l'URL `audioUrl` servie (médiathèque, pattern `/uploads/...`) |

### Mécanisme de déclenchement
- **WebSocket (recommandé)** : le backend (`BreakScheduleEngine`, piloté par un `@Interval`) pousse `BREAK_PROMPT` sur la room `commercial:{id}` à l'entrée de plage puis à chaque intervalle de rappel. Le front est purement réactif (pas de timer métier côté client), ce qui garde l'heure de référence serveur.
- Le front affiche/relance la modal selon les payloads reçus ; un payload `BREAK_PROMPT_CLEAR` (ou flag `expired`) ferme la modal à la fin de plage ou après prise de pause.
- Dates affichées via `front/src/lib/dateUtils.ts` (`formatTime`).

---

## 9. Panel admin (`admin/`)

| Fichier | Nature |
|---|---|
| `admin/src/app/ui/SubGroupsManager.tsx` | **Nouveau** — gestion sous-groupes sous un groupe (liste, créer, éditer, supprimer, membres) |
| `admin/src/app/ui/BreakScheduleForm.tsx` | **Nouveau** — config plages : start/end, intervalle, message, sélecteur audio médiathèque, durée max |
| `admin/src/app/ui/BreakExclusionsPanel.tsx` | **Nouveau** — gestion exclusions (poste / commercial) |
| `admin/src/app/commercial-groups/supervision/page.tsx` | **Nouveau** — page supervision (tableau + filtre période) |
| `admin/src/app/ui/BreakSupervisionTable.tsx` | **Nouveau** — colonnes Nom / Sous-groupe / Heure pause prévue / A pris sa pause / Durée déconnexion / Statut |
| `admin/src/app/ui/DisconnectAlertsBanner.tsx` | **Nouveau** — bannière/notification alertes déconnexions |
| `admin/src/app/ui/CommercialGroupsView.tsx` | **Modifier** — point d'entrée vers `SubGroupsManager` |
| `admin/src/app/lib/api/commercial-groups.api.ts` | **Modifier** — ajouter appels sous-groupes / pauses / exclusions / supervision / alertes |
| `admin/src/app/lib/definitions.ts` | **Modifier** — types `SubGroup`, `BreakSchedule`, `BreakExclusion`, `BreakSupervisionRow`, `DisconnectAlert` |
| Filtre période | Réutiliser le composant de filtre période de `PresenceView.tsx` |
| Dates | Via `admin/src/app/lib/dateUtils.ts` |

---

## 10. Événements temps réel (Socket.io)

À ajouter **symétriquement** dans `message_whatsapp/src/realtime/events/socket-events.constants.ts` ET `front/src/lib/socket/socket-events.constants.ts` (les deux fichiers doivent rester identiques — contrôle PR).

| Événement | Sens | Room | Payload |
|---|---|---|---|
| `BREAK_PROMPT` | Serveur → Commercial | `commercial:{id}` | `BreakPromptPayload` |
| `BREAK_PROMPT_CLEAR` | Serveur → Commercial | `commercial:{id}` | `{ breakScheduleId, reason: 'taken' \| 'expired' }` |
| `BREAK_DISCONNECT_ALERT` | Serveur → Admin | room admin / `tenant:{id}` | `DisconnectAlert` |

> Émission via `WhatsappMessageGateway.server` (réutiliser le `@WebSocketServer` existant et les helpers d'émission par room). Ne pas créer de nouvelle gateway.

---

## 11. Crons / Jobs

| Job / fichier | Fréquence | Rôle |
|---|---|---|
| `BreakScheduleEngine` (`@Interval(30_000)` ou `@Interval(60_000)`) `message_whatsapp/src/commercial-group/break-schedule-engine.service.ts` | toutes 30–60 s | Évalue les commerciaux connectés ; pousse `BREAK_PROMPT` à l'entrée de plage et selon l'intervalle de rappel ; marque `missed` à l'expiration |
| `DisconnectMonitorJob` (`@Cron`/`@Interval`) `message_whatsapp/src/commercial-group/jobs/disconnect-monitor.job.ts` | toutes ~1 min | Détecte les `DisconnectLog` ouverts > seuil (`BREAK_DISCONNECT_ALERT_MINUTES`), émet `BREAK_DISCONNECT_ALERT`, renseigne `alertedAt` (anti-doublon) |

> Modèle : `message_whatsapp/src/commercial-group/jobs/calendar-regen.job.ts`. Idempotence obligatoire (anti-doublon via `alertedAt`, `UQ_break_session`).

---

## 12. Ordre d'implémentation recommandé

### Sprint 0 (préalable, bloquant)
1. **Tâche 0** — figer le contrat d'interface (section 4) — *architect*.
2. Extraire `utils/local-date.util.ts` (factorisation timezone) — *backend-dev*.

### Sprint 1 — Fondations données + API admin
3. E1 (US-1.1 → 1.5) entités + migration — *backend-dev*.
4. E2 US-2.1/2.2/2.3 services + endpoints CRUD — *backend-dev*.
5. E2 US-2.4 UI admin sous-groupes + config pauses + exclusions — *frontend-dev (admin)*.

### Sprint 2 — Moteur de pauses + pop-up
6. E3 US-3.1/3.2/3.3/3.4 moteur + socket + take + expiration — *backend-dev*.
7. Événements socket symétriques BE/FE (section 10) — *backend-dev + frontend-dev*.
8. E3 US-3.5 pop-up commercial (modal + hook + audio) — *frontend-dev (front)*.

### Sprint 3 — Surveillance + supervision
9. E4 US-4.1/4.2 trace déconnexions + cron alertes — *backend-dev*.
10. E5 US-5.1 endpoint supervision — *backend-dev*.
11. E4 US-4.3 + E5 US-5.2 page supervision admin + alertes — *frontend-dev (admin)*.

### Sprint 4 — Qualité
12. Tests (Jest BE : moteur pauses, idempotence take, exclusions, expiration ; agrégation supervision) — *tester*.
13. Revue sécurité + perf (N+1 sur supervision, paramètres liés, pas de secrets en logs) — *reviewer*.

> Après Tâche 0, BE et FE/Admin parallélisent sur le contrat figé.

---

## 13. Points d'attention / risques

- **Timezone** : toute comparaison « heure courante vs plage de pause » doit utiliser `APP_TIMEZONE` (`SystemConfigService`, défaut `Africa/Abidjan`). Ne jamais comparer en heure serveur brute.
- **Pauses tous les jours sans exception** : la plage s'applique chaque jour, MAIS uniquement si le commercial est en jour travaillé (calendrier parent) et non absent. Croiser avec `GroupScheduleDay` (groupe parent) + `CommercialPlanning` (absences) — réutiliser les helpers existants `getTodayWorkingGroupIds()` / `getTodayAbsenceIds()`.
- **Exclusions cumulatives** : un commercial est exclu s'il est ciblé directement OU si son poste est exclu. Évaluer les deux dans `isExcluded()`.
- **Idempotence** : `takeBreak()` protégé par `UQ_break_session (commercial_id, break_schedule_id, date)` ; alertes déconnexion protégées par `alertedAt`.
- **N+1** : la supervision joint commerciaux + sous-groupes + sessions + déconnexions — utiliser `leftJoinAndSelect` / `IN (:...ids)`, jamais de requête en boucle.
- **Sockets fantômes** : `AgentConnectionService` purge déjà les sockets fantômes ; le `DisconnectMonitor` doit s'appuyer sur la vérité de présence (`AgentPresenceService.isPresent`) et non sur un simple event disconnect, pour éviter de fausses alertes lors d'une reconnexion immédiate.
- **Expiration vs prise** : à `endTime`, fermer proprement (émettre `BREAK_PROMPT_CLEAR reason='expired'`) et marquer `missed` — éviter qu'un pop-up reste affiché.
- **Audio médiathèque** : valider que `popupAudioAssetId` référence bien un asset `AssetMediaType.AUDIO` actif ; URL résolue côté backend (ne pas exposer de chemin interne).
- **Conflit poste hérité** : un sous-groupe ne doit pas regrouper deux commerciaux du même poste si la règle parente l'interdit — réutiliser la validation existante de `addMember`.
- **Soft-delete** : filtrer `deletedAt IS NULL` (`IsNull()`) sur toutes les nouvelles entités dans les lectures.
- **Migration prod** : `TYPEORM_SYNCHRONIZE=false`, migration appliquée automatiquement au déploiement — vérifier le SQL généré avant merge.
- **Sécurité** : paramètres liés uniquement (QueryBuilder), `AdminGuard` sur l'admin, `AuthGuard('jwt')` sur `/commercial/break/take`, zéro `any`, pas de secret ni d'URL audio sensible en logs.
- **Branche** : développer sur `master` (le module n'existe pas sur `production`).

---

## 14. Intégration avec les fonctionnalités groupes existantes (master)

Cette section précise comment les éléments déjà présents sur master s'articulent avec la nouvelle fonctionnalité. Chaque point indique si l'élément est inchangé, étendu ou contraint.

### 14.1 Calendar Health — alertes calendriers expirants

`GroupScheduleService.getGroupsWithExpiringCalendar()` + endpoint `GET /commercial-groups/planning/calendar-health` + alerte affichée dans `CommercialPlanningView`.

**Décision : inchangé.** Les sous-groupes n'ont pas de calendrier généré qui peut expirer — leurs plages de pause sont permanentes et s'appliquent tous les jours sans génération préalable. Ce mécanisme reste strictement au niveau des groupes parents.

### 14.2 Auto-déclaration d'absence par les commerciaux

`CommercialSelfPlanningController` (`POST /planning/self/absence`) — les commerciaux déclarent eux-mêmes leurs absences sur une plage de dates.

**Décision : inchangé, comportement passif vis-à-vis des pauses.** Un commercial qui déclare une absence via ce controller est traité comme absent par le `BreakScheduleEngine` (via `getTodayAbsenceIds()`) — il ne reçoit aucun pop-up ce jour-là. Aucune modification du controller ou du service n'est nécessaire.

### 14.3 Navigation admin — nouveau menu "Groupes"

**Décision : remplacer le point d'entrée `PlanningTabsView` par un nouveau menu "Groupes" à onglets multiples.**

L'ajout des sous-groupes, plages de pause et supervision justifie une restructuration de la navigation admin. Le composant `PlanningTabsView` (`admin/src/app/ui/PlanningTabsView.tsx`) est étendu — ou remplacé par un nouveau composant `GroupsTabsView` — avec les onglets suivants :

| # | Onglet | Composant | Statut |
|---|---|---|---|
| 1 | Gestion des groupes | `CommercialGroupsView.tsx` (+ lien vers `SubGroupsManager`) | Existant — étendu |
| 2 | Sous-groupes & pauses | `SubGroupsManager.tsx` + `BreakScheduleForm.tsx` + `BreakExclusionsPanel.tsx` | Nouveau |
| 3 | Plannings de travail | `GroupsCalendarView.tsx` | Existant — inchangé |
| 4 | Présence du jour | `PresenceView.tsx` | Existant — inchangé |
| 5 | Absences & remplacements | `CommercialPlanningView.tsx` | Existant — inchangé |
| 6 | Calendrier mensuel | `CalendarMonthView.tsx` | Existant — inchangé |
| 7 | Bilan absences | `AbsenceSummaryTable.tsx` | Existant — inchangé |
| 8 | Historique | `PlanningAuditView.tsx` | Existant — étendu (voir 14.4) |
| 9 | Heures de travail | `SessionsView.tsx` | Existant — inchangé |
| 10 | Supervision pauses | `BreakSupervisionTable.tsx` + `DisconnectAlertsBanner.tsx` | Nouveau |

Fichier à modifier : `admin/src/app/ui/PlanningTabsView.tsx` (ajout des onglets 2 et 10, renommage éventuel en `GroupsTabsView.tsx`).

### 14.4 PlanningAuditView — extension aux événements de pause

`GET /commercial-groups/planning/audit` (`PlanningAuditView.tsx`) journalise les créations/suppressions d'absences via `commercial_planning_audit`.

**Décision : étendu.** Les événements suivants doivent être tracés dans un journal d'audit accessible depuis cet onglet (ou un onglet dédié "Historique pauses") :
- Prise de pause (`BreakSession` status `taken`) — qui, quelle plage, à quelle heure
- Pause manquée (`BreakSession` status `missed`) — qui, quelle plage, date
- Alerte déconnexion déclenchée (`DisconnectLog.alertedAt` renseigné)

Options d'implémentation :
- **Option A** (recommandée) : étendre `PlanningAuditView` avec un filtre `source: planning | pauses` — même composant, deux sources de données.
- **Option B** : onglet "Historique pauses" séparé dans `GroupsTabsView`.

Le backend doit exposer un endpoint dédié : `GET /commercial-groups/break-audit?from=&to=&commercialId=` → agrège `break_session` + `disconnect_log` avec les mêmes paramètres de filtre que l'audit existant.

### 14.5 AbsenceSummaryTable — bilan mensuel

`GET /commercial-groups/planning/summary/:year/:month` agrège les jours d'absence par commercial sur un mois.

**Décision : inchangé pour les absences.** Le bilan mensuel des absences reste tel quel. Pas d'extension aux pauses manquées dans ce composant — les pauses manquées sont visibles via la supervision (onglet 10) et l'audit (onglet 8).

### 14.6 GroupsCalendarView — vue calendrier multi-groupes

Composant `admin/src/app/ui/groups/GroupsCalendarView.tsx` (302 lignes) affichant le calendrier jours-travaillés/repos par groupe sur un mois.

**Décision : inchangé, les sous-groupes n'apparaissent pas dans cette vue.** Le calendrier jours ON/OFF est une propriété du groupe parent — les sous-groupes n'ont pas de calendrier de ce type. Cette vue ne doit pas être modifiée.

### 14.7 GroupPresenceTable — statut du jour par groupe

Composant `admin/src/app/ui/groups/GroupPresenceTable.tsx` affichant si chaque groupe est en jour de travail ou de repos aujourd'hui.

**Décision : inchangé.** Les sous-groupes et leurs plages de pause n'apparaissent pas dans ce composant. La supervision des pauses est centralisée dans l'onglet dédié (voir 14.3, onglet 10).

### 14.8 CalendarRegenJob — régénération mensuelle des calendriers

Cron `0 1 1 * *` dans `message_whatsapp/src/commercial-group/jobs/calendar-regen.job.ts` — régénère les calendriers `group_schedule_day` de tous les groupes actifs.

**Décision : inchangé.** Les sous-groupes n'ont pas de `GroupScheduleDay` — leurs plages de pause sont permanentes. Ce cron ne concerne que les groupes parents et ne doit pas être modifié.

### 14.9 timeSlot et exclusions — comportement sur les absences demi-journée

`CommercialPlanning.timeSlot` (`full | morning | afternoon`) permet de déclarer une absence partielle.

**Décision : les commerciaux exclus sont hors périmètre complet de la fonctionnalité.** Un commercial marqué dans `BreakExclusion` (directement ou via son poste) est traité comme un utilisateur non soumis aux règles de pause — typiquement des comptes de test, des superviseurs ou des administrateurs ayant un compte commercial. `isExcluded()` retourne `true` → le `BreakScheduleEngine` ignore ce commercial entièrement, sans évaluer son `timeSlot` ni son calendrier.

Pour les commerciaux **non exclus**, la règle est : si le commercial a une absence `timeSlot = 'morning'` ce jour et que sa plage de pause est l'après-midi (ex: 14h–15h), la plage s'applique normalement (il est présent l'après-midi). Si `timeSlot = 'full'`, il est absent toute la journée → aucun pop-up. L'évaluation se fait en croisant `timeSlot` avec `startTime` de la plage :

```
si absence.timeSlot = 'morning'  → bloquer plages dont startTime < 12:00
si absence.timeSlot = 'afternoon' → bloquer plages dont startTime >= 12:00
si absence.timeSlot = 'full'      → bloquer toutes les plages
```

Implémenter cette logique dans `BreakScheduleEngine` (méthode privée `isActiveForBreak(commercial, breakSchedule, todayAbsences)`).

> Ajouter le type `BreakEligibility` dans le contrat d'interface (section 4) : `{ eligible: boolean; reason?: 'excluded' | 'absent_full' | 'absent_slot' | 'not_work_day' | 'break_taken' | 'break_expired' }` — utile pour le debug et les tests.

---

## 15. Angles morts — Intégration dans `production`

Cette section documente les écarts entre `master` (branche de développement) et `production` (branche déployée), détectés par analyse croisée. Chaque angle mort indique un ajustement à faire avant ou pendant l'implémentation.

> Stratégie globale : développer sur `master` → `master` remplacera `production` lors de la convergence (voir mémoire `project_master_replaces_production.md`). Ces angles morts sont donc des points de vigilance pour la fusion, pas des blocages immédiats.

---

### AM-01 — `DisconnectLog` est en doublon avec `ConnectionLog` (production)

**Observation** : Production possède le module `src/connection-log/` avec la table `messaging_connection_log` (colonnes : `user_id`, `user_type`, `login_at`, `logout_at`). Le gateway `WhatsappMessageGateway` appelle **déjà** `ConnectionLogService.logLogout()` dans `handleDisconnect()`.

**Problème** : Le plan crée une entité `DisconnectLog` distincte — doublon fonctionnel avec `messaging_connection_log`.

**Correction** : Supprimer `DisconnectLog` du plan. Le `DisconnectMonitorJob` doit **lire `messaging_connection_log`** pour détecter les sessions ouvertes longues :
```sql
SELECT user_id, login_at
FROM messaging_connection_log
WHERE user_type = 'commercial'
  AND logout_at IS NULL
  AND login_at < NOW() - INTERVAL :seuil MINUTE
```
- `alertedAt` devient une colonne à ajouter sur `messaging_connection_log` (migration légère) pour l'idempotence des alertes.
- `US-4.1` (créer `DisconnectLog`) est supprimée. `US-4.2` s'appuie sur `ConnectionLog`.
- Fichier à supprimer du plan : `commercial-group/entities/disconnect-log.entity.ts`.
- Fichier à modifier : `message_whatsapp/src/connection-log/entities/connection-log.entity.ts` (ajouter colonne `alerted_at datetime nullable`).

---

### AM-02 — `groupId`, `isWorkingToday`, `workingTodaySince` absents de `production`

**Observation** : Sur `production`, `WhatsappCommercial` ne contient pas `groupId` / `isWorkingToday` / `workingTodaySince`. Ces colonnes existent sur `master` (migrations `AddWorkingTodayToCommercial1747094400001` et `AddCommercialGroup1747094400002` présentes sur master, absentes de production).

**Problème** : La migration du plan (`SubGroupsAndBreaks`) ajoute `sub_group_id` en supposant que `group_id` existe déjà. Sur `production`, les deux migrations manquent.

**Correction** : La migration unique du plan doit être **scindée en deux** :

| Migration | Contenu | Ordre |
|---|---|---|
| `CommercialGroupFoundations<timestamp_A>` | Créer `commercial_group`, `group_schedule_day`, `commercial_planning`, `commercial_planning_audit` + colonnes `group_id`, `is_working_today`, `working_today_since` sur `whatsapp_commercial` | 1er |
| `SubGroupsAndBreaks<timestamp_B>` | Créer `commercial_sub_group`, `sub_group_break_schedule`, `break_exclusion`, `break_session` + colonne `sub_group_id` sur `whatsapp_commercial` | 2e (après A) |

`timestamp_A < timestamp_B` — les deux migrations s'appliquent séquentiellement lors de la convergence `production`.

---

### AM-03 — `AgentPresenceService` n'existe pas sur `production`

**Observation** : Sur `production`, il n'y a pas de `AgentPresenceService` ni de module `src/realtime/`. La présence commerciale est gérée par une `Map<socketId, {commercialId, posteId, ...}>` in-memory dans `WhatsappMessageGateway` (`connectedAgents`). Sur `master`, `AgentPresenceService` (Redis) est l'API de référence.

**Problème** : Le plan référence `AgentPresenceService.isPresent(commercialId)` comme source de vérité. Cette API n'existe pas sur `production`.

**Correction** : Le `BreakScheduleEngine` ne doit pas dépendre directement de `AgentPresenceService`. Implémenter une abstraction `PresenceQueryPort` avec deux adaptateurs :
- `RedisPresenceAdapter` (si `AgentPresenceService` est disponible — master)
- `GatewayPresenceAdapter` : expose une méthode `getConnectedCommercialIds(): string[]` extraite de `connectedAgents` via une méthode publique ajoutée au gateway

En pratique : ajouter une méthode `getConnectedCommercialIds(): string[]` dans `WhatsappMessageGateway` (qui itère sur `connectedAgents`) et l'injecter dans `BreakScheduleEngine` via le module. Lors de la convergence, si `master` a `AgentPresenceService`, remplacer par cet adaptateur.

---

### AM-04 — `socket-events.constants.ts` n'existe pas sur `production`

**Observation** : Sur `production`, il n'existe pas de fichier centralisé `socket-events.constants.ts` côté backend ni côté front. Les événements socket sont définis inline dans les gateways et composants.

**Problème** : Le plan suppose que ce fichier existe et demande de l'étendre. Il faut le créer.

**Correction** : Lors de l'implémentation, créer les deux fichiers de zéro :
- **Backend** : `message_whatsapp/src/whatsapp_message/socket-events.constants.ts` (à côté du gateway existant, pas dans `src/realtime/` qui n'existe pas sur `production`)
- **Front** : `front/src/lib/socket-events.constants.ts` (à côté de `api.ts`, pas dans `socket/` qui peut ne pas exister)

Contenu initial de chaque fichier : uniquement les 3 nouveaux événements (`BREAK_PROMPT`, `BREAK_PROMPT_CLEAR`, `BREAK_DISCONNECT_ALERT`). Ne pas tenter de centraliser les événements existants lors de ce sprint — hors périmètre.

---

### AM-05 — Navigation admin : système `ViewMode` à étendre

**Observation** : Sur `production`, le système de navigation admin est typé via `type ViewMode` dans `admin/src/app/lib/definitions.ts` (actuellement 29 valeurs : `overview`, `commerciaux`, `quiz`, etc.). Il n'y a pas de `commercial-groups` ni aucune vue liée aux groupes.

**Problème** : Le plan crée de nouveaux composants admin mais ne précise pas comment les intégrer dans la navigation.

**Correction** : Ajouter les ViewModes suivants dans `admin/src/app/lib/definitions.ts` :

```ts
| 'commercial-groups'        // Gestion des groupes (CommercialGroupsView)
| 'commercial-subgroups'     // Sous-groupes & pauses (SubGroupsManager)
| 'commercial-planning'      // PlanningTabsView (tous les onglets)
| 'break-supervision'        // Supervision pauses (BreakSupervisionTable)
```

Trouver le fichier de sidebar/layout admin (probablement `admin/src/app/dashboard/page.tsx` ou un composant `Sidebar`) et y ajouter un groupe de navigation `"Gestion des groupes"` avec ces 4 items. Ce fichier doit être identifié et listé explicitement dans le sprint 1 (US-2.4).

---

### AM-06 — `CommercialGroupModule` absent de `app.module.ts` sur `production`

**Observation** : `message_whatsapp/src/app.module.ts` sur `production` importe 32 modules. `CommercialGroupModule` n'en fait pas partie — il n'existe pas sur `production`.

**Problème** : Sans import dans `app.module.ts`, aucun controller ni service du module ne sera chargé.

**Correction** : L'import dans `app.module.ts` doit être ajouté **comme dernière étape du sprint 1** (après validation des entités et migrations), pas au début. Cela évite des erreurs de démarrage si les migrations n'ont pas encore tourné.

---

### AM-07 — `ConnectionLog` : données historiques disponibles pour la supervision

**Observation positive** : `messaging_connection_log` est alimenté depuis `ConnectionLog1746057600007.ts`. Il contient déjà l'historique des connexions/déconnexions de tous les commerciaux.

**Opportunité** : La page supervision admin (onglet 10) peut afficher la durée de déconnexion **réelle** calculée depuis `messaging_connection_log`, sans aucune nouvelle infrastructure de tracking. L'endpoint `GET /commercial-groups/break-supervision` peut joindre cette table directement.

```sql
-- Durée de déconnexion en cours pour un commercial
SELECT TIMESTAMPDIFF(MINUTE, login_at, NOW()) AS disconnect_minutes
FROM messaging_connection_log
WHERE user_id = :commercialId
  AND user_type = 'commercial'
  AND logout_at IS NULL
ORDER BY login_at DESC
LIMIT 1
```

---

### AM-08 — Ordre complet des migrations pour la convergence

Lors de la fusion `master` → `production`, les migrations doivent s'appliquer dans cet ordre (les migrations `production` existantes s'appliquent d'abord via le timestamp) :

```
[existantes production]          ← déjà appliquées
CommercialGroupFoundations<A>    ← nouveau (AM-02 : groupe parent + colonnes commercial)
SubGroupsAndBreaks<B>            ← nouveau (sous-groupes + break_session)
AddAlertedAtToConnectionLog<C>   ← nouveau (AM-01 : colonne alertedAt sur messaging_connection_log)
```

Les trois timestamps A < B < C doivent être supérieurs au dernier timestamp de migration production actuel. Dernier timestamp connu : `AddQuizHistoryVisible1782518400000` → utiliser des valeurs > `1782518400000`.

---

### AM-09 — Résumé des fichiers à créer / modifier côté `production` absents du plan initial

| Fichier | Action | Raison |
|---|---|---|
| `message_whatsapp/src/whatsapp_message/socket-events.constants.ts` | Créer | AM-04 : n'existe pas sur production |
| `front/src/lib/socket-events.constants.ts` | Créer | AM-04 : n'existe pas sur production |
| `message_whatsapp/src/connection-log/entities/connection-log.entity.ts` | Modifier | AM-01 : ajouter `alertedAt` |
| `admin/src/app/lib/definitions.ts` | Modifier | AM-05 : ajouter 4 ViewModes |
| Admin sidebar/layout | Modifier | AM-05 : identifier le fichier exact et ajouter le groupe "Gestion des groupes" |
| `message_whatsapp/src/app.module.ts` | Modifier | AM-06 : importer `CommercialGroupModule` |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Modifier | AM-03 : ajouter `getConnectedCommercialIds()` |
| Migration `CommercialGroupFoundations<A>` | Créer | AM-02 : fondations groupe parent (absent de production) |
| Migration `AddAlertedAtToConnectionLog<C>` | Créer | AM-01 : idempotence alertes déconnexion |
| Entité `disconnect-log.entity.ts` | Supprimer du plan | AM-01 : remplacée par `ConnectionLog` |
