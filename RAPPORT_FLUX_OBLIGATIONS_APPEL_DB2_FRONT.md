# Rapport complet - flux obligations d'appel DB2 vers front commercial

Date : 2026-05-09

## 1. Objectif du rapport

Ce rapport decrit le flux complet qui transforme un appel present dans `DB2.call_logs` en compteur visible dans le front commercial :

- `Annulees 0/5`
- `Livrees 0/5`
- `Sans cmd 0/5`
- `Qualite messages : repondez aux clients du bloc actif`

Il explique aussi les points ou le flux peut se casser et pourquoi l'interface peut rester a `0/5` meme apres une correction du code.

## 2. Vue d'ensemble du flux

Flux nominal attendu :

```text
DB2.call_logs
  -> OrderCallSyncJob toutes les 30 secondes
  -> OrderCallSyncService.syncNewCalls()
  -> insertion / backfill dans DB1.call_event
  -> decouverte du device dans DB1.call_device
  -> eligibilite obligation
  -> resolution du poste via local_number ou device_id
  -> CallObligationService.tryMatchCallToTask()
  -> mise a jour call_task + commercial_obligation_batch
  -> GET /call-obligations/mine
  -> front ObligationProgressBar
```

Le front commercial ne calcule pas les compteurs. Il affiche uniquement le statut renvoye par le backend.

Reference front :

- `front/src/components/sidebar/ObligationProgressBar.tsx:23`
- `front/src/components/sidebar/ObligationProgressBar.tsx:46`
- `front/src/components/sidebar/ObligationProgressBar.tsx:81`

## 3. Source DB2 : table `call_logs`

La table DB2 lue par le backend est mappee par :

`message_whatsapp/src/order-read/entities/order-call-log.entity.ts`

Champs importants :

| Champ DB2 | Role |
|---|---|
| `id` | identifiant externe de l'appel |
| `device_id` | identifiant du telephone physique |
| `call_type` | type d'appel, ex. `OUTGOING` / `outgoing` |
| `local_number` | numero local du commercial, peut etre absent |
| `remote_number` | numero du client |
| `duration` | duree brute de l'appel |
| `call_timestamp` | date de l'appel |

Dans votre cas metier, le champ important est `device_id`, car `local_number` n'est pas renseigne pour les appels passes par les commerciaux.

## 4. Job de synchronisation DB2 -> DB1

Le job principal est :

`message_whatsapp/src/order-call-sync/order-call-sync.job.ts`

Il tourne toutes les 30 secondes :

```ts
@Cron('*/30 * * * * *')
async run(): Promise<void>
```

Il lance :

```ts
syncCommercialMapping()
syncClientMapping()
syncNewCalls()
```

Donc, pour que le front bouge, il faut que :

1. le backend soit redemarre avec le dernier code ;
2. la connexion DB2 soit disponible ;
3. le cron tourne ;
4. `syncNewCalls()` lise des appels recents ou rattrapes par le lookback ;
5. les appels soient matchables a un poste.

## 5. Lecture des appels DB2

Dans `syncNewCalls()`, le backend lit DB2 avec :

```ts
WHERE c.call_timestamp >= :lookbackSince
ORDER BY c.call_timestamp ASC, c.id ASC
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:98`

Le curseur est global. Si les appels ont deja ete depasses par le curseur avant la correction, ils peuvent ne pas repasser dans le flux temps reel. Dans ce cas, il faut utiliser le retry historique depuis `call_event`.

Point important : le flux temps reel ne relit pas toute la table DB2 a chaque fois. Il lit depuis le curseur avec une fenetre de tolerance.

## 6. Resolution du commercial et du poste

### 6.1 Resolution par `local_number`

Premiere resolution :

```ts
local_number -> WhatsappCommercial.phone -> commercial DB1
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:124`

Si `local_number` est absent, cette resolution echoue.

### 6.2 Resolution par `device_id`

Deuxieme resolution :

```text
call_logs.device_id
  -> call_device.device_id
  -> call_device.poste_id
  -> commercial connecte sur ce poste
```

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:135`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:141`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:151`

Cette partie correspond a votre regle metier : plusieurs commerciaux peuvent partager un meme poste, mais ils ne viennent pas travailler ensemble le meme jour. Donc le commercial connecte au poste peut etre considere comme l'utilisateur du telephone/device ce jour-la.

Conditions indispensables :

- le `device_id` existe dans DB2 ;
- le meme `device_id` existe dans DB1 `call_device` ;
- `call_device.poste_id` est renseigne ;
- le commercial du jour est rattache a ce poste ;
- idealement, le commercial est connecte au moment de la sync.

Si `call_device.poste_id` est vide, le systeme ne peut pas rattacher l'appel a un poste. Les compteurs restent donc a zero.

## 7. Ingestion dans `call_event`

Chaque appel lu depuis DB2 est insere dans DB1 `call_event`.

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:170`
- `message_whatsapp/src/window/services/call-event.service.ts:181`

Champs stockes :

- `external_id`
- `commercial_phone`
- `commercial_id`
- `attribution_source`
- `client_phone`
- `call_status`
- `duration_seconds`
- `event_at`
- `device_id`

Point positif : dans le code actuel, `duration_seconds` est normalise avant insertion :

```ts
durationSeconds: this.normalizeDuration(call.duration)
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:176`

Le systeme distingue aussi la source d'attribution :

- `phone`
- `device_poste`
- `null`

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:164`

## 8. Decouverte et association des devices

Si `call.deviceId` existe, le systeme fait un upsert dans `call_device`.

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:182`

Cette table sert d'annuaire :

```text
device_id -> poste_id
```

Le front admin contient un ecran pour associer les devices aux postes :

`admin/src/app/ui/CallDevicesView.tsx`

Si les devices sont detectes mais non associes, les appels ne peuvent pas alimenter les obligations du poste.

## 9. Eligibilite obligation

La correction importante est presente dans le code actuel.

Avant, le systeme exigeait `local_number`. Maintenant il accepte :

```ts
call.callType.toLowerCase() === ORDER_CALL_TYPE_OUTGOING &&
(Boolean(call.localNumber) || Boolean(call.deviceId))
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:370`

Cela corrige le manque initial : un appel sortant sans `local_number` mais avec `device_id` peut maintenant passer au matching.

Mais attention : etre eligible ne veut pas dire etre compte. Apres cette etape, l'appel peut encore etre rejete.

## 10. Matching obligation

Le matching appelle :

```ts
CallObligationService.tryMatchCallToTask()
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:395`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:158`

Le poste est resolu par :

1. `posteId` deja fourni via `device_id -> call_device.poste_id` ;
2. sinon `commercialPhone -> commercial -> poste`.

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:384`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:180`

Pour les appels sans `local_number`, le chemin attendu est donc :

```text
call.deviceId
  -> call_device.poste_id
  -> posteId transmis a tryMatchCallToTask()
```

## 11. Conditions pour qu'un appel soit compte

Dans `tryMatchCallToTask()`, l'appel est compte uniquement si toutes les conditions suivantes passent.

### 11.1 Feature flag actif

```ts
FF_CALL_OBLIGATIONS_ENABLED === 'true'
```

Si le flag est faux, resultat :

```text
matched: false, reason: feature_disabled
```

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:168`

### 11.2 Duree suffisante

Regle metier normale :

```text
duration_seconds >= 90
```

Sinon :

```text
reason = duree_insuffisante
```

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:174`

### 11.3 Poste trouve

Si aucun poste n'est trouve :

```text
reason = poste_introuvable
```

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:185`

C'est une cause tres probable si les compteurs restent a `0/5` :

- device detecte mais non associe ;
- commercial non connecte ;
- commercial rattache a un autre poste ;
- front connecte avec un commercial dont le poste n'est pas celui du device.

### 11.4 Batch actif existant

Si aucun batch actif n'existe pour le poste :

```text
reason = aucun_batch_actif
```

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:201`

### 11.5 Appel pas deja utilise

Si l'appel a deja valide une tache :

```text
reason = appel_deja_traite
```

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:208`

### 11.6 Quota categorie disponible

Si les 5 taches de la categorie sont deja faites :

```text
reason = quota_categorie_atteint
```

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:217`

## 12. Determination de la categorie affichee

Les trois compteurs front correspondent aux categories internes :

| Front | Backend |
|---|---|
| Annulees | `COMMANDE_ANNULEE` |
| Livrees | `COMMANDE_AVEC_LIVRAISON` |
| Sans cmd | `JAMAIS_COMMANDE` |

Le backend resout la categorie depuis DB2 :

```text
remote_number
  -> DB2 users client
  -> derniere commande
  -> statut commande / livraison / annulation
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:405`

Regles principales :

- commande annulee ou retour : `COMMANDE_ANNULEE`
- commande livree : `COMMANDE_AVEC_LIVRAISON`
- pas de commande : `JAMAIS_COMMANDE`

Si le client n'est pas trouve, le systeme met par defaut dans `JAMAIS_COMMANDE`.

## 13. Mise a jour des compteurs DB1

Quand un appel matche :

1. une ligne `call_task` passe de `PENDING` a `DONE` ;
2. `call_task.call_event_id` recoit l'ID de l'appel ;
3. `commercial_obligation_batch.annulee_done`, `livree_done` ou `sans_commande_done` est incremente ;
4. si les 15 appels sont faits, le batch peut passer `COMPLETE`.

References :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:226`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:234`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:239`

Les valeurs affichees dans le front viennent directement des compteurs du batch.

## 14. Endpoint lu par le front commercial

Le front appelle :

```http
GET /call-obligations/mine
```

Reference :

- `front/src/components/sidebar/ObligationProgressBar.tsx:23`

Le backend fait :

```text
commercial connecte
  -> commercial.poste.id
  -> getStatus(poste.id)
```

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.controller.ts:28`

Donc le front affiche le batch du poste rattache au commercial connecte, pas forcement le poste du device si les rattachements sont incoherents.

Si le commercial connecte n'a pas le meme poste que `call_device.poste_id`, alors :

- les appels peuvent eventuellement alimenter un autre poste ;
- le front de ce commercial reste a `0/5`.

## 15. Message "Qualite messages : repondez aux clients du bloc actif"

Ce message est separe des compteurs d'appel.

Il vient de :

```text
qualityCheckPassed = false
```

Le controle qualite verifie les conversations du bloc actif du poste :

- `window_status = ACTIVE`
- `window_slot IS NOT NULL`
- le dernier message commercial doit etre posterieur ou egal au dernier message client.

Reference :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:256`

Donc meme si les appels passent de `0/5` a `5/5`, la rotation peut rester bloquee tant que la qualite messages est fausse.

Mais le message qualite n'explique pas a lui seul les compteurs `0/5`. Ce sont deux conditions differentes.

## 16. Pourquoi l'interface peut encore rester a 0/5

Voici les causes probables, classees par priorite.

### Cause 1 - Les devices ne sont pas associes a un poste

Symptome :

- `call_event.device_id` existe ;
- `call_device.device_id` existe ;
- `call_device.poste_id` est `NULL` ;
- obligations rejetees par `poste_introuvable`.

Impact :

- aucun compteur ne bouge.

Action :

- aller dans l'admin, ecran des appareils telephoniques ;
- associer chaque `device_id` au bon poste ;
- relancer `retry-obligations`.

### Cause 2 - Le commercial connecte n'est pas rattache au meme poste que le device

Symptome :

- le device est associe a `poste-A` ;
- le commercial connecte lit `/call-obligations/mine` pour `poste-B`.

Impact :

- les appels peuvent etre comptes sur un autre batch ;
- l'utilisateur voit toujours `0/5`.

Action :

- verifier `WhatsappCommercial.poste_id` ;
- verifier `call_device.poste_id` ;
- verifier le poste de la session commerciale connectee.

### Cause 3 - Les appels historiques n'ont pas ete rejoues

Si les appels ont ete ingeres avant la correction, ils peuvent etre dans `call_event` mais ne pas avoir valide de tache.

Action :

1. executer les migrations ;
2. redemarrer le backend ;
3. lancer :

```http
POST /admin/order-sync/backfill-device-ids
POST /admin/order-sync/backfill-durations
POST /admin/order-sync/normalize-call-status
POST /admin/order-sync/retry-obligations
```

Reference endpoints :

- `message_whatsapp/src/order-call-sync/order-sync-admin.controller.ts`

### Cause 4 - Feature flag des obligations desactive

Si `FF_CALL_OBLIGATIONS_ENABLED` n'est pas `true`, rien ne sera compte.

Action SQL :

```sql
SELECT `key`, value
FROM system_config
WHERE `key` = 'FF_CALL_OBLIGATIONS_ENABLED';
```

La valeur doit etre exactement :

```text
true
```

### Cause 5 - Aucun batch actif pour le poste

Si aucun batch `PENDING` n'existe pour le poste du commercial, le front peut ne rien afficher ou afficher un ancien etat selon le contexte.

Action :

```http
POST /admin/order-sync/init-batches
```

### Cause 6 - Les appels sont rejetes pour duree insuffisante

En flux temps reel, le service exige normalement 90 secondes.

Action :

- verifier `DB2.call_logs.duration` ;
- verifier `DB1.call_event.duration_seconds`.

### Cause 7 - Les appels sont deja marques comme traites dans `integration_sync_log`

Le code evite les doublons :

```ts
existsAnyForEntity('call_validation', call.id)
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:223`

Si un appel a deja un log `failed` ou `success`, il peut etre ignore en flux temps reel. Le retry historique se base plutot sur l'absence de `success`.

### Cause 8 - Le backend en execution n'est pas le dernier code

Si le backend n'a pas ete redemarre apres la correction, l'ancien code peut toujours tourner et continuer a exiger `local_number`.

Action :

- redemarrer `message_whatsapp` ;
- verifier les logs au demarrage ;
- relancer sync/retry.

## 17. Points techniques a corriger ou surveiller dans le code actuel

### 17.1 Duree brute utilisee dans le matching temps reel

Le code insere une duree normalisee dans `call_event` :

```ts
durationSeconds: this.normalizeDuration(call.duration)
```

Mais dans `matchObligation()`, il transmet encore la duree brute :

```ts
durationSeconds: call.duration
```

Reference :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:397`

Correction recommandee :

```ts
durationSeconds: this.normalizeDuration(call.duration)
```

Pourquoi c'est important :

- si DB2 envoie `120000` millisecondes, le matching croit voir `120000` secondes ;
- si DB2 envoie des formats mixtes, les decisions de duree deviennent incoherentes.

### 17.2 Retry historique avec `skipDurationCheck: true`

Le retry actuel utilise :

```ts
minDurationSeconds: 0
skipDurationCheck: true
```

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:467`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:503`

Cela peut permettre de rattraper des appels historiques avec `duration_seconds = 0`, mais cela contourne la regle metier `>= 90s`.

Risque :

- des appels trop courts peuvent valider les obligations.

Recommandation :

- utiliser `backfill-durations` avant `retry-obligations` ;
- remettre le retry sur `minDurationSeconds: 90` quand les durees historiques sont corrigees ;
- ne garder `skipDurationCheck` que pour une operation admin exceptionnelle et tracee.

## 18. Requetes SQL de diagnostic

### 18.1 Feature flag

```sql
SELECT `key`, value
FROM system_config
WHERE `key` = 'FF_CALL_OBLIGATIONS_ENABLED';
```

### 18.2 Statut global des appels ingeres

```sql
SELECT
  COUNT(*) AS total,
  SUM(call_status = 'outgoing') AS outgoing,
  SUM(call_status = 'outgoing' AND duration_seconds >= 90) AS outgoing_90,
  SUM(call_status = 'outgoing' AND device_id IS NOT NULL AND device_id != '') AS outgoing_device,
  SUM(call_status = 'outgoing' AND commercial_id IS NOT NULL) AS outgoing_commercial
FROM call_event;
```

### 18.3 Appels sortants avec device mais non rattaches a un poste

```sql
SELECT
  e.external_id,
  e.device_id,
  e.commercial_id,
  e.client_phone,
  e.call_status,
  e.duration_seconds,
  e.event_at,
  cd.poste_id
FROM call_event e
LEFT JOIN call_device cd ON cd.device_id = e.device_id
WHERE e.call_status = 'outgoing'
  AND e.device_id IS NOT NULL
  AND e.device_id != ''
  AND (cd.poste_id IS NULL OR cd.poste_id = '')
ORDER BY e.event_at DESC
LIMIT 100;
```

### 18.4 Devices detectes et association poste

```sql
SELECT device_id, poste_id, label, call_count, first_seen, last_seen
FROM call_device
ORDER BY last_seen DESC;
```

### 18.5 Batch actif par poste

```sql
SELECT
  id,
  poste_id,
  batch_number,
  status,
  annulee_done,
  livree_done,
  sans_commande_done,
  quality_check_passed,
  created_at
FROM commercial_obligation_batch
WHERE status = 'pending'
ORDER BY created_at DESC;
```

### 18.6 Taches du batch actif

```sql
SELECT
  b.poste_id,
  b.batch_number,
  t.category,
  t.status,
  COUNT(*) AS total
FROM commercial_obligation_batch b
JOIN call_task t ON t.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.poste_id, b.batch_number, t.category, t.status
ORDER BY b.poste_id, t.category, t.status;
```

### 18.7 Derniers rejets de validation

```sql
SELECT entity_id, status, error_message, business_rejection, created_at, updated_at
FROM integration_sync_log
WHERE entity_type = 'call_validation'
ORDER BY created_at DESC
LIMIT 100;
```

### 18.8 Verifier si le front lit le bon poste

```sql
SELECT id, name, phone, is_connected, poste_id
FROM whatsapp_commercial
WHERE deleted_at IS NULL
ORDER BY is_connected DESC, name ASC;
```

Comparer `whatsapp_commercial.poste_id` avec `call_device.poste_id`.

## 19. Procedure de remise en etat recommandee

Ordre recommande :

1. Deployer le dernier code.
2. Executer les migrations DB1.
3. Redemarrer le backend `message_whatsapp`.
4. Verifier `FF_CALL_OBLIGATIONS_ENABLED = true`.
5. Ouvrir l'admin et associer tous les `call_device.device_id` aux bons postes.
6. Verifier que le commercial connecte est rattache au meme poste que le device.
7. Lancer :

```http
POST /admin/order-sync/normalize-call-status
POST /admin/order-sync/backfill-device-ids
POST /admin/order-sync/backfill-durations
POST /admin/order-sync/init-batches
POST /admin/order-sync/retry-obligations
```

8. Recharger le front commercial ou attendre le polling de 60 secondes.

## 20. Conclusion

Le flux attendu est maintenant compatible avec votre besoin `device_id` : un appel sans `local_number` peut devenir eligible si `device_id` est present.

Si l'interface reste a :

```text
Annulees 0/5
Livrees 0/5
Sans cmd 0/5
```

alors le probleme n'est probablement plus le filtre initial `local_number`, mais l'une des ruptures suivantes :

- `device_id` non associe a un poste ;
- commercial connecte rattache a un autre poste que le device ;
- appels historiques non rejoues par `retry-obligations` ;
- feature flag desactive ;
- aucun batch actif ;
- backend non redemarre ;
- logs `call_validation` existants qui empechent le retraitement temps reel.

Le message :

```text
Qualite messages : repondez aux clients du bloc actif
```

est un blocage complementaire lie aux conversations du bloc actif. Il doit etre traite, mais il n'explique pas directement les compteurs d'appels a `0/5`.

