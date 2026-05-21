# Plan de migration — Remplacement du système de credentials direct par MessagingApplication

**Date de rédaction :** 2026-05-20  
**Auteur :** Kevin Voli  
**Objectif :** Passer définitivement de credentials Meta portés directement sur chaque canal (`meta_app_id`, `meta_app_secret`) à une entité centrale `MessagingApplication`, et supprimer les colonnes legacy une fois tous les canaux migrés.

---

## Contexte

### Ancien système (legacy)
Chaque `WhapiChannel` portait ses propres credentials Meta :
- `meta_app_id` — identifiant de l'application Meta Developer
- `meta_app_secret` — clé secrète (signature HMAC des webhooks, échange de token)

Problèmes : duplication des credentials sur N canaux, rotation de secret manuelle canal par canal, impossible de partager un System User Token (permanent) entre canaux d'une même app.

### Nouveau système (cible)
Une entité `MessagingApplication` centralise les credentials :
- `app_id`, `app_secret`, `system_token` (optionnel, permanent)
- Chaque canal référence une application via `application_id`
- `resolveChannelCredentials()` gère la double-résolution (app > champs directs en fallback)

---

## État d'avancement

### Phase 1 — Infrastructure BDD et backend ✅ TERMINÉE

| Tâche | Fichier | Statut |
|---|---|---|
| Entité `MessagingApplication` | `src/application/entities/messaging-application.entity.ts` | ✅ |
| CRUD service + controller | `src/application/application.service.ts` / `.controller.ts` | ✅ |
| FK `application_id` sur `whapi_channels` | `src/channel/entities/channel.entity.ts` | ✅ |
| Helper `resolveChannelCredentials()` | `src/channel/helpers/resolve-channel-credentials.helper.ts` | ✅ |
| Migration backfill applications | `20260521_backfill_messaging_applications.ts` | ✅ |
| Migration association canal ↔ app | `20260521_associate_channels_to_applications.ts` | ✅ |
| Migration alignement collation MySQL | `20260521_fix_application_id_collation.ts` | ✅ |

### Phase 2 — Admin UI ✅ TERMINÉE

| Tâche | Fichier | Statut |
|---|---|---|
| Page Applications (CRUD) | `admin/src/app/ui/ApplicationsView.tsx` | ✅ |
| Sélecteur application dans ChannelsView | `admin/src/app/ui/ChannelsView.tsx` | ✅ |
| Type `MessagingApplication` + `ViewMode` | `admin/src/app/lib/definitions.ts` | ✅ |
| API client applications | `admin/src/app/lib/api/applications.api.ts` | ✅ |
| Navigation admin | `admin/src/app/data/admin-data.ts` | ✅ |
| Fix URL `/application` → `/applications` | `admin/src/app/lib/api/applications.api.ts` | ✅ |

---

## Phases complétées (2026-05-21)

### Phase 3 — Correction vérification signature webhooks ✅ LIVRÉE

### Phase 4 — Correction surveillance `onModuleInit` ✅ LIVRÉE

### Phase 5 — Application obligatoire à la création ✅ LIVRÉE

### Phase 6 — Nettoyage code providers ✅ LIVRÉE

### Phase 7 — Suppression colonnes `meta_app_id` / `meta_app_secret` ✅ LIVRÉE EN PRODUCTION

Migration `DropLegacyChannelCredentials1779580800001` déployée le 2026-05-21. Colonnes supprimées de `whapi_channels`. Aucun canal orphelin détecté.

---

## ✅ MIGRATION TERMINÉE — Système entièrement remplacé

Le remplacement de l'ancien système de credentials directs par `MessagingApplication` est **complet et en production**.

| Ce qui a changé | Avant | Après |
|---|---|---|
| Credentials Meta | Portés sur chaque canal (`meta_app_id`, `meta_app_secret`) | Centralisés dans `MessagingApplication` |
| Création de canal Meta | Champs directs optionnels | `application_id` obligatoire |
| Signature webhook HMAC | `channel.meta_app_secret` direct | `resolveChannelCredentials()` via l'app |
| Colonnes BDD legacy | `whapi_channels.meta_app_id` / `meta_app_secret` | Supprimées |
| Token refresh | Lisait les champs directs | Passe par l'application liée |

---

## Archives — Phases initiales

### Phase 3 — Correction vérification signature webhooks `[P0 — SÉCURITÉ]`

**Problème :** Le contrôleur webhook (`whapi.controller.ts`) lit `channel.meta_app_secret` directement pour valider la signature HMAC des webhooks entrants. Pour les canaux migrés vers `application_id`, ce champ est `NULL` → la vérification échoue ou passe en mode dégradé.

**Fichiers concernés :**
- `src/whapi/whapi.controller.ts` — lignes 270, 480, 600
- `src/channel/channel.service.ts` — méthodes `findChannelByExternalId()` et `findByChannelId()`

**Tâches :**

1. **`channel.service.ts` — charger la relation `application`** dans les deux méthodes de lookup utilisées par le webhook :
   ```typescript
   // findChannelByExternalId
   return this.channelRepository.findOne({
     where: { provider, external_id: externalId },
     relations: ['application'],   // ← ajouter
   });

   // findByChannelId — actuellement en cache sans relation
   // Modifier pour inclure la relation OU charger l'app séparément
   ```
   > Note : `findByChannelId` utilise un cache Redis — la valeur en cache ne contiendra pas `application`. Deux options : (a) invalider le cache et y inclure l'app, (b) charger l'app séparément dans le webhook controller après le cache hit.

2. **`whapi.controller.ts` — utiliser `resolveChannelCredentials()`** à la place de `channel.meta_app_secret` :
   ```typescript
   // Avant
   this.assertMetaSignature(headers, rawBody, payload, channel?.meta_app_secret);

   // Après
   const creds = channel ? resolveChannelCredentials(channel) : null;
   this.assertMetaSignature(headers, rawBody, payload, creds?.appSecret ?? null);
   ```
   Appliquer le même pattern pour `assertMessengerSignature` et `assertInstagramSignature`.

**Critère de validation :** Les webhooks Meta/Messenger/Instagram arrivent correctement validés pour des canaux dont `meta_app_secret = NULL` et `application_id IS NOT NULL`.

---

### Phase 4 — Correction surveillance `onModuleInit` `[P1]`

**Problème :** Au démarrage, `channel.service.ts` log une erreur `CHANNEL_NO_SECRET` pour tout canal `provider=meta/messenger` avec `meta_app_secret IS NULL`. Depuis la migration, tous les nouveaux canaux utilisent `application_id` et ont `meta_app_secret = NULL` intentionnellement → faux positifs dans les logs.

**Fichier concerné :** `src/channel/channel.service.ts` lignes 83–96

**Tâche :**
```typescript
// Avant
{ provider: 'messenger', meta_app_secret: IsNull() },
{ provider: 'meta', meta_app_secret: IsNull() },

// Après — exclure les canaux couverts par une application
{ provider: 'messenger', meta_app_secret: IsNull(), application_id: IsNull() },
{ provider: 'meta', meta_app_secret: IsNull(), application_id: IsNull() },
```

**Critère de validation :** Plus de faux positifs `CHANNEL_NO_SECRET` au démarrage pour les canaux avec `application_id`.

---

### Phase 5 — Application obligatoire à la création `[P1]`

**Problème :** On peut encore créer un canal `meta/messenger/instagram` sans `application_id`, en passant `meta_app_id` + `meta_app_secret` directement. On veut bloquer cette voie et forcer l'usage d'une application.

**Fichiers concernés :**
- `src/channel/dto/create-channel.dto.ts`
- `src/channel/providers/meta-channel-provider.service.ts`
- `src/channel/providers/messenger-channel-provider.service.ts`
- `src/channel/providers/instagram-channel-provider.service.ts`
- `admin/src/app/ui/ChannelsView.tsx`

**Tâches backend :**

1. Dans chaque provider strategy `create()`, ajouter la validation :
   ```typescript
   if (!dto.application_id) {
     throw new BadRequestException(
       `Une application Meta est requise pour créer un canal ${this.provider}. Créez d'abord une application dans "Applications Meta".`
     );
   }
   ```

2. Garder `meta_app_id` / `meta_app_secret` dans le DTO marqués `@IsOptional()` pour la rétrocompatibilité temporaire, mais les ignorer si `application_id` est fourni (comportement déjà implémenté).

**Tâches frontend :**

1. Dans `ChannelsView.tsx`, rendre le sélecteur "Application" obligatoire (`required`) quand le provider est `meta`, `messenger` ou `instagram`.
2. Masquer complètement les champs `App ID` et `App Secret` directs dans le formulaire (ne les afficher que si aucune application n'est disponible, avec un avertissement de dépréciation).

**Critère de validation :** Impossible de créer un canal meta/messenger/instagram sans `application_id` ni depuis le backend ni depuis l'admin UI.

---

### Phase 6 — Dépréciation des colonnes directes `[P2]`

**Objectif :** Préparer la suppression des colonnes `meta_app_id` et `meta_app_secret` sur `whapi_channels`.

**Prérequis :** Phases 3, 4 et 5 terminées + validation en production que 0 canal actif utilise encore les champs directs.

**Vérification :**
```sql
SELECT COUNT(*) FROM whapi_channels
WHERE provider IN ('meta', 'messenger', 'instagram')
  AND application_id IS NULL
  AND (meta_app_secret IS NOT NULL AND meta_app_secret != '');
```
Si le résultat est > 0, associer manuellement ces canaux à une application avant de continuer.

**Tâches :**

1. Dans `channel.entity.ts`, annoter les colonnes comme legacy :
   ```typescript
   /** @deprecated Utiliser application_id. Sera supprimé en Phase 7. */
   @Column({ name: 'meta_app_id', ... })
   meta_app_id?: string | null;

   /** @deprecated Utiliser application_id. Sera supprimé en Phase 7. */
   @Column({ name: 'meta_app_secret', ... })
   meta_app_secret?: string | null;
   ```

2. Dans `create-channel.dto.ts`, marquer les champs comme dépréciés et y ajouter une note.

3. Supprimer les références à `dto.meta_app_id` / `dto.meta_app_secret` dans les trois providers (la logique de fallback n'aura plus lieu d'être une fois `application_id` obligatoire).

**Critère de validation :** Les colonnes existent toujours en base mais ne sont plus jamais alimentées par le code applicatif.

---

### Phase 7 — Suppression définitive des colonnes `[P3]`

**Objectif :** Supprimer `meta_app_id` et `meta_app_secret` de la table `whapi_channels`, de l'entité TypeORM et du DTO.

**Prérequis :** Phase 6 terminée et validée en production pendant ≥ 2 semaines.

**Tâches :**

1. **Migration SQL :**
   ```typescript
   // Nom de classe : DropLegacyChannelCredentials<timestamp>
   await queryRunner.query('ALTER TABLE `whapi_channels` DROP COLUMN `meta_app_id`');
   await queryRunner.query('ALTER TABLE `whapi_channels` DROP COLUMN `meta_app_secret`');
   ```

2. **Entité `channel.entity.ts` :** Supprimer les propriétés `meta_app_id` et `meta_app_secret`.

3. **DTO `create-channel.dto.ts` / `update-channel.dto.ts` :** Supprimer les champs `meta_app_id` et `meta_app_secret`.

4. **`resolve-channel-credentials.helper.ts` :** Simplifier — le fallback direct n'existe plus :
   ```typescript
   export function resolveChannelCredentials(channel: WhapiChannel): ChannelCredentials {
     const app = channel.application;
     if (!app) throw new Error(`Canal ${channel.id} sans application liée`);
     const systemToken = app.systemToken?.trim() || null;
     return {
       appId: app.appId,
       appSecret: app.appSecret,
       accessToken: systemToken ?? channel.token,
       isSystemToken: !!systemToken,
     };
   }
   ```

5. **Tests :** Mettre à jour `resolve-channel-credentials.helper.spec.ts` pour supprimer les cas de test du fallback direct.

**Critère de validation :** Tous les tests passent, 0 référence à `meta_app_id`/`meta_app_secret` dans le code, migration déployée avec succès.

---

## Résumé des priorités

| Phase | Description | Priorité | Effort estimé |
|---|---|---|---|
| 3 | Signature webhooks via `resolveChannelCredentials` | **P0** | 2h |
| 4 | Fix faux positifs `onModuleInit` | **P1** | 30min |
| 5 | Application obligatoire à la création | **P1** | 3h (BE + FE) |
| 6 | Dépréciation colonnes legacy | **P2** | 1h |
| 7 | Suppression colonnes + nettoyage complet | **P3** | 2h + migration |

---

## Risques et précautions

| Risque | Mitigation |
|---|---|
| Canal sans `application_id` en production → webhook 401 après Phase 3 | Vérifier avant déploiement que 0 canal Meta actif a `application_id IS NULL` |
| Cache Redis contient des canaux sans relation `application` | Flush du cache au déploiement de la Phase 3 OU chargement séparé de l'app dans le webhook |
| DROP COLUMN irréversible (Phase 7) | Exécuter uniquement après snapshot BDD + validation 2 semaines en prod |
| Faux positifs `CHANNEL_NO_SECRET` (Phase 4) | Faible risque — logs seulement, pas de blocage fonctionnel |
