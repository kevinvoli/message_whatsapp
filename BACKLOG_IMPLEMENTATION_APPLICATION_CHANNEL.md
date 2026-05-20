# Backlog d'implémentation — Entité Application / Gestion des canaux

**Basé sur :** `PLAN_EVOLUTION_ARCHITECTURE_APPLICATION_CHANNEL.md`  
**Date :** 2026-05-20  
**Principe directeur :** chaque US est déployable seule sans régresser la production

---

## Légende

- `[BE]` Backend NestJS
- `[FE]` Frontend admin
- `[DB]` Base de données / migration
- `[TEST]` Couverture de test
- `[OPS]` Opération manuelle (script, vérification prod)
- ✅ Done | 🔲 À faire | 🚧 En cours

---

## EPIC 1 — Migration base de données (Phase 1)

> **Objectif :** Ajouter la table et la FK sans aucun impact sur le code existant.  
> **Condition de merge :** prod démarre sans erreur, aucune colonne existante modifiée.

---

### US-1.1 — Créer la migration TypeORM `AddMessagingApplication`

**Statut :** ✅  
**Effort :** S (30 min)  
**PR :** #1 — seule dans ce PR

#### Tâches

- `[DB]` Créer le fichier `message_whatsapp/src/migrations/1748390400001-add-messaging-application.ts`
- `[DB]` Méthode `up` :
  - `CREATE TABLE messaging_applications` avec colonnes `id`, `label`, `provider`, `app_id`, `app_secret`, `system_token`, `created_at`, `updated_at`
  - `ALTER TABLE whapi_channels ADD COLUMN application_id char(36) NULL DEFAULT NULL`
  - `ADD CONSTRAINT FK_whapi_channels_application_id FOREIGN KEY ... ON DELETE SET NULL`
- `[DB]` Méthode `down` :
  - `DROP FOREIGN KEY FK_whapi_channels_application_id`
  - `DROP COLUMN application_id`
  - `DROP TABLE messaging_applications`

#### Critères d'acceptation

- [ ] `npm run migration:run` s'exécute sans erreur
- [ ] `npm run migration:revert` restaure l'état initial sans erreur
- [ ] Aucune colonne existante de `whapi_channels` n'est modifiée
- [ ] La table `messaging_applications` est bien créée avec les bons types MySQL
- [ ] La FK a bien `ON DELETE SET NULL`

#### Tests de non-régression

- [ ] Tous les tests existants passent après la migration (`npm run test`)
- [ ] L'application démarre et répond sur `/health` après migration
- [ ] `GET /channel` retourne les mêmes canaux qu'avant

---

## EPIC 2 — Module Application backend (Phase 2)

> **Objectif :** CRUD Application + logique duale avec fallback rétrocompat.  
> **Condition de merge :** les canaux existants sans `application_id` continuent de fonctionner exactement comme avant.

---

### US-2.1 — Entité TypeORM `MessagingApplication`

**Statut :** 🔲  
**Effort :** S (30 min)  
**Dépend de :** US-1.1

#### Tâches

- `[BE]` Créer `message_whatsapp/src/application/entities/messaging-application.entity.ts`
  - Décorateurs `@Entity('messaging_applications')`
  - Colonnes : `id` (UUID PK), `label`, `provider` (défaut `'meta'`), `appId` (name: `app_id`), `appSecret` (name: `app_secret`), `systemToken` (name: `system_token`, nullable)
  - `@CreateDateColumn` / `@UpdateDateColumn`
  - `@OneToMany(() => WhapiChannel, c => c.application)` → channels

- `[BE]` Modifier `message_whatsapp/src/channel/entities/channel.entity.ts` :
  - Ajouter `@Column application_id char(36) nullable`
  - Ajouter `@ManyToOne(() => MessagingApplication) @JoinColumn application?: MessagingApplication | null`
  - **Ne pas supprimer** `meta_app_id`, `meta_app_secret`

#### Critères d'acceptation

- [ ] `npm run build` passe sans erreur TypeScript
- [ ] TypeORM ne génère pas de migration automatique inattendue
- [ ] `channel.application` est optionnel (nullable) — pas d'erreur si non chargé
- [ ] La relation inverse `application.channels` est correctement typée

#### Tests de non-régression

- [ ] `GET /channel` : réponse identique à avant (application peut être null/undefined)
- [ ] Aucun test existant ne casse

---

### US-2.2 — Helper `resolveChannelCredentials()`

**Statut :** 🔲  
**Effort :** S (45 min)  
**Dépend de :** US-2.1

#### Tâches

- `[BE]` Créer `message_whatsapp/src/channel/helpers/resolve-channel-credentials.helper.ts`
  - Interface `ChannelCredentials { appId, appSecret, accessToken, isSystemToken }`
  - Fonction pure `resolveChannelCredentials(channel)` :
    - Si `channel.application` présent → utilise `application.appId`, `application.appSecret`, `application.systemToken ?? channel.token`
    - Sinon → utilise `channel.meta_app_id`, `channel.meta_app_secret`, `channel.token`

- `[TEST]` Créer `message_whatsapp/src/channel/helpers/resolve-channel-credentials.helper.spec.ts`

#### Tests unitaires à écrire

```
resolveChannelCredentials()
  ✓ canal sans application → retourne meta_app_id/meta_app_secret du canal
  ✓ canal sans application, meta_app_id null → retourne null pour appId/appSecret
  ✓ canal avec application sans system_token → retourne credentials application + token canal
  ✓ canal avec application avec system_token → retourne credentials application + system_token
  ✓ canal avec application, system_token vide string → traite comme null (retourne token canal)
  ✓ canal avec application_id mais relation non chargée → fallback canal (pas d'erreur)
```

#### Critères d'acceptation

- [ ] 6/6 tests unitaires passent
- [ ] La fonction est pure (pas d'injection, pas d'effet de bord)
- [ ] TypeScript strict — pas de `any`

---

### US-2.3 — DTOs Application

**Statut :** 🔲  
**Effort :** S (30 min)  
**Dépend de :** US-2.1

#### Tâches

- `[BE]` Créer `message_whatsapp/src/application/dto/create-application.dto.ts`
  - `label` : `@IsString @MaxLength(100) @IsNotEmpty`
  - `provider` : `@IsOptional @IsIn(['meta', 'messenger', 'instagram', 'telegram', 'whapi'])` défaut `'meta'`
  - `appId` : `@IsString @MaxLength(64) @IsNotEmpty`
  - `appSecret` : `@IsString @MaxLength(128) @IsNotEmpty`
  - `systemToken` : `@IsOptional @IsString` — pas de longueur max (text)

- `[BE]` Créer `message_whatsapp/src/application/dto/update-application.dto.ts`
  - `PartialType(CreateApplicationDto)`

- `[BE]` Modifier `message_whatsapp/src/channel/dto/create-channel.dto.ts`
  - Ajouter `application_id?: string` → `@IsOptional @IsUUID`
  - `meta_app_id` et `meta_app_secret` restent optionnels (ne pas toucher leur validation)

#### Critères d'acceptation

- [ ] Validation `class-validator` fonctionne sur tous les champs
- [ ] `POST /applications` avec body incomplet retourne 400 avec message clair
- [ ] `POST /channel` avec `application_id` invalide (pas UUID) retourne 400
- [ ] `POST /channel` sans `application_id` fonctionne exactement comme avant

---

### US-2.4 — Service et Controller `Application`

**Statut :** 🔲  
**Effort :** M (2 h)  
**Dépend de :** US-2.3

#### Tâches

- `[BE]` Créer `message_whatsapp/src/application/application.service.ts`
  - `create(dto)` — génère UUID, persiste
  - `findAll()` — retourne toutes les applications avec `channelCount` (COUNT LEFT JOIN)
  - `findOne(id)` — lève `NotFoundException` si absent
  - `update(id, dto)` — merge partiel, sauvegarde
  - `remove(id)` — vérifie `channels.length === 0`, sinon lève `ConflictException('APPLICATION_HAS_ACTIVE_CHANNELS')`

- `[BE]` Créer `message_whatsapp/src/application/application.controller.ts`
  - Tous les endpoints sous `@UseGuards(AdminGuard)`
  - `POST /applications`
  - `GET /applications`
  - `GET /applications/:id`
  - `PATCH /applications/:id`
  - `DELETE /applications/:id`
  - `GET /applications/:id/channels` (retourne canaux liés)

- `[BE]` Créer `message_whatsapp/src/application/application.module.ts`
  - `TypeOrmModule.forFeature([MessagingApplication, WhapiChannel])`
  - Exporter `ApplicationService`

- `[BE]` Importer `ApplicationModule` dans `ChannelModule`

- `[TEST]` Créer `application.service.spec.ts`

#### Tests unitaires à écrire (ApplicationService)

```
create()
  ✓ crée et retourne une application avec les bons champs
  ✓ label vide → erreur levée en amont par DTO (pas tester ici)

findOne()
  ✓ retourne l'application si elle existe
  ✓ lève NotFoundException si id inconnu

update()
  ✓ met à jour uniquement les champs fournis
  ✓ lève NotFoundException si id inconnu

remove()
  ✓ supprime si aucun canal lié
  ✓ lève ConflictException si des canaux sont liés
  ✓ lève NotFoundException si id inconnu
```

#### Critères d'acceptation

- [ ] `POST /applications` crée une application et retourne 201
- [ ] `GET /applications` retourne la liste avec `channelCount`
- [ ] `DELETE /applications/:id` avec canaux liés retourne 409
- [ ] `DELETE /applications/:id` sans canaux liés retourne 200
- [ ] Tous les endpoints retournent 401 sans AdminGuard
- [ ] 8/8 tests unitaires passent

---

### US-2.5 — Intégration Application dans `MetaChannelProviderService`

**Statut :** 🔲  
**Effort :** M (2 h)  
**Dépend de :** US-2.2, US-2.4

#### Tâches

- `[BE]` Modifier `meta-channel-provider.service.ts` — méthode `create(dto)` :
  - Si `dto.application_id` fourni :
    - Charger l'application via `ApplicationService.findOne(dto.application_id)`
    - Utiliser `application.appId` / `application.appSecret` pour l'échange de token
    - Si `application.systemToken` présent → `permanent_token = true`, pas d'échange
    - Sauvegarder `application_id` sur le canal créé
  - Sinon → comportement inchangé (utilise `dto.meta_app_id` / `dto.meta_app_secret`)

- `[BE]` Même logique dans `messenger-channel-provider.service.ts` et `instagram-channel-provider.service.ts`

- `[BE]` Modifier `meta-channel-provider.service.ts` — méthode `update(channel, dto)` :
  - Si `dto.application_id` fourni → mettre à jour la relation
  - Résoudre credentials via `resolveChannelCredentials()` avant échange de token

- `[TEST]` Mettre à jour les tests existants de `MetaChannelProviderService`

#### Tests à ajouter / modifier

```
MetaChannelProviderService.create()
  ✓ [EXISTANT] sans application_id → comportement inchangé (test existant doit passer)
  ✓ [NOUVEAU] avec application_id valide → utilise credentials de l'application
  ✓ [NOUVEAU] avec application_id + system_token → pas d'échange de token, tokenExpiresAt = 2099
  ✓ [NOUVEAU] avec application_id inexistant → lève NotFoundException

MetaChannelProviderService.update()
  ✓ [EXISTANT] mise à jour token sans application → comportement inchangé
  ✓ [NOUVEAU] mise à jour avec application → credentials résolus depuis application
```

#### Critères d'acceptation

- [ ] Créer un canal Meta avec `application_id` fonctionne de bout en bout
- [ ] Créer un canal Meta sans `application_id` fonctionne exactement comme avant (régression 0)
- [ ] Les canaux existants en prod ne sont pas affectés (aucune requête de modification)

---

### US-2.6 — Intégration Application dans `MetaTokenService`

**Statut :** 🔲  
**Effort :** M (2 h)  
**Dépend de :** US-2.2, US-2.5

#### Tâches

- `[BE]` Modifier `meta-token.service.ts` — partout où `channel.meta_app_id`, `channel.meta_app_secret`, `channel.token` sont lus directement :
  - Charger la relation `application` si pas déjà chargée (via `findOne` avec relations)
  - Appeler `resolveChannelCredentials(channel)` pour obtenir les credentials
  - Utiliser le résultat au lieu des champs directs

- Méthodes impactées :
  - `exchangeForLongLivedToken()` — lire `appId` + `appSecret` via helper
  - `refreshChannelToken(channelId)` — charger canal avec `{ relations: ['application'] }`
  - `resubscribeWhatsappWebhook()` — lire `appId` + `appSecret` via helper
  - `resubscribePageWebhook()` — lire token via helper
  - `getExpiringChannels()` — pas de changement (pas de lecture credentials)

- `[TEST]` Mettre à jour / ajouter tests dans `meta-token.service.spec.ts`

#### Tests à ajouter / modifier

```
refreshChannelToken()
  ✓ [EXISTANT] canal sans application → utilise meta_app_id/meta_app_secret du canal
  ✓ [NOUVEAU] canal avec application → utilise credentials de l'application
  ✓ [NOUVEAU] canal avec application + system_token → pas de refresh (system token permanent)

resubscribeWhatsappWebhook()
  ✓ [EXISTANT] utilise channel.meta_app_id → comportement inchangé si pas d'application
  ✓ [NOUVEAU] utilise application.appId si application présente
```

#### Critères d'acceptation

- [ ] `POST /channel/:id/refresh-token` sur un canal avec application utilise les bons credentials
- [ ] `POST /channel/:id/refresh-token` sur un canal sans application fonctionne comme avant
- [ ] Le scheduler de refresh (`MetaTokenSchedulerService`) continue de fonctionner
- [ ] Aucun canal existant ne casse lors du refresh automatique

---

## EPIC 3 — Interface Admin (Phase 3)

> **Objectif :** Interface de gestion des applications et mise à jour du formulaire canal.  
> **Condition de merge :** le formulaire de création de canal existant fonctionne toujours sans sélectionner d'application.

---

### US-3.1 — Types et appels API côté admin

**Statut :** 🔲  
**Effort :** S (45 min)  
**Dépend de :** US-2.4

#### Tâches

- `[FE]` Ajouter dans `admin/src/app/lib/definitions.ts` :
  - Interface `MessagingApplication { id, label, provider, appId, channelCount?, createdAt, updatedAt }`
  - Interface `CreateApplicationPayload { label, provider?, appId, appSecret, systemToken? }`

- `[FE]` Ajouter dans `admin/src/app/lib/api.ts` :
  - `getApplications(): Promise<MessagingApplication[]>`
  - `getApplication(id: string): Promise<MessagingApplication>`
  - `createApplication(data: CreateApplicationPayload): Promise<MessagingApplication>`
  - `updateApplication(id: string, data: Partial<CreateApplicationPayload>): Promise<MessagingApplication>`
  - `deleteApplication(id: string): Promise<void>`

#### Critères d'acceptation

- [ ] `npm run build` côté admin passe sans erreur TypeScript
- [ ] Les fonctions API respectent le pattern existant (fetch + error handling)
- [ ] `appSecret` et `systemToken` ne sont **pas** présents dans l'interface `MessagingApplication` retournée (sécurité — le backend ne les expose pas en GET)

---

### US-3.2 — Page liste des Applications

**Statut :** 🔲  
**Effort :** M (2 h)  
**Dépend de :** US-3.1

#### Tâches

- `[FE]` Créer `admin/src/app/(dashboard)/applications/page.tsx`
  - Tableau avec colonnes : Label, Provider, App ID (partiel : `app12...3456`), Nb canaux, Date création, Actions
  - Bouton "Nouvelle application"
  - Bouton "Supprimer" — confirmation modale, désactivé si `channelCount > 0` avec tooltip

- `[FE]` Créer `admin/src/app/(dashboard)/applications/[id]/page.tsx`
  - Fiche détail avec liste des canaux liés

#### Critères d'acceptation

- [ ] La page se charge sans erreur si aucune application n'existe (état vide)
- [ ] Le bouton Supprimer est désactivé si des canaux sont liés
- [ ] L'App ID est masqué partiellement (éviter exposition complète)
- [ ] Navigation retour vers la liste fonctionne

---

### US-3.3 — Formulaire création / édition Application

**Statut :** 🔲  
**Effort :** M (2 h)  
**Dépend de :** US-3.1

#### Tâches

- `[FE]` Créer `admin/src/app/(dashboard)/applications/new/page.tsx`
  - Champs : Label, Provider (select), App ID, App Secret (password), System User Token (password, optionnel)
  - Tooltip sur "System User Token" : "Token permanent de type System User Meta. Laissez vide si vous utilisez des tokens d'accès par canal."
  - Validation côté client avant envoi

- `[FE]` Créer `admin/src/app/(dashboard)/applications/[id]/edit/page.tsx`
  - Mêmes champs, App Secret et System Token affichent `••••••` (non reremplis depuis le serveur)
  - Champ vide = inchangé lors de la mise à jour

#### Critères d'acceptation

- [ ] Formulaire invalide (label vide, app_id vide) → erreur affichée, pas d'envoi
- [ ] Création réussie → redirection vers la liste avec message de succès
- [ ] Édition réussie → App Secret non modifié si laissé vide
- [ ] `system_token` non visible en clair après sauvegarde

---

### US-3.4 — Mise à jour formulaire création de Canal

**Statut :** 🔲  
**Effort :** M (2 h)  
**Dépend de :** US-3.1, US-3.3

#### Tâches

- `[FE]` Localiser le formulaire de création de canal dans l'admin
- `[FE]` Ajouter un champ **Application** :
  - Select chargé depuis `GET /applications`
  - Filtré par le provider sélectionné (si provider = 'meta', affiche uniquement applications meta)
  - Option "— Aucune application —" (valeur null, comportement actuel maintenu)
- `[FE]` Logique conditionnelle :
  - Si une application est sélectionnée → masquer les champs `meta_app_id` et `meta_app_secret` (car hérités)
  - Si aucune application → afficher les champs existants (comportement inchangé)

#### Critères d'acceptation

- [ ] Créer un canal sans sélectionner d'application → comportement rigoureusement identique à l'existant
- [ ] Créer un canal avec une application → `application_id` envoyé dans le payload, canal créé et lié
- [ ] Le sélecteur d'application est vide si aucune application n'existe (pas d'erreur)
- [ ] Filtrage par provider fonctionne (application Meta n'apparaît pas pour un canal Telegram)

---

## EPIC 4 — Backfill des données existantes (Phase 4)

> **Objectif :** Migrer les canaux existants vers des entités Application, sans perte de données.  
> **Condition d'exécution :** phases 1-2-3 déployées et stables en prod depuis ≥ 24 h.

---

### US-4.1 — Script de backfill

**Statut :** 🔲  
**Effort :** M (2 h)  
**Dépend de :** US-2.4

#### Tâches

- `[BE]` Créer `message_whatsapp/scripts/backfill-applications.ts`
  - Lire tous les canaux où `meta_app_id IS NOT NULL AND application_id IS NULL`
  - Grouper par couple `(meta_app_id, meta_app_secret)` — chaque groupe unique = une application
  - Pour chaque groupe :
    - Créer `MessagingApplication` avec `label = 'Application [meta_app_id partiel]'`, `provider = 'meta'`
    - `UPDATE whapi_channels SET application_id = ? WHERE meta_app_id = ? AND meta_app_secret = ?`
  - Afficher rapport final :
    ```
    Applications créées : N
    Canaux migrés       : N
    Canaux ignorés      : N (whapi, telegram, ou déjà migrés)
    Erreurs             : N
    ```
  - Le script est **idempotent** (ré-exécutable sans doublon)

- `[BE]` Ajouter commande npm : `"migration:backfill-applications": "ts-node scripts/backfill-applications.ts"`

- `[OPS]` Créer `docs/RUNBOOK_BACKFILL_APPLICATIONS.md` avec :
  - Pré-conditions à vérifier avant exécution
  - Commande d'exécution
  - Comment vérifier le résultat en SQL
  - Rollback : `UPDATE whapi_channels SET application_id = NULL` (sans supprimer les applications)

#### Critères d'acceptation

- [ ] Script exécutable sur la base de staging sans erreur
- [ ] Ré-exécution du script → 0 application créée en double, 0 canal re-migré (idempotent)
- [ ] Rapport affiché en fin d'exécution
- [ ] Canaux whapi et telegram non touchés

---

### US-4.2 — Vérification post-backfill

**Statut :** 🔲  
**Effort :** S (30 min)  
**Dépend de :** US-4.1 exécuté en prod

#### Tâches

- `[OPS]` Requête SQL de vérification :
  ```sql
  -- Canaux meta/messenger/instagram encore sans application (doit être 0)
  SELECT COUNT(*) FROM whapi_channels
  WHERE provider IN ('meta','messenger','instagram')
    AND application_id IS NULL
    AND meta_app_id IS NOT NULL;

  -- Applications créées avec leur nombre de canaux
  SELECT a.label, a.provider, COUNT(c.id) AS nb_canaux
  FROM messaging_applications a
  LEFT JOIN whapi_channels c ON c.application_id = a.id
  GROUP BY a.id;
  ```
- `[OPS]` Renommer les applications avec des labels métier significatifs via l'interface admin
- `[OPS]` Vérifier sur un canal migré que `POST /channel/:id/refresh-token` fonctionne toujours

#### Critères d'acceptation

- [ ] 0 canal meta/messenger/instagram sans `application_id` après backfill
- [ ] Toutes les applications ont un label métier significatif
- [ ] Refresh token fonctionne sur un canal migré

---

## EPIC 5 — Sécurité et robustesse transversale

> **Objectif :** S'assurer qu'aucune fuite de credential n'est introduite par la nouvelle entité.  
> **À faire en parallèle des epics 2-3, pas un bloc séparé.**

---

### US-5.1 — Masquage des champs sensibles dans les réponses API

**Statut :** 🔲  
**Effort :** S (1 h)  
**Dépend de :** US-2.4

#### Tâches

- `[BE]` Dans `ApplicationController.findAll()` et `findOne()` :
  - Exclure `appSecret` et `systemToken` de la réponse (utiliser un DTO de réponse ou `Exclude()` de class-transformer)
- `[BE]` Dans `ChannelController` (si `application` est inclus dans la réponse d'un canal) :
  - Exclure `appSecret` et `systemToken` de la relation imbriquée
- `[BE]` Vérifier que les logs NestJS (intercepteurs existants) masquent `app_secret` et `system_token`

#### Critères d'acceptation

- [ ] `GET /applications` ne retourne pas `appSecret` ni `systemToken`
- [ ] `GET /applications/:id` ne retourne pas `appSecret` ni `systemToken`
- [ ] `GET /channel` avec relation `application` chargée ne retourne pas `appSecret`
- [ ] Les logs d'accès ne contiennent pas de valeur de `app_secret`

---

### US-5.2 — Protection contre la suppression en cascade involontaire

**Statut :** 🔲  
**Effort :** S (30 min)  
**Dépend de :** US-2.4

#### Tâches

- `[BE]` Dans `ApplicationService.remove()` :
  - Vérifier `COUNT(channels WHERE application_id = id) > 0`
  - Si oui : lève `ConflictException` avec message `'Impossible de supprimer : N canal(aux) utilisent cette application.'`
- `[BE]` La FK `ON DELETE SET NULL` en base reste comme filet de sécurité de dernier recours, mais ne doit jamais être atteinte en pratique grâce à la protection applicative

#### Critères d'acceptation

- [ ] `DELETE /applications/:id` avec 1 canal lié → 409 Conflict avec message explicite
- [ ] `DELETE /applications/:id` avec 0 canal lié → 200 OK
- [ ] La FK `ON DELETE SET NULL` est testée dans un test d'intégration (suppression directe SQL)

---

## Ordre de réalisation recommandé

```
PR #1  → US-1.1  (migration DB seule)
         ↓ deploy + vérifier prod
PR #2  → US-2.1 + US-2.2 + US-2.3  (entité + helper + DTOs — aucun changement comportemental)
         ↓ tests + review
PR #3  → US-2.4 + US-5.1 + US-5.2  (module Application complet + sécurité)
         ↓ tests + review
PR #4  → US-2.5 + US-2.6  (intégration MetaChannelProvider + MetaTokenService)
         ↓ tests + vérifier canaux existants non régressés
PR #5  → US-3.1 + US-3.2 + US-3.3  (admin : types + page liste + formulaire application)
PR #6  → US-3.4  (formulaire canal mis à jour — dernier car impacte le workflow existant)
         ↓ QA complet sur le formulaire de création de canal
[OPS]  → US-4.1 exécution script backfill sur staging → prod
[OPS]  → US-4.2 vérification post-backfill
```

---

## Matrice des régressions à surveiller

| Scénario existant | Phase à risque | Comment vérifier |
|---|---|---|
| Créer un canal Whapi | PR #4 | `POST /channel` avec provider=whapi fonctionne |
| Créer un canal Meta sans application_id | PR #4 | `POST /channel` avec meta_app_id/meta_app_secret directs |
| Refresh token Meta automatique (scheduler) | PR #4 | Vérifier les logs du cron après deploy |
| Webhook Meta entrant (signature HMAC) | PR #4 | Envoyer un webhook test depuis Meta |
| `GET /channel` retourne tous les canaux | PR #2 | Comparer count avant/après |
| Envoi message via OutboundRouterService | PR #4 | Envoyer un message de test sur canal Meta existant |
| Login admin + accès pannel canaux | PR #5, #6 | Navigation dans l'admin |
| Formulaire création canal sans application | PR #6 | Créer un canal depuis l'UI sans toucher le champ Application |

---

## Définition of Done (par US)

Une US est terminée quand :

1. Le code est écrit et `npm run build` passe (0 erreur TS)
2. Les tests unitaires de la US passent (`npm run test -- --testPathPattern=<fichier>`)
3. La suite complète de tests passe (`npm run test`)
4. La matrice de non-régression de la US est cochée manuellement
5. La PR a été relue et approuvée
6. Le déploiement sur staging est validé avant merge en production

---

*Fin du backlog — mise à jour au fur et à mesure de l'avancement des sprints.*
