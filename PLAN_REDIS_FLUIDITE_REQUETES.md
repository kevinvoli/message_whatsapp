# Plan d'implementation Redis - Fluidite des requetes

**Projet :** WhatsApp Platform  
**Date :** 2026-05-07  
**Objectif :** rendre les requetes plus fluides, reduire les temps de reponse, eviter les blocages en charge et fiabiliser les traitements asynchrones.

---

## 1. Diagnostic synthetique

Le projet utilise deja Redis pour trois usages utiles :

- BullMQ : webhooks entrants, broadcasts, analyse de sentiment.
- Cache applicatif : resolution de contexte canal et permissions RBAC.
- Coordination : Redlock pour certaines rotations de fenetre.

Cette base est saine, mais Redis est encore utilise comme une ressource unique pour des usages differents. Le point le plus sensible est la configuration Docker actuelle : Redis a une politique `allkeys-lru`, alors qu'il contient aussi les cles BullMQ. En cas de pression memoire, Redis peut evincer des cles de queue, ce qui peut degrader ou casser le traitement des jobs.

Autre limite importante : plusieurs mecanismes restent en memoire locale. Cela fonctionne en mono-instance, mais devient fragile avec plusieurs backends :

- rate limiting WebSocket ;
- rate limiting webhook ;
- anti-doublons d'envoi agent ;
- mutex de la queue dispatcher ;
- retries de webhooks sortants avec `setTimeout`.

Le plan ci-dessous vise donc deux resultats : fluidifier les requetes utilisateur et stabiliser le traitement en arriere-plan.

---

## 2. Principes d'architecture

### 2.1 Garder MySQL comme source de verite

Redis ne doit pas remplacer MySQL pour les donnees metier durables :

- messages ;
- conversations ;
- rapports ;
- roles ;
- utilisateurs ;
- logs critiques ;
- etats de broadcast.

Redis doit servir pour les donnees temporaires, les compteurs, les verrous, les files de jobs, les caches courts et les evenements temps reel.

### 2.2 Separer les usages Redis

Objectif cible :

```text
Redis queues
  - BullMQ webhooks
  - BullMQ broadcasts
  - BullMQ sentiment
  - BullMQ outbound webhooks
  - BullMQ flowbot delayed jobs

Redis cache
  - contexte canal
  - RBAC
  - system_config
  - channels/templates
  - metriques dashboard

Redis realtime/coordination
  - Socket.IO adapter
  - rate limits distribues
  - locks distribues
  - presence agents
  - idempotence courte
```

En production, idealement utiliser des instances Redis separees. A defaut, utiliser des prefixes explicites et une configuration memoire qui ne met pas BullMQ en danger.

### 2.3 Dimensionner les connexions Redis

BullMQ ouvre plusieurs connexions Redis par queue selon les usages : producer, worker, events, scheduler/stalled checks selon la configuration. Avec les queues existantes et prevues, il faut mesurer le nombre reel de connexions au lieu de supposer que Redis sera toujours large.

Estimation de depart :

```text
Queues BullMQ actuelles:
  - webhook-processing
  - broadcast-sending
  - sentiment-analysis

Queues BullMQ prevues:
  - outbound-webhook-delivery
  - flowbot-delayed
  - dead-letter

Ordre de grandeur:
  - 3 connexions environ par queue active
  - 2 connexions pour Socket.IO Redis adapter
  - 1+ connexion pour cache applicatif
  - 1+ connexion pour locks/presence/rate limits
```

Actions :

- exposer `redis.connected_clients` dans le healthcheck ;
- suivre `redis.blocked_clients`, `redis.rejected_connections` et `redis.maxclients` ;
- logger au demarrage les queues BullMQ enregistrees ;
- eviter de creer des clients Redis a la demande dans les hot paths ;
- preferer des clients dedies par responsabilite, mais stables et reutilises.

Seuils d'alerte proposes :

```text
connected_clients > 500         warning en petite prod
connected_clients > 2000        audit obligatoire
rejected_connections > 0        incident
blocked_clients > 0             investigation
```

Impact attendu :

- pas de saturation silencieuse Redis ;
- meilleure capacite a prevoir la montee en charge ;
- separation plus propre entre cache, queues, pub/sub et locks.

### 2.4 Prevoir le rollback des changements Redis

Chaque migration vers Redis doit avoir un chemin de retour explicite. La graceful degradation existante est utile, mais elle ne suffit pas pour tous les cas : un rate limiter casse peut bloquer les utilisateurs, un anti-doublon casse peut empecher les envois, un adapter Socket.IO casse peut couper le temps reel.

Regle d'implementation :

- chaque nouveau mecanisme Redis critique doit etre active par feature flag ;
- chaque feature flag doit avoir un fallback memoire ou DB clairement documente ;
- chaque sprint doit inclure une procedure de rollback ;
- chaque deploiement doit verifier les metriques Redis avant et apres activation.

Variables proposees :

```env
REDIS_SOCKET_THROTTLE_ENABLED=false
REDIS_WEBHOOK_RATE_LIMIT_ENABLED=false
REDIS_SEND_DEDUPE_ENABLED=false
REDIS_PRESENCE_ENABLED=false
BULLMQ_OUTBOUND_WEBHOOK_ENABLED=false
```

---

## 3. Priorite P0 - Corrections immediates

### P0.1 Corriger la politique memoire Redis

**Fichier :** `docker-compose.yml`

Probleme :

```text
--maxmemory-policy allkeys-lru
```

Cette politique peut supprimer des cles BullMQ. Pour un Redis qui contient des queues, c'est dangereux.

Correction recommandee a court terme :

```text
--maxmemory-policy noeviction
```

Ou meilleure option :

- Redis A pour BullMQ avec `noeviction`.
- Redis B pour cache avec `allkeys-lru` ou `volatile-lru`.

Impact attendu :

- moins de risque de jobs perdus ;
- comportement plus previsible sous charge ;
- meilleure fiabilite des webhooks et broadcasts.

### P0.2 Ajouter des prefixes Redis par usage

**Fichiers :**

- `message_whatsapp/src/redis/redis.module.ts`
- `message_whatsapp/src/queue/queue.module.ts`
- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Variables proposees :

```env
REDIS_KEY_PREFIX=whatsapp:prod:
BULLMQ_PREFIX=whatsapp:prod:bull
SOCKET_IO_REDIS_PREFIX=whatsapp:prod:socket
```

But :

- eviter les collisions entre local, staging et production ;
- faciliter le debug avec `SCAN`;
- preparer une separation future des usages.

### P0.3 Securiser Redis

Actions :

- retirer l'exposition publique de `6379` si elle n'est pas necessaire ;
- ajouter `REDIS_PASSWORD` en production ;
- configurer Redis avec `--requirepass`;
- verifier que seuls les containers internes peuvent joindre Redis.

Impact attendu :

- reduction du risque de fuite ou suppression de donnees Redis ;
- meilleure securite avant montee en charge.

### P0.4 Superviser memoire et connexions Redis

Le passage a `noeviction` protege BullMQ, mais il transforme la pression memoire en erreurs d'ecriture. C'est preferable a une perte silencieuse de jobs, mais cela exige un monitoring minimal.

Metriques obligatoires :

```text
INFO memory:
  - used_memory_human
  - maxmemory
  - maxmemory_policy
  - mem_fragmentation_ratio

INFO clients:
  - connected_clients
  - blocked_clients
  - maxclients

INFO stats:
  - rejected_connections
  - evicted_keys
  - expired_keys
```

Regles :

- `evicted_keys` doit rester a 0 sur Redis queues ;
- `rejected_connections` doit rester a 0 ;
- alerter si `used_memory / maxmemory > 80%` ;
- alerter si `connected_clients` augmente sans redescendre apres un redeploiement.

Impact attendu :

- detection rapide des fuites de connexions ;
- detection rapide d'un Redis sous-dimensionne ;
- meilleure securite apres le passage a `noeviction`.

---

## 4. Priorite P1 - Fluidite des requetes temps reel

### P1.1 Passer le rate limiting WebSocket dans Redis

**Fichier actuel :** `message_whatsapp/src/whatsapp_message/guards/socket-throttle.guard.ts`

Probleme actuel :

- les compteurs sont en memoire locale ;
- en multi-instance, chaque instance donne son propre quota ;
- les requetes socket peuvent contourner les limites selon l'instance touchee.

Implementation cible :

```text
Key: throttle:socket:{commercialId}:{event}
TTL: fenetre de limitation, ex: 10s
Operation: INCR + EXPIRE
```

Exemples :

```text
throttle:socket:commercial-123:message:send
throttle:socket:commercial-123:messages:get
throttle:socket:commercial-123:conversations:get
```

Impact attendu :

- moins de pics sur la base ;
- limitation coherente en multi-instance ;
- meilleure fluidite pour les utilisateurs normaux.

### P1.2 Passer le rate limiting webhook dans Redis

**Fichier actuel :** `message_whatsapp/src/whapi/webhook-rate-limit.service.ts`

Probleme actuel :

- les quotas global, provider, IP et tenant sont en memoire ;
- les compteurs disparaissent au redemarrage ;
- les quotas ne sont pas partages entre instances.

Implementation cible :

```text
rate:webhook:global
rate:webhook:provider:{provider}
rate:webhook:ip:{ip}
rate:webhook:tenant:{tenantId}
```

Impact attendu :

- absorption plus stable des pics de webhooks ;
- protection plus fiable contre les floods ;
- reduction des traitements inutiles.

### P1.3 Centraliser l'anti-doublon d'envoi agent dans Redis

**Fichier actuel :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Probleme actuel :

- `recentTempIds` et `pendingAgentMessages` sont en memoire ;
- en multi-instance, un doublon peut passer si deux requetes arrivent sur deux backends differents.

Implementation cible :

```text
dedupe:send:temp:{tempId}                 TTL 30s
dedupe:send:text:{chatId}:{hash(text)}    TTL 5s
```

Commande Redis :

```text
SET key value NX EX ttl
```

Impact attendu :

- moins de messages doubles ;
- moins d'appels provider inutiles ;
- experience agent plus stable.

Note :

- `tempId` doit avoir un TTL plus long que la latence maximale raisonnable de l'envoi provider ;
- le dedupe texte doit rester court pour ne pas empecher un agent de renvoyer volontairement le meme message apres quelques secondes ;
- en cas d'erreur Redis, revenir au mecanisme memoire actuel.

### P1.4 Valider proprement l'adapter Socket.IO Redis

**Fichier actuel :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Probleme actuel :

- l'adapter Redis est configure, mais les clients dupliques ne sont pas explicitement connectes ni attendus ;
- il manque une metrique claire pour savoir si le mode cross-instance est actif.

Correction :

- creer deux clients Redis dedies `pubClient` et `subClient` ;
- appeler `connect()` si necessaire ;
- attendre `ready` ;
- logger un statut explicite ;
- exposer ce statut dans `/system-health`.

Impact attendu :

- evenements temps reel coherents avec plusieurs backends ;
- diagnostic plus facile en production.

---

## 5. Priorite P2 - Deplacer les traitements lents hors requete

### P2.1 Migrer les webhooks sortants vers BullMQ

**Fichier actuel :** `message_whatsapp/src/outbound-webhook/outbound-webhook.service.ts`

Probleme actuel :

- `deliverWithRetry` utilise `setTimeout`;
- les retries sont perdus si le process redemarre ;
- le traitement occupe le process applicatif au lieu d'une queue controlee.

Implementation cible :

```text
Queue: outbound-webhook-delivery
Job: deliver
Attempts: max_retries
Backoff: exponential
RemoveOnComplete: count/age
RemoveOnFail: count/age
```

Impact attendu :

- requetes metier plus rapides ;
- retries fiables ;
- monitoring des echecs ;
- replay manuel plus simple.

Rollback :

- garder temporairement l'ancien chemin `setTimeout` derriere un feature flag ;
- activer BullMQ d'abord sur un tenant pilote ;
- si backlog ou erreurs anormales, repasser `BULLMQ_OUTBOUND_WEBHOOK_ENABLED=false`.

Priorite :

Cette migration doit etre traitee des le Sprint 2. Les retries en `setTimeout` sont un bug de production potentiel, car ils disparaissent au redemarrage du process.

### P2.2 Transformer les delais FlowBot en delayed jobs BullMQ

**Fichier actuel :** `message_whatsapp/src/flowbot/jobs/flow-polling.job.ts`

Probleme actuel :

- plusieurs crons scannent regulierement la base ;
- plus le volume augmente, plus ces scans deviennent couteux ;
- en multi-instance, chaque cron doit etre verrouille.

Implementation cible :

```text
Queue: flowbot-delayed
Jobs:
  - resume-waiting-delay
  - no-response-check
  - queue-wait-check
  - inactivity-check
```

Quand une session entre en attente, creer directement un job delayed avec l'heure de reprise.

Impact attendu :

- moins de scans SQL periodiques ;
- reprise plus precise ;
- meilleure fluidite globale pendant les pics.

### P2.3 Ajouter une Dead Letter Queue

Queues concernees :

- `webhook-processing`
- `broadcast-sending`
- `sentiment-analysis`
- `outbound-webhook-delivery`
- `flowbot-delayed`

But :

- conserver les jobs definitivement echoues ;
- permettre un replay manuel ;
- eviter les pannes silencieuses.

Implementation :

```text
Queue: dead-letter
Payload:
  - originalQueue
  - originalJobId
  - payload
  - error
  - failedAt
  - attemptsMade
```

### P2.4 Graceful shutdown des workers BullMQ

Probleme :

Lorsqu'un container recoit `SIGTERM`, un job actif peut etre interrompu. BullMQ relancera ensuite le job stalled, mais le traitement peut avoir deja produit des effets partiels : message envoye mais compteur non mis a jour, compteur incremente mais envoi incomplet, webhook externe livre mais log pas finalise.

Objectif :

- arreter proprement les workers ;
- laisser les jobs actifs finir pendant une fenetre limitee ;
- eviter de prendre de nouveaux jobs pendant l'arret ;
- rendre les jobs idempotents quand un retry est possible.

Actions :

- implementer `OnApplicationShutdown` sur les workers ou un service d'orchestration ;
- appeler `worker.close()` pour chaque worker BullMQ ;
- definir un timeout de shutdown inferieur au grace period Docker/Kubernetes ;
- rendre les jobs critiques idempotents avec cles Redis ou contraintes DB ;
- logger les jobs encore actifs au moment du shutdown.

Exemple de principe :

```typescript
async onApplicationShutdown(signal?: string): Promise<void> {
  this.logger.log(`Shutdown ${signal ?? 'unknown'}: closing BullMQ workers`);
  await Promise.allSettled([
    this.webhookWorker.close(),
    this.broadcastWorker.close(),
    this.sentimentWorker.close(),
  ]);
}
```

Points d'attention :

- un broadcast doit pouvoir etre rejoue sans doubler les destinataires deja envoyes ;
- un webhook entrant doit avoir une cle d'idempotence provider ;
- un webhook sortant doit avoir une cle de livraison/log stable ;
- un job de sentiment peut etre rejoue sans risque majeur.

---

## 6. Priorite P3 - Caches pour requetes frequentes

### P3.1 Cache system_config

**Service concerne :** `SystemConfigService`

Plusieurs services lisent des parametres systeme comme les quotas et politiques. Ces valeurs changent rarement.

Cache propose :

```text
config:{key} TTL 60s a 300s
```

Invalidation :

- suppression de la cle a chaque update admin ;
- fallback DB si Redis indisponible.

Impact attendu :

- moins de petites requetes repetitives ;
- meilleur temps de reponse des operations de dispatch.

### P3.2 Cache channels et templates WhatsApp

Donnees candidates :

- channel par `channel_id` ;
- channel par provider external id ;
- template par id ;
- dedicated channels par poste.

Exemples de cles :

```text
channel:id:{channelId}
channel:external:{provider}:{externalId}
template:id:{templateId}
poste:dedicated_channels:{posteId}
```

TTL recommande :

- 60s a 300s ;
- invalidation explicite apres modification admin.

Impact attendu :

- moins de requetes SQL dans les webhooks ;
- reduction de latence sur l'envoi message et broadcast.

### P3.3 Cache leger des listes socket

Caches courts possibles :

```text
socket:conversations:{posteId}:{cursorHash} TTL 2s
socket:contacts:{posteId} TTL 10s
queue:positions TTL 3s
```

Attention :

- ne pas cacher trop longtemps les conversations ;
- invalider ou laisser TTL tres court apres message entrant, assignation, fermeture ou lecture.
- ne pas cacher les payloads de conversations si l'invalidation temps reel n'est pas fiable.

Impact attendu :

- meilleure fluidite quand plusieurs clients demandent les memes listes ;
- moins de pression sur MySQL pendant les rafraichissements UI.

---

## 7. Priorite P4 - Coordination multi-instance

### P4.1 Remplacer les mutex locaux critiques par Redlock

**Service prioritaire :** `message_whatsapp/src/dispatcher/services/queue.service.ts`

Operations a proteger :

- `addPosteToQueue`;
- `removeFromQueue`;
- `getNextInQueue`;
- `moveToEnd`;
- `fillQueueWithAllPostes`;
- `syncQueueWithActivePostes`;
- `resetQueueState`.

Exemples de ressources :

```text
lock:dispatcher:queue
lock:dispatcher:poste:{posteId}
```

Impact attendu :

- dispatcher coherent avec plusieurs instances ;
- moins de risques de positions dupliquees ou desynchronisees ;
- distribution de conversations plus fiable.

### P4.2 Locks Redis pour les crons critiques

Tous les crons qui modifient des donnees doivent etre mono-execution en multi-instance.

Candidats :

- rotation fenetre ;
- validation horaire ;
- follow-up reminder ;
- order call sync ;
- flow polling tant qu'il existe ;
- purge outbox.

Pattern :

```text
tryWithLock("cron:{jobName}", ttl, handler)
```

Impact attendu :

- pas de double traitement ;
- moins de charge DB ;
- comportement previsible au scaling horizontal.

### P4.3 Presence agents dans Redis

But :

- connaitre rapidement les agents connectes ;
- synchroniser la presence entre instances ;
- eviter de dependre uniquement de la memoire socket locale.

Cles proposees :

```text
presence:commercial:{commercialId} TTL 45s
presence:poste:{posteId} TTL 45s
presence:tenant:{tenantId}
```

Mettre a jour via heartbeat ou events socket.

Detection d'expiration :

Activer les keyspace notifications Redis pour detecter la disparition des cles de presence :

```text
notify-keyspace-events Ex
```

Puis abonner un client Redis dedie au canal d'expiration :

```text
__keyevent@0__:expired
```

Lorsqu'une cle `presence:commercial:{commercialId}` ou `presence:poste:{posteId}` expire :

- marquer l'agent/poste comme absent dans l'etat applicatif ;
- emettre un evenement temps reel admin si necessaire ;
- declencher une reconciliation douce de la queue dispatcher.

Precautions :

- les keyspace notifications sont locales a une DB Redis et doivent etre activees explicitement ;
- en Redis Cluster, le comportement doit etre valide selon le mode de deploiement ;
- garder un job de reconciliation periodique faible frequence comme filet de securite ;
- ne pas baser une decision financiere ou irreversible uniquement sur une expiration Redis.

Impact attendu :

- meilleure coherence de la queue agent ;
- dashboard admin temps reel plus fiable ;
- reduction des erreurs de dispatch vers agents deconnectes.

---

## 8. Priorite P5 - Monitoring et observabilite

### P5.1 Endpoint Redis health enrichi

**Existant :** `message_whatsapp/src/system-health/system-health.controller.ts`

Ajouter :

- `redis.status`;
- `redis.used_memory_human`;
- `redis.maxmemory`;
- `redis.maxmemory_policy`;
- `redis.connected_clients`;
- `redis.blocked_clients`;
- `redis.rejected_connections`;
- `redis.evicted_keys`;
- `bullmq.queue_counts`;
- statut Socket.IO Redis adapter ;
- latence `PING`.

### P5.2 Endpoint queue stats

Endpoint recommande :

```text
GET /admin/queue-stats
```

Retour :

```json
{
  "webhook-processing": {
    "waiting": 0,
    "active": 0,
    "failed": 0,
    "delayed": 0
  }
}
```

Queues a suivre :

- webhook-processing ;
- broadcast-sending ;
- sentiment-analysis ;
- outbound-webhook-delivery ;
- flowbot-delayed ;
- dead-letter.

### P5.3 Bull Board

Ajouter une interface protegee :

```text
/admin/queues
```

Utilite :

- voir les jobs en attente ;
- rejouer certains jobs ;
- diagnostiquer les erreurs ;
- mesurer le backlog.

---

## 9. Plan d'execution recommande

### Sprint 1 - Stabilisation Redis

1. Changer `allkeys-lru` pour `noeviction` sur le Redis qui porte BullMQ.
2. Ajouter `REDIS_PASSWORD` et retirer l'exposition publique si possible.
3. Ajouter prefixes Redis et BullMQ.
4. Ameliorer l'initialisation Socket.IO Redis adapter.
5. Ajouter endpoint de health Redis enrichi.

Resultat attendu :

- Redis plus sur ;
- queues moins fragiles ;
- meilleure visibilite production.

### Sprint 2 - Fluidite requetes temps reel

1. Creer queue `outbound-webhook-delivery`.
2. Remplacer `setTimeout` de `OutboundWebhookService` par BullMQ.
3. Migrer `SocketThrottleGuard` vers Redis.
4. Migrer `WebhookRateLimitService` vers Redis.
5. Migrer anti-doublon `tempId` et texte vers Redis.
6. Ajouter cache `system_config`.
7. Ajouter cache court `dedicated_channels` par poste.

Resultat attendu :

- moins de requetes SQL repetitives ;
- meilleure resistance aux pics ;
- comportement coherent en multi-instance.
- retries webhooks sortants survivant aux redemarrages.

Rollback :

- desactiver `BULLMQ_OUTBOUND_WEBHOOK_ENABLED` pour revenir au chemin legacy ;
- desactiver les flags Redis throttle/dedupe pour revenir aux protections memoire ;
- conserver les tables/logs existants comme source de verite.

### Sprint 3 - Asynchronisation des traitements lents

1. Ajouter graceful shutdown des workers BullMQ.
2. Ajouter Dead Letter Queue.
3. Ajouter endpoint stats queues.
4. Ajouter Bull Board protege.
5. Ajouter idempotence Redis/DB sur les jobs critiques.

Resultat attendu :

- requetes metier plus rapides ;
- retries fiables ;
- diagnostic des echecs simplifie.
- redeploiements moins risqués pendant les jobs actifs.

Rollback :

- garder les nouveaux workers sans suppression des anciens chemins tant que les metriques ne sont pas stables ;
- desactiver les nouvelles queues non critiques en feature flag ;
- rejouer depuis la DLQ seulement apres verification manuelle.

### Sprint 4 - FlowBot et crons

1. Remplacer progressivement les scans FlowBot par delayed jobs.
2. Proteger les crons restants avec Redlock.
3. Ajouter presence agents Redis.
4. Remplacer les mutex critiques de `QueueService` par Redlock.
5. Activer keyspace notifications pour expiration presence.

Resultat attendu :

- moins de scans DB ;
- meilleur scaling horizontal ;
- queue dispatcher plus fiable.

Rollback :

- garder les crons FlowBot existants desactives par flag, pas supprimes immediatement ;
- si les delayed jobs ont un retard anormal, reactiver les crons ;
- si les keyspace notifications ne sont pas fiables dans l'environnement Redis, revenir a une reconciliation periodique.

### Sprint 5 - Optimisations fines

1. Cache court conversations/contacts socket.
2. Cache templates/channels.
3. Mesurer les endpoints les plus lents.
4. Ajuster TTL selon les metriques reelles.
5. Separer physiquement Redis queues/cache/pubsub si la charge augmente.

Resultat attendu :

- UI plus reactive ;
- charge DB mieux controlee ;
- architecture prete pour plusieurs instances backend.

Rollback :

- tous les caches de listes doivent etre desactivables ;
- si une incoherence UI apparait, baisser les TTL a 0 ou bypasser Redis ;
- garder l'invalidation explicite mais ne jamais la rendre obligatoire pour la correction fonctionnelle.

---

## 10. Ordre de priorite technique

| Priorite | Action | Impact fluidite | Risque si non fait |
|---|---|---:|---:|
| P0 | Corriger politique memoire Redis | Moyen | Tres eleve |
| P0 | Securiser Redis | Faible direct | Tres eleve |
| P1 | Rate limit Redis socket/webhook | Eleve | Eleve |
| P1 | Anti-doublon Redis envoi agent | Moyen | Moyen |
| P1 | Adapter Socket.IO valide | Eleve en multi-instance | Eleve |
| P2 | Outbound webhooks via BullMQ | Moyen | Eleve |
| P2 | Graceful shutdown workers BullMQ | Moyen | Eleve |
| P2 | Dead Letter Queue | Faible direct | Eleve |
| P3 | Cache system_config/channels/templates | Moyen | Moyen |
| P4 | Redlock sur dispatcher/crons | Eleve en multi-instance | Eleve |
| P4 | Presence Redis + keyspace notifications | Moyen | Moyen |
| P5 | Monitoring BullMQ/Redis | Moyen | Eleve |

---

## 11. Definition de done

Le plan sera considere comme reussi quand :

- Redis ne peut plus evincer des cles BullMQ critiques.
- Redis expose memoire, connexions, clients bloques, evictions et connexions rejetees.
- Les rate limits socket et webhook sont coherents entre plusieurs instances.
- Les traitements lents ne bloquent plus les requetes utilisateur.
- Les retries importants survivent aux redemarrages backend.
- Les workers BullMQ s'arretent proprement pendant les redeploiements.
- Les jobs en erreur sont visibles et rejouables.
- Les operations de dispatch critiques sont protegees en multi-instance.
- La presence agents est partagee entre instances et detecte les expirations.
- Les dashboards admin peuvent afficher la sante Redis et BullMQ.
- Les requetes frequentes ont des caches courts avec invalidation claire.

---

## 12. Recommandation finale

La priorite n'est pas de "mettre Redis partout". La priorite est de mettre Redis aux endroits ou il apporte une garantie claire :

- absorber les pics ;
- eviter les doublons ;
- coordonner plusieurs instances ;
- differer les traitements lourds ;
- reduire les lectures SQL repetitives ;
- rendre les pannes visibles.

Pour ce projet, le meilleur retour sur investissement vient d'abord de la securisation Redis/BullMQ, puis des rate limits distribues, puis de la migration des retries et delais vers BullMQ.
