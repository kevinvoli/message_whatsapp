# Plan d'évolution architecture — Entité `Application` pour la gestion des canaux

**Date :** 2026-05-20  
**Auteur :** Kevin Voli  
**Statut :** DRAFT — À valider avant implémentation  
**Contexte :** Système en production avec milliers d'utilisateurs — migration douce, zéro perte de données

---

## 1. Contexte et Objectif

### Problème actuel

Chaque canal (`whapi_channels`) stocke directement ses credentials d'application Meta :

```
whapi_channels
├── meta_app_id       varchar(64)   ← credential application
├── meta_app_secret   varchar(128)  ← credential application
├── verify_token      varchar(128)  ← credential application
└── token             text          ← token d'accès (par canal)
```

**Conséquences :**
- Plusieurs canaux Meta qui partagent la même application répètent les mêmes `meta_app_id` / `meta_app_secret`
- Ajouter un nouveau canal Messenger ou Instagram oblige à ressaisir les credentials de l'application
- Impossibilité de gérer un System User token partagé par plusieurs canaux d'une même application
- Pas de vue centralisée des applications Meta enregistrées

### Objectif

Introduire une entité `Application` (table `messaging_applications`) qui centralise les credentials d'une application Meta. Un canal référence son application via une FK. On peut ainsi :

1. Créer une application une seule fois (label, App ID, App Secret, token système optionnel)
2. Associer N canaux à cette application (WhatsApp, Messenger, Instagram)
3. Gérer le renouvellement de token au niveau de l'application, pas du canal

---

## 2. Modèle de données cible

### Nouvelle entité `MessagingApplication`

```
messaging_applications
├── id              UUID (PK)
├── label           varchar(100)  NOT NULL   — libellé affiché
├── provider        varchar(32)   NOT NULL   — 'meta' | 'whapi' | 'telegram'
├── app_id          varchar(64)   NOT NULL   — App ID Meta (client_id)
├── app_secret      varchar(128)  NOT NULL   — App Secret Meta (HMAC signing)
├── system_token    text          NULL       — System User token (permanent, si renseigné)
├── created_at      timestamp
└── updated_at      timestamp
```

**Règle métier sur `system_token` :**
- Quand renseigné → token de type System User (permanent, date d'expiration 2099)
- Quand NULL → chaque canal gère son propre token d'accès (logique actuelle)

### Modification de `whapi_channels`

```
whapi_channels (existant)
└── application_id  char(36)  NULL  FK → messaging_applications.id  ON DELETE SET NULL
```

Les colonnes `meta_app_id` et `meta_app_secret` restent présentes (rétrocompatibilité) mais sont marquées **dépréciées** — elles ne seront supprimées qu'une fois tous les canaux migrés.

### Relation

```
MessagingApplication  1 ──────── N  WhapiChannel
```

---

## 3. Règles de résolution des credentials (priorité)

Au moment où un service a besoin de `app_id` / `app_secret` / `token` pour un canal :

```
1. Si channel.application_id IS NOT NULL
   ├── app_id     = application.app_id
   ├── app_secret = application.app_secret
   └── token      = application.system_token ?? channel.token
   
2. Sinon (rétrocompatibilité — canaux existants sans application)
   ├── app_id     = channel.meta_app_id
   ├── app_secret = channel.meta_app_secret
   └── token      = channel.token
```

Cette règle est implémentée dans un helper `resolveChannelCredentials()` — point d'entrée unique, aucune logique dupliquée.

---

## 4. Stratégie de migration douce

### Principe

**Aucune rupture de production.** La migration se fait en 4 phases indépendantes et déployables séparément. À chaque phase, le système reste 100 % fonctionnel.

```
Phase 1 → DB : ajouter la table + la FK nullable (non-breaking)
Phase 2 → BE : module Application + logique duale (avec/sans application_id)
Phase 3 → Admin UI : interface de gestion + formulaire canal mis à jour
Phase 4 → Data : script de backfill des canaux existants (one-shot, manuel)
```

La suppression des colonnes dépréciées (`meta_app_id`, `meta_app_secret`) est une **Phase 5 optionnelle**, à décider après que 100 % des canaux soient migrés.

---

## 5. Détail des phases

---

### PHASE 1 — Migration BDD (non-breaking)

**Durée estimée :** 30 min  
**Risque :** Nul — uniquement CREATE TABLE + ADD COLUMN nullable

#### 1.1 Créer la migration TypeORM

**Nom de classe :** `AddMessagingApplication1748390400001`  
**Fichier :** `message_whatsapp/src/migrations/1748390400001-add-messaging-application.ts`

```typescript
// UP
await queryRunner.query(`
  CREATE TABLE messaging_applications (
    id          char(36)     NOT NULL,
    label       varchar(100) NOT NULL,
    provider    varchar(32)  NOT NULL DEFAULT 'meta',
    app_id      varchar(64)  NOT NULL,
    app_secret  varchar(128) NOT NULL,
    system_token text         NULL,
    created_at  timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
`);

await queryRunner.query(`
  ALTER TABLE whapi_channels
    ADD COLUMN application_id char(36) NULL DEFAULT NULL,
    ADD CONSTRAINT FK_whapi_channels_application_id
      FOREIGN KEY (application_id)
      REFERENCES messaging_applications (id)
      ON DELETE SET NULL
`);
```

```typescript
// DOWN
await queryRunner.query(`
  ALTER TABLE whapi_channels
    DROP FOREIGN KEY FK_whapi_channels_application_id,
    DROP COLUMN application_id
`);
await queryRunner.query(`DROP TABLE IF EXISTS messaging_applications`);
```

**Déploiement :** `npm run migration:run` — aucun downtime nécessaire.

---

### PHASE 2 — Module Backend `application`

**Durée estimée :** 3-4 h  
**Risque :** Nul — nouveau code + fallback rétrocompat

#### 2.1 Entité `MessagingApplication`

**Fichier :** `message_whatsapp/src/application/entities/messaging-application.entity.ts`

```typescript
@Entity({ name: 'messaging_applications' })
export class MessagingApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'varchar', length: 32, default: 'meta' })
  provider: string;  // 'meta' | 'whapi' | 'telegram'

  @Column({ name: 'app_id', type: 'varchar', length: 64 })
  appId: string;

  @Column({ name: 'app_secret', type: 'varchar', length: 128 })
  appSecret: string;

  @Column({ name: 'system_token', type: 'text', nullable: true })
  systemToken?: string | null;

  @OneToMany(() => WhapiChannel, (c) => c.application)
  channels: WhapiChannel[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

#### 2.2 Modification de `WhapiChannel`

**Fichier :** `message_whatsapp/src/channel/entities/channel.entity.ts`

Ajouter :

```typescript
@Column({ name: 'application_id', type: 'char', length: 36, nullable: true })
application_id?: string | null;

@ManyToOne(() => MessagingApplication, (app) => app.channels, {
  nullable: true,
  onDelete: 'SET NULL',
})
@JoinColumn({ name: 'application_id' })
application?: MessagingApplication | null;
```

Ne pas supprimer `meta_app_id` / `meta_app_secret` à cette étape.

#### 2.3 DTOs Application

**Fichier :** `message_whatsapp/src/application/dto/create-application.dto.ts`

```typescript
export class CreateApplicationDto {
  @IsString() @MaxLength(100)
  label: string;

  @IsOptional() @IsIn(['meta', 'whapi', 'telegram'])
  provider?: string;  // défaut: 'meta'

  @IsString() @MaxLength(64)
  appId: string;

  @IsString() @MaxLength(128)
  appSecret: string;

  @IsOptional() @IsString()
  systemToken?: string;  // System User token (permanent)
}
```

**Fichier :** `message_whatsapp/src/application/dto/update-application.dto.ts`

```typescript
export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}
```

#### 2.4 Mise à jour de `CreateChannelDto`

**Fichier :** `message_whatsapp/src/channel/dto/create-channel.dto.ts`

Ajouter :

```typescript
@IsOptional() @IsUUID()
application_id?: string;  // Si fourni, remplace meta_app_id/meta_app_secret
```

`meta_app_id` et `meta_app_secret` restent optionnels (rétrocompatibilité).

#### 2.5 Helper `resolveChannelCredentials()`

**Fichier :** `message_whatsapp/src/channel/helpers/resolve-channel-credentials.helper.ts`

```typescript
export interface ChannelCredentials {
  appId: string | null;
  appSecret: string | null;
  accessToken: string;
  isSystemToken: boolean;
}

export function resolveChannelCredentials(
  channel: WhapiChannel & { application?: MessagingApplication | null },
): ChannelCredentials {
  if (channel.application) {
    return {
      appId: channel.application.appId,
      appSecret: channel.application.appSecret,
      accessToken: channel.application.systemToken ?? channel.token,
      isSystemToken: !!channel.application.systemToken,
    };
  }
  // Fallback rétrocompatibilité
  return {
    appId: channel.meta_app_id ?? null,
    appSecret: channel.meta_app_secret ?? null,
    accessToken: channel.token,
    isSystemToken: false,
  };
}
```

#### 2.6 Service `ApplicationService`

**Fichier :** `message_whatsapp/src/application/application.service.ts`

Méthodes :
- `create(dto: CreateApplicationDto): Promise<MessagingApplication>`
- `findAll(): Promise<MessagingApplication[]>`
- `findOne(id: string): Promise<MessagingApplication>`
- `update(id: string, dto: UpdateApplicationDto): Promise<MessagingApplication>`
- `remove(id: string): Promise<void>` — vérifie qu'aucun canal actif n'est lié avant suppression

#### 2.7 Controller `ApplicationController`

**Fichier :** `message_whatsapp/src/application/application.controller.ts`

```
POST   /applications          → create()         [AdminGuard]
GET    /applications          → findAll()         [AdminGuard]
GET    /applications/:id      → findOne()         [AdminGuard]
PATCH  /applications/:id      → update()          [AdminGuard]
DELETE /applications/:id      → remove()          [AdminGuard]
GET    /applications/:id/channels → listChannels() [AdminGuard]
```

#### 2.8 Mise à jour de `MetaChannelProviderService`

Lors du `create(dto)` :
- Si `dto.application_id` fourni → charger l'application, utiliser ses credentials pour l'échange de token
- Sinon → comportement actuel (utilise `dto.meta_app_id` / `dto.meta_app_secret`)
- Sauvegarder `application_id` sur le canal créé

#### 2.9 Mise à jour de `MetaTokenService`

Toutes les méthodes qui lisent `channel.meta_app_id` / `channel.meta_app_secret` / `channel.token` doivent passer par `resolveChannelCredentials()`. La relation `application` doit être chargée (eager ou explicit LEFT JOIN).

Méthodes impactées :
- `exchangeForLongLivedToken()` — lecture `appId` + `appSecret`
- `refreshChannelToken()` — lecture credentials complets
- `resubscribeWhatsappWebhook()` — lecture `appId` + `appSecret`
- `resubscribePageWebhook()` — lecture `token`

#### 2.10 Module `ApplicationModule`

**Fichier :** `message_whatsapp/src/application/application.module.ts`

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([MessagingApplication, WhapiChannel])],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
```

Importer `ApplicationModule` dans `ChannelModule`.

---

### PHASE 3 — Interface Admin

**Durée estimée :** 3-4 h  
**Risque :** Nul — nouvelle page + formulaire existant enrichi

#### 3.1 Page de gestion des Applications

**Fichier :** `admin/src/app/(dashboard)/applications/page.tsx`

Tableau listant les applications avec colonnes :
- Label, Provider, App ID (masqué partiellement), Nombre de canaux liés, Actions

**Fichier :** `admin/src/app/(dashboard)/applications/new/page.tsx`

Formulaire de création avec :
- Label (texte libre)
- Provider (select : Meta WhatsApp / Messenger / Instagram / Telegram / Whapi)
- App ID
- App Secret (champ password)
- System User Token (optionnel, champ password avec tooltip explicatif)

#### 3.2 Mise à jour du formulaire de création de Canal

**Fichier :** `admin/src/app/(dashboard)/channels/new/page.tsx` (ou équivalent)

Ajouter un champ **Application** :
- Select (liste des applications filtrées par provider)
- Si sélectionné, masquer les champs `meta_app_id` / `meta_app_secret` (car hérités de l'application)
- Si non sélectionné, afficher les champs existants (rétrocompatibilité)

#### 3.3 Types TypeScript Admin

**Fichier :** `admin/src/app/lib/definitions.ts`

Ajouter :

```typescript
export interface MessagingApplication {
  id: string;
  label: string;
  provider: string;
  appId: string;
  // appSecret non exposé côté admin (sécurité)
  systemToken?: string | null;
  channelCount?: number;
  createdAt: string;
  updatedAt: string;
}
```

#### 3.4 Appels API Admin

**Fichier :** `admin/src/app/lib/api.ts`

Ajouter :

```typescript
export async function getApplications(): Promise<MessagingApplication[]>
export async function createApplication(data: CreateApplicationData): Promise<MessagingApplication>
export async function updateApplication(id: string, data: Partial<CreateApplicationData>): Promise<MessagingApplication>
export async function deleteApplication(id: string): Promise<void>
```

---

### PHASE 4 — Backfill des données existantes (one-shot, manuel)

**Durée estimée :** 15 min  
**Risque :** Faible — opération idempotente sur données existantes

Cette phase est exécutée manuellement par l'équipe technique après déploiement des phases 1-2-3.

#### 4.1 Script de backfill

**Fichier :** `message_whatsapp/scripts/backfill-applications.ts`

Logique :
1. Lire tous les canaux où `meta_app_id IS NOT NULL` et `application_id IS NULL`
2. Grouper par `(meta_app_id, meta_app_secret)` — chaque groupe unique = une application
3. Pour chaque groupe :
   - Créer une `MessagingApplication` avec `label = "Application {meta_app_id}"` (à renommer ensuite), `appId = meta_app_id`, `appSecret = meta_app_secret`
   - Mettre à jour tous les canaux du groupe : `application_id = application.id`
4. Afficher un rapport de migration

```
Résultat attendu exemple :
  3 applications créées
  12 canaux migrés (application_id renseigné)
  5 canaux whapi inchangés (meta_app_id NULL)
```

#### 4.2 Post-backfill

Après exécution du script, aller dans l'interface admin pour renommer les applications avec des labels significatifs (ex : "Application Meta Production", "Application Messenger Page GICOP", etc.).

---

### PHASE 5 (optionnelle, future) — Nettoyage colonnes dépréciées

**Condition de déclenchement :** 100 % des canaux Meta/Messenger/Instagram ont un `application_id` non-null  
**Durée estimée :** 1 h  
**Risque :** Faible si condition vérifiée

1. Supprimer `meta_app_id` et `meta_app_secret` de l'entité `WhapiChannel`
2. Supprimer ces colonnes via migration TypeORM
3. Supprimer les champs de `CreateChannelDto` / `UpdateChannelDto`
4. Supprimer le fallback dans `resolveChannelCredentials()`

---

## 6. Fichiers à créer / modifier

### Nouveaux fichiers

```
message_whatsapp/src/application/
├── application.module.ts
├── application.controller.ts
├── application.service.ts
├── entities/
│   └── messaging-application.entity.ts
└── dto/
    ├── create-application.dto.ts
    └── update-application.dto.ts

message_whatsapp/src/channel/helpers/
└── resolve-channel-credentials.helper.ts

message_whatsapp/src/migrations/
└── 1748390400001-add-messaging-application.ts

message_whatsapp/scripts/
└── backfill-applications.ts

admin/src/app/(dashboard)/applications/
├── page.tsx
└── new/
    └── page.tsx
```

### Fichiers modifiés

```
Backend
├── message_whatsapp/src/channel/entities/channel.entity.ts
│   └── + application_id column + @ManyToOne application relation
│
├── message_whatsapp/src/channel/dto/create-channel.dto.ts
│   └── + application_id champ optionnel
│
├── message_whatsapp/src/channel/channel.module.ts
│   └── + import ApplicationModule + TypeOrmModule MessagingApplication
│
├── message_whatsapp/src/channel/providers/meta-channel-provider.service.ts
│   └── utilise application si application_id fourni
│
├── message_whatsapp/src/channel/meta-token.service.ts
│   └── toutes les méthodes passent par resolveChannelCredentials()
│
└── message_whatsapp/src/channel/providers/messenger-channel-provider.service.ts
    message_whatsapp/src/channel/providers/instagram-channel-provider.service.ts
    └── même mise à jour que MetaChannelProviderService

Admin
├── admin/src/app/lib/definitions.ts
│   └── + MessagingApplication type
│
├── admin/src/app/lib/api.ts
│   └── + CRUD applications
│
└── admin/src/app/(dashboard)/channels/new/page.tsx (ou équivalent)
    └── + select Application dans formulaire
```

---

## 7. Points d'attention et risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Canaux sans application_id après Phase 3 | Faible | Nul | Fallback rétrocompat maintenu indéfiniment jusqu'à Phase 5 |
| Token refresh casse si application non chargée (eager load manquant) | Moyen | Élevé | Toujours charger la relation `application` dans MetaTokenService via LEFT JOIN |
| Suppression d'une application avec canaux actifs | Moyen | Élevé | `ApplicationService.remove()` vérifie `channels.length === 0` avant suppression |
| app_secret exposé dans les logs | Moyen | Élevé | Intercepteur NestJS existant masque les champs sensibles — vérifier que `appSecret` et `system_token` y sont inclus |
| FK `ON DELETE SET NULL` — canal sans credentials si app supprimée | Faible | Élevé | Double protection : (1) interdire suppression app avec canaux, (2) SET NULL déclenche une alerte système |

---

## 8. Ordre de déploiement recommandé

```
1. [PR #1] Phase 1 — Migration BDD uniquement
   → Merge + deploy → vérifier que prod démarre sans erreur
   
2. [PR #2] Phase 2 — Module Application + modifications Channel backend
   → Tests unitaires + intégration sur resolveChannelCredentials()
   → Deploy → vérifier que les canaux existants continuent de fonctionner
   
3. [PR #3] Phase 3 — Admin UI Applications + formulaire canal
   → QA sur l'interface avant deploy
   
4. [Script] Phase 4 — Backfill données (manuel, une seule fois)
   → Exécuter en heures creuses
   → Vérifier le rapport, renommer les applications
```

---

## 9. Tests à écrire

### Backend (Jest)

- `ApplicationService` — CRUD complet + protection suppression avec canaux liés
- `resolveChannelCredentials()` — cas avec application, sans application, system_token vs token canal
- `MetaChannelProviderService.create()` — avec `application_id` ET sans `application_id`
- `MetaTokenService.refreshChannelToken()` — vérifie que credentials viennent de l'application quand présente
- Migration UP/DOWN — idempotence

### Admin (Manuel)

- Créer une application → vérifier apparition dans la liste
- Créer un canal en sélectionnant une application → vérifier `application_id` en base
- Créer un canal sans application → vérifier comportement inchangé (fallback)
- Tenter de supprimer une application avec des canaux liés → vérifier l'erreur

---

## 10. Non-scope (explicitement exclu)

- Partage d'une application entre plusieurs tenants — non prévu, une application appartient au tenant courant
- Rotation automatique des System User tokens — les System User tokens n'expirent pas (Facebook les génère à durée indéfinie)
- Support d'une application Telegram via cette entité — Telegram n'utilise pas App ID/Secret, son `webhook_secret` reste sur le canal
- Suppression des colonnes `meta_app_id` / `meta_app_secret` dans ce sprint (Phase 5 future)

---

*Fin du plan — toute modification de scope doit être validée avant démarrage de l'implémentation.*
