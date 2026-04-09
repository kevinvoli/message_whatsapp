# CAHIER DES CHARGES — Plan de correction du projet WhatsApp Multi-Tenant

> Basé sur le bilan `BILAN_CODE.md` du 2026-04-09.
> Chaque item est autonome, assignable et vérifiable.

---

## ORGANISATION DU DOCUMENT

- **Phase 1 — Sécurité & Bugs critiques** (bloquants production)
- **Phase 2 — Intégrité des données** (transactions, bugs latents)
- **Phase 3 — Architecture & Découplage** (dette structurelle)
- **Phase 4 — Qualité & Nettoyage** (dette technique légère)
- **Phase 5 — Performance & Scalabilité** (optimisations)
- **Phase 6 — Tests** (couverture manquante)
- **Phase 7 — Frontend & UX** (composants, types, duplication)

Chaque item indique :
- **Fichier(s) concerné(s)**
- **Problème constaté**
- **Action attendue**
- **Critère d'acceptation** (comment vérifier que c'est corrigé)
- **Effort estimé** : XS (<1h) / S (1-2h) / M (2-4h) / L (4-8h) / XL (>8h)

---

## PHASE 1 — SÉCURITÉ & BUGS CRITIQUES

> Ces items doivent être traités avant toute mise en production.

---

### SEC-01 — Réactiver la vérification HMAC des webhooks Whapi

**Priorité** : 🔴 Critique  
**Effort** : S

**Fichier** : `message_whatsapp/src/whapi/whapi.controller.ts` ligne 57

**Problème** :
La ligne `// this.assertWhapiSecret(headers, request.rawBody, payload);` est commentée. Aucun webhook entrant Whapi n'est vérifié cryptographiquement. N'importe qui connaissant l'URL peut injecter de faux événements (messages, statuts, contacts) dans le système.

**Action attendue** :
1. Décommenter l'appel à `assertWhapiSecret`.
2. Vérifier que la variable `WHAPI_WEBHOOK_SECRET` est bien définie dans les environnements de staging et production.
3. Vérifier que `request.rawBody` est correctement alimenté (middleware `bodyParser` raw configuré dans `main.ts`).
4. Ajouter la variable à la validation Joi de `app.module.ts` si elle n'y est pas.

**Critère d'acceptation** :
- Un POST sur `/webhooks/whapi` avec une signature invalide retourne HTTP 401.
- Un POST avec une signature valide est traité normalement.
- La variable `WHAPI_WEBHOOK_SECRET` est listée dans le schéma Joi de validation d'environnement.

---

### SEC-02 — Restreindre le CORS WebSocket

**Priorité** : 🔴 Critique  
**Effort** : XS

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` ligne 49

**Problème** :
`origin: '*'` dans la configuration Socket.io accepte les connexions WebSocket de n'importe quelle origine, contournant la politique CORS HTTP configurée dans `main.ts`.

**Action attendue** :
1. Remplacer `origin: '*'` par la lecture de la variable `CORS_ORIGINS` (déjà utilisée dans `main.ts`).
2. Appliquer la même liste d'origines autorisées que le CORS HTTP.
3. En développement (`NODE_ENV=development`), `localhost:*` peut rester permissif.

**Critère d'acceptation** :
- Une connexion WebSocket depuis une origine non listée est refusée avec une erreur CORS.
- Les connexions depuis les origines autorisées fonctionnent normalement.

---

### SEC-03 — Réduire la durée de vie des access tokens JWT

**Priorité** : 🔴 Critique  
**Effort** : S

**Fichier** : `message_whatsapp/src/auth/auth.service.ts` ligne 14

**Problème** :
`accessTokenExpiry: '7d'` — un access token valable 7 jours est une durée excessive. En cas de compromission d'un token, l'attaquant dispose d'une fenêtre de 7 jours. Le refresh token est également à `'7d'`, ce qui rend le mécanisme de refresh inutile.

**Action attendue** :
1. Passer `accessTokenExpiry` à `'15m'` (15 minutes).
2. Passer `refreshTokenExpiry` à `'7d'` (si ce n'est pas déjà le cas, ou `'30d'` selon la politique).
3. Vérifier que le frontend (`front/`) et le panel admin (`admin/`) gèrent correctement le renouvellement automatique du token via l'endpoint de refresh.
4. Si le frontend ne gère pas encore le refresh automatique, implémenter un intercepteur HTTP qui, sur une réponse 401, tente un refresh puis relance la requête.

**Critère d'acceptation** :
- Un access token expiré est rejeté avec HTTP 401.
- Le frontend renouvelle automatiquement le token sans déconnecter l'utilisateur.
- Un refresh token expiré déconnecte l'utilisateur et redirige vers la page de login.

---

### BUG-01 — Corriger le placeholder SQL PostgreSQL dans `recomputeUnreadCount`

**Priorité** : 🔴 Critique  
**Effort** : XS

**Fichier** : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` ligne ~191

**Problème** :
La requête utilise `$1` comme placeholder (syntaxe PostgreSQL) sur une base MySQL. La requête échoue silencieusement ou produit un résultat inattendu chaque fois que `recomputeUnreadCount` est appelée.

**Action attendue** :
1. Remplacer `$1` par le placeholder MySQL approprié (paramètre nommé TypeORM `:param` ou `?`).
2. Vérifier toutes les requêtes raw du service pour d'autres occurrences de `$N`.

**Critère d'acceptation** :
- `recomputeUnreadCount` s'exécute sans erreur SQL.
- Le compteur `unread_count` est correctement mis à jour après l'appel.

---

### BUG-02 — Supprimer les `console.log` actifs en production

**Priorité** : 🔴 Critique  
**Effort** : XS

**Fichier** : `message_whatsapp/src/whapi/whapi.controller.ts` lignes 190, 194, 197

**Problème** :
Trois `console.log` actifs dans le handler de vérification webhook Meta — exposent des données de payload en clair dans les logs de production (données potentiellement sensibles).

**Action attendue** :
1. Remplacer les `console.log` par des appels `this.logger.debug(...)` (Logger NestJS).
2. Passer en revue l'ensemble du backend pour identifier et traiter les autres `console.log` commentés — les supprimer définitivement (ne pas laisser du code commenté).

**Critère d'acceptation** :
- `grep -r "console.log" src/` ne retourne aucun résultat non commenté.
- Les logs de debug Meta passent par le Logger NestJS avec le niveau `debug`.

---

### BUG-03 — Remplacer les faux pourcentages de variation dans le dashboard

**Priorité** : 🔴 Critique (UX / fiabilité)  
**Effort** : M

**Fichier** : `admin/src/app/ui/OverviewView.tsx` ligne ~102

**Problème** :
`getVariation(valeur: number)` retourne `Math.floor(Math.random() * 30) - 10` — les variations affichées (+12%, -5%, etc.) sont purement aléatoires et changent à chaque render. Les utilisateurs prennent des décisions basées sur des données fictives.

**Action attendue** :
1. Supprimer `getVariation()` et tous ses appels.
2. Option A (simple) : ne pas afficher de variation tant qu'il n'y a pas de données historiques — masquer le badge de variation.
3. Option B (complète) : ajouter au backend un endpoint de comparaison période courante vs période précédente, et consommer ces données réelles dans `OverviewView`.
4. Si Option B : modifier `MetriquesService` pour retourner les valeurs de la période précédente en parallèle des valeurs courantes.

**Critère d'acceptation** :
- Aucune valeur de variation n'est générée aléatoirement.
- Si les variations ne sont pas calculées, le badge est absent (pas de valeur fictive).
- Si les variations sont calculées, elles correspondent à la comparaison période N vs période N-1.

---

## PHASE 2 — INTÉGRITÉ DES DONNÉES

---

### INT-01 — Ajouter des transactions sur `createAgentMessage`

**Priorité** : 🟠 Important  
**Effort** : M

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

**Problème** :
L'envoi d'un message agent suit 3 étapes sans transaction :
1. Envoi vers l'API externe (Whapi/Meta)
2. Sauvegarde du message en BDD
3. Mise à jour du chat (`last_message_at`, `last_message`, etc.)

Un crash entre les étapes 2 et 3 laisse un message sauvé mais le chat dans un état incohérent (last_message non mis à jour, compteurs faux).

**Action attendue** :
1. Utiliser un `QueryRunner` TypeORM pour encapsuler les étapes 2 et 3 dans une transaction.
2. L'appel à l'API externe (étape 1) doit rester hors de la transaction (on ne peut pas rollback un appel réseau).
3. Si l'envoi externe échoue, ne pas écrire en BDD.
4. Si la transaction BDD échoue après un envoi externe réussi, logger l'incident avec les données du message pour récupération manuelle.

**Critère d'acceptation** :
- Un crash simulé entre save message et update chat ne laisse pas la BDD dans un état incohérent.
- Les tests unitaires couvrent le cas d'échec BDD post-envoi.

---

### INT-02 — Ajouter des transactions sur `createAgentMediaMessage`

**Priorité** : 🟠 Important  
**Effort** : M

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

**Problème** :
4 étapes sans transaction : envoi externe → save message → save media → update chat. Un crash partiel laisse des enregistrements orphelins (message sans media, ou media sans message).

**Action attendue** :
Même approche que INT-01 — `QueryRunner` sur les étapes 2, 3, 4 avec l'envoi externe en dehors.

**Critère d'acceptation** :
- Pas d'enregistrement `WhatsappMedia` orphelin sans `WhatsappMessage` correspondant.
- La transaction rollback correctement si save media échoue après save message.

---

### INT-03 — Ajouter une transaction sur `assignConversationInternal`

**Priorité** : 🟠 Important  
**Effort** : S

**Fichier** : `message_whatsapp/src/dispatcher/dispatcher.service.ts`

**Problème** :
`chatRepository.save()` suivi de `emitConversationUpsertByChatId()` sans transaction. Si l'émission socket échoue, la BDD dit que le chat est assigné mais le frontend n'a pas reçu l'événement — état divergent BDD/socket.

**Action attendue** :
1. Effectuer le `save()` dans une transaction.
2. N'émettre l'événement socket qu'après confirmation du commit de la transaction.
3. Si le socket échoue, loguer un warning avec le `chat_id` — le client reçevra la mise à jour au prochain refresh ou reconnexion.

**Critère d'acceptation** :
- Un échec du socket après save ne corrompt pas l'état BDD.
- La conversation est correctement assignée côté BDD même si l'émission socket échoue temporairement.

---

### INT-04 — Corriger la sérialisation des erreurs dans `whatsapp_message.service.ts`

**Priorité** : 🟠 Important  
**Effort** : XS

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

**Problème** :
`throw new NotFoundException(new Error(error))` — passer un objet `Error` au constructeur de `NotFoundException` au lieu d'un message string produit une réponse JSON malformée : `{"message": {}}` au lieu de `{"message": "Message d'erreur lisible"}`.

**Action attendue** :
1. Remplacer toutes les occurrences par `throw new NotFoundException(error instanceof Error ? error.message : String(error))`.
2. Rechercher le même anti-pattern dans tous les services du projet.

**Critère d'acceptation** :
- Une réponse 404 contient un champ `message` de type string lisible.
- `grep -r "new NotFoundException(new Error" src/` ne retourne aucun résultat.

---

### INT-05 — Typer `createInternalMessage` (suppression du `any`)

**Priorité** : 🟠 Important  
**Effort** : S

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` ligne ~655

**Problème** :
`createInternalMessage(message: any)` — une méthode critique pour la création de messages système accepte n'importe quelle donnée sans validation.

**Action attendue** :
1. Définir un DTO ou interface `CreateInternalMessageDto` avec les champs obligatoires.
2. Appliquer ce type comme paramètre de `createInternalMessage`.
3. Vérifier que tous les appelants passent les bons champs.

**Critère d'acceptation** :
- `createInternalMessage` est typé, TypeScript compile sans erreur.
- Aucun appelant ne passe un objet incompatible.

---

## PHASE 3 — ARCHITECTURE & DÉCOUPLAGE

---

### ARCH-01 — Découper `WhatsappMessageGateway` (1423 lignes)

**Priorité** : 🟠 Important  
**Effort** : XL

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

**Problème** :
Le gateway gère en un seul fichier : connexions WebSocket, conversations, messages, contacts, call logs, typing, queue, recherche. Impossible à tester unitairement, impossible à maintenir.

**Action attendue** :
Découper en handlers thématiques, chacun étant un `@Injectable()` délégué appelé par le gateway principal :

| Handler | Responsabilité |
|---|---|
| `ConversationHandler` | Chargement et envoi des listes de conversations |
| `MessageHandler` | Envoi / réception / pagination des messages |
| `PresenceHandler` | Connexion, déconnexion, typing, statut online |
| `ContactHandler` | Chargement des données contact |
| `CallLogHandler` | Gestion des call logs |
| `QueueHandler` | Mise à jour et émission des positions de queue |

Le gateway principal reste le point d'entrée `@WebSocketGateway`, mais délègue tout traitement aux handlers injectés.

**Critère d'acceptation** :
- `whatsapp_message.gateway.ts` fait moins de 200 lignes (routing + injection uniquement).
- Chaque handler a son propre fichier et ses propres tests unitaires.
- Le comportement observable depuis le frontend est inchangé.

---

### ARCH-02 — Éliminer les `forwardRef` injustifiés via EventEmitter2

**Priorité** : 🟠 Important  
**Effort** : L

**Fichiers** :
- `message_whatsapp/src/dispatcher/dispatcher.service.ts`
- `message_whatsapp/src/message-auto/message-auto.service.ts`
- `message_whatsapp/src/message-auto/auto-message-orchestrator.service.ts`

**Problème** :
Le `DispatcherService`, `MessageAutoService` et `AutoMessageOrchestratorService` injectent directement `WhatsappMessageGateway` pour émettre des événements socket, créant des dépendances circulaires injustifiées.

**Action attendue** :
1. Installer `@nestjs/event-emitter` (`EventEmitter2`) dans le projet.
2. Déclarer des événements typés : `ConversationAssignedEvent`, `AutoMessageSentEvent`, etc.
3. Dans `dispatcher.service.ts` et `message-auto.service.ts` : remplacer l'injection du gateway par `EventEmitter2.emit(event)`.
4. Dans `WhatsappMessageGateway` : écouter ces événements via `@OnEvent(...)` et émettre vers les sockets.
5. Supprimer les `forwardRef` concernés.

**Critère d'acceptation** :
- `grep -r "forwardRef" src/` retourne maximum 6 résultats (les `forwardRef` justifiés conservés).
- Les événements socket sont toujours émis lors d'une assignation ou d'un envoi auto-message.
- Plus de dépendance circulaire dans le graph de dépendances NestJS.

---

### ARCH-03 — Éliminer la duplication dans `channel.service.ts create()` via Strategy

**Priorité** : 🟠 Important  
**Effort** : L

**Fichier** : `message_whatsapp/src/channel/channel.service.ts`

**Problème** :
La méthode `create()` contient un bloc `if/else` par provider (whapi, meta, messenger, instagram, telegram) avec ~50 lignes quasi-identiques par provider. Toute modification de la logique commune doit être répercutée 5 fois.

**Action attendue** :
1. Définir une interface `ChannelCreationStrategy` avec une méthode `create(dto, channel): Promise<void>`.
2. Créer une stratégie par provider : `WhapiChannelStrategy`, `MetaChannelStrategy`, etc.
3. Injecter toutes les stratégies dans `ChannelService` via un registre.
4. Réduire `create()` à : validation → lookup stratégie → exécution.

**Critère d'acceptation** :
- `channel.service.ts` ne contient plus de blocs `if provider === 'whapi'` / `else if provider === 'meta'`.
- Chaque stratégie a son propre fichier.
- L'ajout d'un nouveau provider ne nécessite pas de modifier `channel.service.ts`.

---

### ARCH-04 — Remplacer `AppModule.forFeature` par les modules métier

**Priorité** : 🟡 Souhaitable  
**Effort** : S

**Fichier** : `message_whatsapp/src/app.module.ts` lignes 44-49

**Problème** :
`AppModule` importe directement des entités via `TypeOrmModule.forFeature([...])`. Ce n'est pas la responsabilité du module racine — ces entités devraient être déclarées dans leurs modules métier respectifs.

**Action attendue** :
1. Identifier quelles entités sont importées dans `AppModule.forFeature`.
2. Les déplacer dans le `TypeOrmModule.forFeature` de leur module métier respectif.
3. Exporter les repositories concernés depuis leurs modules.

**Critère d'acceptation** :
- `AppModule` ne contient plus de `TypeOrmModule.forFeature`.
- L'application démarre sans erreur de résolution de dépendances.

---

### ARCH-05 — Supprimer `TasksService` (code mort)

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichier** : `message_whatsapp/src/jorbs/tasks.service.ts` et `app.module.ts`

**Problème** :
Le fichier `tasks.service.ts` contient uniquement du code commenté (lignes 7-27). Il est quand même importé dans `app.module.ts` comme provider, inutilement.

**Action attendue** :
1. Supprimer `tasks.service.ts`.
2. Supprimer la déclaration de `TasksService` dans le module `jorbs` et dans `app.module.ts`.
3. Vérifier qu'aucun autre fichier n'importe `TasksService`.

**Critère d'acceptation** :
- Le fichier `tasks.service.ts` n'existe plus.
- `grep -r "TasksService" src/` ne retourne aucun résultat.
- L'application démarre sans erreur.

---

### ARCH-06 — Renommer le dossier `communication_whapi` en `communication`

**Priorité** : 🟡 Souhaitable  
**Effort** : S

**Fichier** : `message_whatsapp/src/communication_whapi/`

**Problème** :
Le dossier contient des services pour tous les providers (`communication_meta.service.ts`, `communication_messenger.service.ts`, etc.) mais porte le nom "whapi" — trompeur.

**Action attendue** :
1. Renommer le dossier en `communication/` (ou `outbound/`).
2. Mettre à jour tous les imports dans les fichiers qui référencent ce dossier.
3. Mettre à jour `app.module.ts` si nécessaire.

**Critère d'acceptation** :
- Le dossier `communication_whapi/` n'existe plus.
- Tous les imports compilent sans erreur.

---

## PHASE 4 — QUALITÉ & NETTOYAGE

---

### CLEAN-01 — Corriger la typo `messageCnntent` dans l'entité

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichier** : `message_whatsapp/src/whatsapp_message/entities/whatsapp_message.entity.ts` ligne ~164

**Action attendue** :
Renommer la propriété `messageCnntent` en `messageContent` dans l'entité et tous ses usages.

**Critère d'acceptation** :
- `grep -r "messageCnntent" src/` ne retourne aucun résultat.

---

### CLEAN-02 — Supprimer les commentaires "trajet" hérités

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichiers** :
- `whatsapp_chat.entity.ts` lignes 42, 305, 314
- `whatsapp_message.entity.ts` lignes 62, 263, 272

**Action attendue** :
Remplacer les commentaires `'Primary key - Unique trajet identifier'` et `'Timestamp when the trajet was created'` par des commentaires pertinents au domaine (`'Unique chat identifier'`, `'Timestamp when the chat was created'`).

---

### CLEAN-03 — Corriger la typo `jobRunnertcheque`

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichier** : `message_whatsapp/src/dispatcher/dispatcher.service.ts` ligne ~495

**Action attendue** :
Renommer `jobRunnertcheque` en `jobRunnerCheck` et mettre à jour tous les appels.

---

### CLEAN-04 — Supprimer les imports inutilisés

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichiers** :
- `whatsapp_message.service.ts` : `ExceptionsHandler`
- `whatsapp_message.gateway.ts` : `last` de `rxjs`
- `whapi.controller.ts` : `json` de `stream/consumers`

**Action attendue** :
Supprimer les imports inutilisés listés. Activer la règle ESLint `no-unused-vars` / `@typescript-eslint/no-unused-vars` si elle n'est pas déjà active.

**Critère d'acceptation** :
- `tsc --noEmit` compile sans warning d'import inutilisé.

---

### CLEAN-05 — Uniformiser les logs (supprimer les emojis des logs structurés)

**Priorité** : 🟡 Souhaitable  
**Effort** : S

**Fichiers** : Ensemble du backend

**Problème** :
Les logs mélangent emojis (`📩`, `🔥`, `🧼`) et logs structurés (`DISPATCH_START trace=...`). Cela rend l'agrégation et le parsing des logs difficiles dans un outil de monitoring (Datadog, Loki, etc.).

**Action attendue** :
1. Choisir une convention : soit tout-texte structuré, soit autoriser les emojis dans les logs `debug` uniquement.
2. Appliquer la convention à l'ensemble du backend.
3. S'assurer que tous les logs critiques (`DISPATCH_*`, `ALERT_*`, `SLA_*`) sont en texte structuré parsable.

---

### CLEAN-06 — Renommer `user.entity.ts` en `whatsapp_commercial.entity.ts`

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichier** : `message_whatsapp/src/whatsapp_commercial/entities/user.entity.ts`

**Action attendue** :
Renommer le fichier en `whatsapp_commercial.entity.ts` et mettre à jour tous les imports.

---

### CLEAN-07 — Supprimer le code commenté non pertinent

**Priorité** : 🟡 Souhaitable  
**Effort** : S

**Fichiers** :
- `whatsapp_message.service.ts` lignes 232-244 (fallback message en échec commenté)
- `whatsapp_message.entity.ts` lignes 286-291 (`@BeforeInsert` commenté)
- `tasks.service.ts` (traité par ARCH-05)
- Tous les `console.log` commentés

**Action attendue** :
Supprimer définitivement tout code commenté qui n'a pas vocation à être réactivé.

---

### CLEAN-08 — Nettoyer les champs mock dans le type `Commercial` admin

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichier** : `admin/src/app/lib/definitions.ts`

**Problème** :
Le type `Commercial` contient des champs `avatar`, `region`, `messagesEnvoyes` qui ne correspondent à aucun champ retourné par l'API backend — vestiges de données mockées jamais nettoyées.

**Action attendue** :
1. Identifier les champs du type `Commercial` qui ne correspondent à aucune propriété retournée par l'endpoint backend.
2. Supprimer ces champs du type TypeScript.
3. Vérifier que les composants qui référencent ces champs n'affichent pas de données `undefined`.

---

### CLEAN-09 — Corriger la double représentation `unreadCount` / `unread_count`

**Priorité** : 🟡 Souhaitable  
**Effort** : XS

**Fichier** : `admin/src/app/lib/definitions.ts`

**Problème** :
Le type `WhatsappChat` admin a `unreadCount?: number` ET `unread_count: number` — deux noms pour le même champ.

**Action attendue** :
1. Conserver uniquement `unread_count: number` (convention snake_case déjà utilisée dans le backend).
2. Mettre à jour les composants qui utilisent `unreadCount`.

---

## PHASE 5 — PERFORMANCE & SCALABILITÉ

---

### PERF-01 — Ajouter un index sur `WhatsappChat.channel_id`

**Priorité** : 🟠 Important  
**Effort** : S

**Fichier** : `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts` + nouvelle migration

**Problème** :
Les requêtes `getDedicatedPosteId` et `getStatutChannels` filtrent sur `channel_id` sans index — scan complet de la table à chaque appel. La table `whatsapp_chat` est la plus volumineuse du système.

**Action attendue** :
1. Ajouter `@Index('IDX_chat_channel_id')` sur la propriété `channel_id` dans l'entité.
2. Créer une migration `20260410_add_index_chat_channel_id.ts`.
3. Utiliser le helper `createIndexIfNotExists` pour l'idempotence.

**Critère d'acceptation** :
- `EXPLAIN SELECT * FROM whatsapp_chat WHERE channel_id = '...'` montre `type: ref` (utilisation de l'index) au lieu de `type: ALL`.

---

### PERF-02 — Corriger le chargement eager des messages dans `findOne` chat

**Priorité** : 🟠 Important  
**Effort** : S

**Fichier** : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` ligne ~389

**Problème** :
`leftJoinAndSelect('chat.messages', 'messages')` charge TOUS les messages d'une conversation lors d'un `findOne` — potentiellement des milliers de messages chargés en RAM pour afficher seulement les métadonnées de la conversation.

**Action attendue** :
1. Supprimer le `leftJoinAndSelect` sur `messages` du `findOne` général.
2. Si certains appelants ont besoin des messages, créer une méthode `findOneWithMessages(id, { limit, offset })` paginée.
3. Vérifier que `ConversationsView` admin (principal appelant) n'utilise pas les messages depuis ce `findOne`.

**Critère d'acceptation** :
- `findOne` ne charge plus aucun message.
- Aucun appelant de `findOne` ne lit la propriété `messages` de la réponse.

---

### PERF-03 — Ajouter un mécanisme de lock distribué pour les crons

**Priorité** : 🟡 Souhaitable  
**Effort** : L

**Fichier** : `message_whatsapp/src/jorbs/` (ensemble des jobs)

**Problème** :
En déploiement multi-instance (PM2 cluster, Kubernetes), chaque instance exécute les crons indépendamment — doublons de messages auto, de notifications SLA, d'alertes système.

**Action attendue** :
Option A (simple) : Utiliser une colonne `last_run_at` + `lock_token` en BDD avec un `UPDATE WHERE lock_token IS NULL OR last_run_at < NOW() - INTERVAL` pour acquérir le lock avant chaque exécution.
Option B (robuste) : Utiliser Redis avec `SET NX PX` (SET if Not eXists) comme verrou distribué.

**Critère d'acceptation** :
- En simulation de 2 instances parallèles exécutant le même cron, les actions (envoi auto-message, notification) ne sont effectuées qu'une seule fois.

---

### PERF-04 — Purger périodiquement les Maps de mutexes

**Priorité** : 🟡 Souhaitable  
**Effort** : S

**Fichiers** :
- `message_whatsapp/src/dispatcher/dispatcher.service.ts` (`chatDispatchLocks` Map)
- `message_whatsapp/src/whatsapp_message/inbound-message.service.ts` (`chatMutexes` Map)

**Problème** :
Les mutexes sont créés par `chat_id` mais ne sont jamais purgés (la suppression conditionnelle dans `finally` peut échouer). Sur un système longtemps actif, ces Maps grossissent indéfiniment — fuite mémoire lente.

**Action attendue** :
1. Ajouter une méthode de purge `pruneIdleMutexes()` qui supprime les mutexes non verrouillés depuis plus de N minutes.
2. Appeler cette purge toutes les 30 minutes via un `setInterval` dans `onModuleInit`.

**Critère d'acceptation** :
- Après 2 heures d'activité simulée avec 1000 chats différents, la taille des Maps redescend à ~0 lors d'une période d'inactivité.

---

### PERF-05 — Implémenter `stopAgentSlaMonitor` (no-op actuel)

**Priorité** : 🟡 Souhaitable  
**Effort** : S

**Fichier** : `message_whatsapp/src/jorbs/first-response-timeout.job.ts` ligne ~75

**Problème** :
`stopAgentSlaMonitor` ne fait que logger un message debug. Le nom suggère qu'il devrait arrêter un monitoring — actuellement sans effet.

**Action attendue** :
1. Déterminer ce que `stopAgentSlaMonitor` devrait effectivement faire (arrêter un intervalle, nettoyer un état ?).
2. Implémenter le comportement attendu ou renommer en `logSlaMonitorStop` si c'est intentionnel.

---

## PHASE 6 — TESTS

---

### TEST-01 — Ajouter des tests pour `whatsapp_message.service.ts`

**Priorité** : 🟠 Important  
**Effort** : XL

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

**Cas à couvrir** :
1. `createAgentMessage` — succès, échec envoi externe, échec BDD
2. `createAgentMediaMessage` — succès, chaque cas d'échec partiel
3. `findBychat_id` — pagination correcte, `hasMore` correct
4. Déduplication des messages (message déjà existant)
5. Gestion des messages de statut

**Critère d'acceptation** :
- Couverture > 80% des branches de `whatsapp_message.service.ts`.
- Les cas d'erreur (envoi externe échoue, BDD échoue) sont tous testés.

---

### TEST-02 — Ajouter des tests pour `whatsapp_message.gateway.ts`

**Priorité** : 🟠 Important  
**Effort** : XL

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

**Cas à couvrir** :
1. Connexion avec token valide — socket authentifié
2. Connexion avec token invalide — socket déconnecté
3. Émission d'événements après `createAgentMessage`
4. Gestion du typing (envoi + TTL d'expiration)
5. `sendConversationsToClient` — données correctement envoyées

**Critère d'acceptation** :
- Couverture > 70% du gateway.

---

### TEST-03 — Ajouter des tests pour `notification.service.ts`

**Priorité** : 🟡 Souhaitable  
**Effort** : M

**Cas à couvrir** :
1. Envoi de notification avec canal valide
2. Envoi avec canal inexistant
3. Formatage du message de notification

---

### TEST-04 — Ajouter des tests pour `auth.service.ts` et `auth_admin.service.ts`

**Priorité** : 🟡 Souhaitable  
**Effort** : M

**Cas à couvrir** :
1. Login avec credentials valides — retourne access token + refresh token
2. Login avec mauvais mot de passe — retourne 401
3. Refresh token valide — retourne nouvel access token
4. Refresh token expiré — retourne 401

---

### TEST-05 — Ajouter des tests pour `system-alert.service.ts`

**Priorité** : 🟡 Souhaitable  
**Effort** : M

**Cas à couvrir** :
1. Déclenchement d'une alerte avec seuil dépassé
2. Pas d'alerte si seuil non atteint
3. Envoi de la notification d'alerte

---

## PHASE 7 — FRONTEND & UX

---

### FRONT-01 — Typer `payload: any` dans `WebSocketEvents.tsx`

**Priorité** : 🟠 Important  
**Effort** : M

**Fichier** : `front/src/components/WebSocketEvents.tsx` lignes 64, 235, 278, 283

**Problème** :
Les handlers socket utilisent `payload: any` et `call_logs: any[]` — perte totale de typage sur le data flow principal de l'application.

**Action attendue** :
1. Définir des interfaces typées pour chaque payload socket attendu (dans `types/socket-events.ts`).
2. Remplacer tous les `any` dans `WebSocketEvents.tsx` par ces types.
3. Typer également `call_log: any` et `call_logs: any[]`.

**Critère d'acceptation** :
- `grep "any" front/src/components/WebSocketEvents.tsx` ne retourne aucun résultat de type paramètre.
- TypeScript signale tout accès à une propriété inexistante sur un payload socket.

---

### FRONT-02 — Corriger le `useEffect` avec deps manquantes dans `SocketProvider`

**Priorité** : 🟠 Important  
**Effort** : S

**Fichier** : `front/src/contexts/SocketProvider.tsx` ligne ~53

**Problème** :
`// eslint-disable-next-line react-hooks/exhaustive-deps` est utilisé pour supprimer un warning légitime — la dépendance `socket` est exclue du tableau de deps, ce qui peut causer une fuite si le socket change.

**Action attendue** :
1. Analyser pourquoi `socket` est exclu des deps.
2. Refactorer le `useEffect` pour que `socket` puisse être inclus sans provoquer de boucle infinie.
3. Supprimer le commentaire `eslint-disable`.

**Critère d'acceptation** :
- Aucun `eslint-disable react-hooks/exhaustive-deps` dans `SocketProvider.tsx`.
- Pas de fuite de connexion détectée lors d'un changement de socket (ex: reconnexion).

---

### FRONT-03 — Mutualiser `dateUtils.ts` entre `front/` et `admin/`

**Priorité** : 🟡 Souhaitable  
**Effort** : M

**Fichiers** :
- `front/src/lib/dateUtils.ts`
- `admin/src/app/lib/dateUtils.ts`

**Problème** :
Fichiers 100% identiques — toute correction ou ajout doit être répercuté manuellement dans les deux.

**Action attendue** :

Option A (simple, sans monorepo) :
1. Créer un dossier `packages/shared/` à la racine du projet.
2. Y placer `dateUtils.ts` unique.
3. Configurer `tsconfig.json` de `front` et `admin` pour pointer vers ce package via `paths`.

Option B (monorepo) :
- Migrer vers Turborepo ou Nx avec un package `@whatsapp/shared`.

**Critère d'acceptation** :
- Une seule source de vérité pour `dateUtils.ts`.
- Les deux applications `front` et `admin` compilent en important depuis le package partagé.

---

### FRONT-04 — Découper les composants admin > 600 lignes

**Priorité** : 🟡 Souhaitable  
**Effort** : XL (par composant)

**Fichiers cibles** :
- `admin/ui/MessageAutoView.tsx` (946 lignes)
- `admin/ui/ConversationsView.tsx` (884 lignes)
- `admin/ui/ChannelsView.tsx` (824 lignes)
- `admin/ui/CommerciauxView.tsx` (713 lignes)
- `admin/ui/OverviewView.tsx` (687 lignes)

**Action attendue** :
Pour chaque composant :
1. Extraire les modales en composants dédiés (`CreateChannelModal`, `AssignPosteModal`, etc.).
2. Extraire les formulaires en composants dédiés.
3. Extraire les tableaux/listes en composants dédiés.
4. Conserver le composant principal comme orchestrateur (état + appels API uniquement).

**Critère d'acceptation** :
- Aucun composant admin ne dépasse 300 lignes.
- Le comportement observable depuis l'interface est inchangé.

---

### FRONT-05 — Implémenter l'archivage de contact par socket

**Priorité** : 🟡 Souhaitable  
**Effort** : M

**Fichier** : `front/src/app/contacts/page.tsx` ligne ~403

**Problème** :
`// TODO: émettre socket pour archiver le contact` — l'archivage de contact n'émet pas d'événement temps réel.

**Action attendue** :
1. Implémenter l'émission socket `contact_archived` lors de l'archivage.
2. Dans `WebSocketEvents.tsx`, écouter `contact_archived` et mettre à jour le store.

**Critère d'acceptation** :
- Archiver un contact depuis un onglet met à jour la liste de contacts dans un autre onglet ouvert simultanément.

---

## RÉCAPITULATIF PAR PRIORITÉ

### 🔴 Phase 1 — Critique (à faire avant toute mise en production)

| ID | Titre | Effort |
|---|---|---|
| SEC-01 | Réactiver HMAC webhooks Whapi | S |
| SEC-02 | Restreindre CORS WebSocket | XS |
| SEC-03 | Réduire TTL access token JWT | S |
| BUG-01 | Corriger placeholder SQL `$1` | XS |
| BUG-02 | Supprimer `console.log` actifs | XS |
| BUG-03 | Remplacer faux pourcentages de variation | M |

**Effort total Phase 1 : ~1 jour**

---

### 🟠 Phase 2 & 3 — Important (à planifier dans les 2 prochains sprints)

| ID | Titre | Effort |
|---|---|---|
| INT-01 | Transaction `createAgentMessage` | M |
| INT-02 | Transaction `createAgentMediaMessage` | M |
| INT-03 | Transaction `assignConversationInternal` | S |
| INT-04 | Corriger sérialisation erreurs `NotFoundException` | XS |
| INT-05 | Typer `createInternalMessage` | S |
| ARCH-01 | Découper `WhatsappMessageGateway` | XL |
| ARCH-02 | Éliminer `forwardRef` injustifiés via EventEmitter2 | L |
| ARCH-03 | Pattern Strategy dans `channel.service.ts create()` | L |
| PERF-01 | Index sur `WhatsappChat.channel_id` | S |
| PERF-02 | Corriger chargement eager messages dans `findOne` | S |
| FRONT-01 | Typer `payload: any` WebSocketEvents | M |
| FRONT-02 | Corriger deps `useEffect` SocketProvider | S |
| TEST-01 | Tests `whatsapp_message.service.ts` | XL |
| TEST-02 | Tests `whatsapp_message.gateway.ts` | XL |

**Effort total Phase 2 & 3 : ~6-8 jours**

---

### 🟡 Phase 4-7 — Souhaitable (backlog à traiter progressivement)

| ID | Titre | Effort |
|---|---|---|
| ARCH-04 | Nettoyer `AppModule.forFeature` | S |
| ARCH-05 | Supprimer `TasksService` mort | XS |
| ARCH-06 | Renommer dossier `communication_whapi` | S |
| CLEAN-01 à CLEAN-09 | Nettoyage code, typos, imports, logs | XS chacun |
| PERF-03 | Lock distribué pour crons multi-instance | L |
| PERF-04 | Purge Maps de mutexes | S |
| PERF-05 | Implémenter `stopAgentSlaMonitor` | S |
| TEST-03 à TEST-05 | Tests notification, auth, system-alert | M chacun |
| FRONT-03 | Mutualiser `dateUtils.ts` | M |
| FRONT-04 | Découper composants > 600 lignes | XL |
| FRONT-05 | Archivage contact par socket | M |

**Effort total Phase 4-7 : ~5-7 jours**

---

## TOTAL ESTIMÉ

| Phase | Items | Effort estimé |
|---|---|---|
| Phase 1 — Critique | 6 | ~1 jour |
| Phase 2 — Intégrité données | 5 | ~2 jours |
| Phase 3 — Architecture | 6 | ~4 jours |
| Phase 4 — Qualité/Nettoyage | 9 | ~1 jour |
| Phase 5 — Performance | 5 | ~2 jours |
| Phase 6 — Tests | 5 | ~4 jours |
| Phase 7 — Frontend/UX | 5 | ~3 jours |
| **TOTAL** | **41 items** | **~17 jours** |

> Les estimations sont indicatives. Les items XL (ARCH-01, TEST-01, TEST-02, FRONT-04) sont les plus incertains et doivent être affinés avant planification.

---

*Cahier des charges généré le 2026-04-09 — basé sur le bilan `BILAN_CODE.md`.*
