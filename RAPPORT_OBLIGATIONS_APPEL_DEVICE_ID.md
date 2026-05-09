# Rapport - obligations d'appel et attribution par device_id

Date d'analyse : 2026-05-09

## 1. Resume executif

La fonctionnalite d'obligation d'appel existe deja dans le backend et dans le front commercial. Elle repose sur des batches par poste : chaque poste doit valider 15 appels, soit 5 appels par categorie (`COMMANDE_ANNULEE`, `COMMANDE_AVEC_LIVRAISON`, `JAMAIS_COMMANDE`), avec une duree minimale de 90 secondes et un controle qualite des messages du bloc actif.

Le probleme principal constate est le suivant : aujourd'hui, les appels DB2 `call_logs` sans `local_number` ne sont pas eligibles au matching des obligations, meme si `device_id` est present et meme si ce device est associe a un poste. Le code ingere ces appels dans `call_event`, mais il les ignore juste avant `matchObligation()`.

Cause racine directe :

```ts
private isEligibleForObligation(call: OrderCallLog): boolean {
  return call.callType.toLowerCase() === ORDER_CALL_TYPE_OUTGOING && Boolean(call.localNumber);
}
```

Reference : `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:354`

Cette condition bloque exactement votre cas metier : les commerciaux appellent, DB2 enregistre `device_id`, mais `local_number` est vide. L'appel ne passe donc jamais au compteur d'obligations.

## 2. Flux fonctionnel actuel

### 2.1 Creation des obligations

Le service `CallObligationService` cree un batch actif par poste. Chaque batch contient 15 taches :

- 5 appels commandes annulees.
- 5 appels commandes livrees.
- 5 appels sans commande / jamais commande.

References :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:86`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:99`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:113`

Les batches sont initialises au demarrage via `OrderCallSyncJob.onApplicationBootstrap()`, puis la sync DB2 tourne toutes les 30 secondes.

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.job.ts:18`
- `message_whatsapp/src/order-call-sync/order-call-sync.job.ts:34`

### 2.2 Ingestion des appels DB2

La sync lit `call_logs` DB2 via l'entite `OrderCallLog`.

Champs importants :

- `id` : identifiant externe de l'appel.
- `device_id` : identifiant du telephone physique.
- `call_type` : type d'appel.
- `local_number` : numero local du commercial, nullable.
- `remote_number` : numero client.
- `duration` : duree en secondes.
- `call_timestamp` : date de l'appel.

Reference : `message_whatsapp/src/order-read/entities/order-call-log.entity.ts`

Ensuite `syncNewCalls()` insere l'appel dans `call_event` en DB1, y compris `device_id`.

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:164`
- `message_whatsapp/src/window/services/call-event.service.ts:175`

Cette partie est plutot positive : le systeme sait deja transporter `device_id` vers DB1.

### 2.3 Decouverte des devices

Quand un appel contient `device_id`, la sync tente d'alimenter la table `call_device`.

Reference : `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:176`

La table `call_device` contient :

- `device_id`
- `label`
- `poste_id`
- `first_seen`
- `last_seen`
- `call_count`

Reference : `message_whatsapp/src/call-device/entities/call-device.entity.ts`

L'admin dispose aussi d'un ecran pour associer un device a un poste. Le texte de l'interface confirme l'objectif : "Associez chaque appareil a un poste pour activer le fallback device->poste dans le matching des obligations."

Reference : `admin/src/app/ui/CallDevicesView.tsx:90`

### 2.4 Matching des obligations

Le matching appelle `CallObligationService.tryMatchCallToTask()`.

Conditions appliquees :

- feature flag `FF_CALL_OBLIGATIONS_ENABLED` actif.
- duree d'appel >= 90 secondes.
- poste resolu.
- batch actif existant pour ce poste.
- appel non deja utilise.
- quota categorie encore disponible.

References :

- `message_whatsapp/src/call-obligations/call-obligation.service.ts:168`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:172`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:178`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:199`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:206`
- `message_whatsapp/src/call-obligations/call-obligation.service.ts:215`

Si tout passe, une tache est marquee `DONE`, les compteurs du batch sont incrementes, puis le front peut afficher la progression.

Reference : `message_whatsapp/src/call-obligations/call-obligation.service.ts:224`

## 3. Pourquoi les obligations ne sont pas detectees et comptabilisees

### 3.1 Blocage principal : `local_number` est obligatoire pour etre eligible

Dans `syncNewCalls()`, l'appel est bien ingere dans `call_event`, puis le code execute :

```ts
if (!this.isEligibleForObligation(call)) continue;
```

Reference : `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:212`

Or `isEligibleForObligation()` exige :

- `call_type = outgoing`
- ET `local_number` non vide

Reference : `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:354`

Donc si DB2 `call_logs.local_number` est `NULL`, vide, ou absent, l'appel est ignore pour les obligations. Il ne cree pas de log `call_validation`, ne passe pas dans `matchObligation()`, ne valide aucune tache, et n'incremente aucun compteur.

Impact concret :

- `call_event` peut contenir l'appel.
- `call_device` peut decouvrir le device.
- mais `commercial_obligation_batch.*_done` ne bouge pas.
- le front commercial reste a `0/15` ou avec des compteurs incomplets.

### 3.2 Le fallback `device_id -> poste` existe, mais il est place trop tard

Le fallback par device est code dans `matchObligation()` :

```ts
const device = await this.callDeviceRepo.findOne({ where: { deviceId: call.deviceId } });
devicePosteId = device?.posteId ?? null;
```

Reference : `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:365`

Mais ce fallback n'est jamais atteint si `local_number` est absent, parce que `isEligibleForObligation()` coupe le flux avant.

C'est le point le plus important du rapport : l'architecture prevoit deja `device_id`, mais le filtre d'eligibilite conserve une ancienne hypothese metier selon laquelle un appel sortant doit avoir `local_number`.

### 3.3 La pre-resolution `device_id -> commercial connecte` depend de l'association device/poste

Avant l'ingestion, le service construit une map :

`device_id -> poste_id -> commercial connecte`

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:135`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:141`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:151`

Ce mecanisme correspond a votre logique metier : plusieurs commerciaux peuvent partager un poste, mais ils ne travaillent pas le meme jour. Le commercial connecte au poste peut donc recevoir l'attribution des appels du device associe a ce poste.

Conditions pour que cela marche :

- `call_device.device_id` existe.
- `call_device.poste_id` est renseigne.
- le commercial du jour est connecte et rattache a ce poste.
- le poste du commercial dans DB1 est correct.

Si le device n'est pas associe au poste, `commercial_id` reste null dans `call_event`.

### 3.4 Le retry historique est plus proche du comportement voulu, mais il ne compense pas tout

Le job de retry tourne toutes les 5 minutes et scanne `call_event` pour les appels :

- `call_status = outgoing`
- `duration_seconds >= 90`
- `commercial_id IS NOT NULL OR device_id IS NOT NULL`
- sans succes precedent dans `integration_sync_log`

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.job.ts:52`
- `message_whatsapp/src/window/services/call-event.service.ts:45`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:448`

Le retry peut resoudre le poste via :

- `commercial_id -> commercial -> poste`
- ou `device_id -> call_device -> poste`

References :

- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:463`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:472`

Mais limites importantes :

- Il ne s'execute qu'apres ingestion dans `call_event`.
- Il depend de `call_status = outgoing` en minuscules.
- Il depend de `duration_seconds >= 90`.
- Il depend d'un `device_id` present et associe dans `call_device`.
- Il ne rattache pas explicitement l'appel au commercial connecte du poste au moment de l'appel ; il valide surtout le batch du poste.
- Si l'appel a deja ete journalise en succes, il ne sera pas retente.

Le retry peut donc sauver certains appels historiques, mais le flux temps reel reste incorrect tant que `isEligibleForObligation()` exige `local_number`.

## 4. Pourquoi le front commercial ne comptabilise rien

Le composant front commercial ne calcule rien lui-meme. Il lit seulement :

`GET /call-obligations/mine`

Reference : `front/src/components/sidebar/ObligationProgressBar.tsx:23`

Cet endpoint prend le commercial connecte, recupere son poste, puis retourne le statut du batch de ce poste.

References :

- `message_whatsapp/src/call-obligations/call-obligation.controller.ts:28`
- `message_whatsapp/src/call-obligations/call-obligation.controller.ts:33`
- `message_whatsapp/src/call-obligations/call-obligation.controller.ts:34`

Le front affiche ensuite :

- total fait / total requis.
- detail par categorie.
- statut du controle qualite.

References :

- `front/src/components/sidebar/ObligationProgressBar.tsx:46`
- `front/src/components/sidebar/ObligationProgressBar.tsx:65`
- `front/src/components/sidebar/ObligationProgressBar.tsx:81`

Donc si le backend ne marque pas les taches `DONE`, le front ne peut pas afficher les appels comme comptabilises. Le probleme n'est pas dans l'affichage : il est dans l'attribution et l'eligibilite backend.

## 5. Modele cible recommande avec device_id

Votre hypothese metier est coherent avec le systeme :

- Le telephone physique est identifie par `DB2.call_logs.device_id`.
- Ce device est rattache a un poste dans DB1 via `call_device.poste_id`.
- Le commercial connecte au poste ce jour-la est considere comme l'auteur des appels.
- Les commerciaux d'un meme poste ne venant pas travailler ensemble le meme jour, l'ambiguite est faible.

Modele cible :

1. DB2 recoit un appel sortant avec `device_id`, `remote_number`, `duration`, `call_timestamp`, mais sans `local_number`.
2. La sync DB2 ingere l'appel dans `call_event`.
3. Le systeme verifie que l'appel est sortant et dure au moins 90 secondes.
4. Le systeme resout le poste via `call_device.device_id -> poste_id`.
5. Le systeme resout le commercial du jour via le commercial connecte sur ce poste.
6. Le systeme valide une tache du batch actif du poste.
7. Le front commercial connecte a ce poste voit son compteur progresser.

## 6. Corrections recommandees

### Correction prioritaire P0 : changer l'eligibilite obligation

Remplacer la condition actuelle :

```ts
return call.callType.toLowerCase() === ORDER_CALL_TYPE_OUTGOING && Boolean(call.localNumber);
```

par une condition compatible `device_id` :

```ts
return (
  call.callType.toLowerCase() === ORDER_CALL_TYPE_OUTGOING &&
  (Boolean(call.localNumber) || Boolean(call.deviceId))
);
```

Effet attendu :

- Les appels sortants sans `local_number`, mais avec `device_id`, arrivent enfin jusqu'a `matchObligation()`.
- Le fallback `device_id -> call_device.poste_id` devient utilisable dans le flux temps reel.

### Correction P0 bis : verifier la casse de `call_type`

Les constantes attendues sont en minuscules (`outgoing`, `missed`), mais DB2 peut renvoyer `OUTGOING`. Le code fait deja `call.callType.toLowerCase()` a plusieurs endroits, ce qui est bon.

Point a conserver :

- toujours comparer en minuscules.
- toujours stocker `call_status` en minuscules dans `call_event`.

Reference : `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:170`

### Correction P1 : attribuer explicitement le commercial via device/poste

Aujourd'hui, `matchObligation()` transmet surtout `posteId` a `tryMatchCallToTask()`. Pour le comptage par poste, c'est suffisant. Mais pour l'audit, les tableaux de bord, et l'explication "cet appel a ete fait par le commercial connecte", il faut conserver le commercial resolu.

Recommandation :

- Quand `local_number` est absent mais `device_id` est connu, resoudre :
  `device_id -> poste_id -> commercial connecte`.
- Stocker ce commercial dans `call_event.commercial_id`.
- Eventuellement stocker aussi une trace d'attribution : `attribution_source = 'device_poste_connected_commercial'`.

Cela permet de distinguer :

- attribution par telephone commercial (`local_number`).
- attribution par device/poste.
- attribution impossible.

### Correction P1 : rendre la resolution temporelle plus robuste

La logique "commercial connecte au poste" fonctionne si le commercial actuellement connecte est bien celui qui etait present au moment de l'appel. Comme les commerciaux d'un meme poste ne travaillent pas ensemble le meme jour, c'est acceptable, mais il faut eviter les erreurs de fin de jour ou de reconnexion.

Recommandation robuste :

- Utiliser les sessions de connexion commerciales si disponibles.
- Resoudre le commercial dont la session couvre `call_timestamp`.
- Fallback seulement ensuite vers "commercial actuellement connecte au poste".

Cela evite qu'un appel passe a 09:00 soit attribue au commercial connecte a 15:00 si une reconnexion ou un changement exceptionnel arrive.

### Correction P1 : ne pas rendre le fallback dependant du commercial connecte pour valider le batch poste

Pour les obligations visibles dans le front, le batch est par poste. Si le device est associe au poste, le systeme peut valider le batch du poste meme si `commercial_id` n'est pas resolu.

En pratique :

- `device_id -> poste_id` suffit pour incrementer le batch du poste.
- `commercial_id` sert a l'audit et aux stats commerciales.

Cela correspond deja a `matchObligation()` qui passe `posteId` a `tryMatchCallToTask()`.

### Correction P2 : ameliorer les diagnostics admin

Le diagnostic actuel affiche des stats utiles :

- distribution `call_status`.
- appels avec/sans `device_id`.
- appels dont le device est associe a un poste.
- feature flag.
- batches actifs.
- entonnoir retry.

Reference : `message_whatsapp/src/order-call-sync/order-call-sync.service.ts:850`

Ajouter une metrique specifique :

- appels `outgoing` avec `local_number IS NULL AND device_id IS NOT NULL`.
- appels de ce groupe ignores par le flux temps reel.
- appels de ce groupe matchables via `call_device.poste_id`.

Cette metrique rendra le probleme visible immediatement.

### Correction P2 : tests unitaires indispensables

Ajouter au minimum les cas suivants :

1. `outgoing + local_number present` reste eligible.
2. `outgoing + local_number null + device_id present + device associe poste` valide une obligation.
3. `outgoing + local_number null + device_id absent` ne valide pas et produit une raison claire.
4. `missed + device_id present` ne valide pas.
5. `outgoing + device_id present + duree < 90` est rejete par `duree_insuffisante`.
6. `outgoing + device_id present + poste sans batch actif` est rejete par `aucun_batch_actif`.
7. `outgoing + device_id present + device non associe` est rejete par `poste_introuvable`.

Le test existant "appel outgoing eligible" utilise `localNumber: '0700000001'`, donc il ne couvre pas votre cas reel.

Reference : `message_whatsapp/src/order-call-sync/__tests__/order-call-sync.service.spec.ts`

## 7. Checklist de verification en base

### 7.1 Verifier les appels DB2 sans local_number

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN local_number IS NULL OR local_number = '' THEN 1 ELSE 0 END) AS sans_local_number,
  SUM(CASE WHEN device_id IS NOT NULL AND device_id != '' THEN 1 ELSE 0 END) AS avec_device_id
FROM call_logs
WHERE LOWER(call_type) = 'outgoing';
```

### 7.2 Verifier les devices connus en DB1

```sql
SELECT device_id, poste_id, label, first_seen, last_seen, call_count
FROM call_device
ORDER BY last_seen DESC;
```

### 7.3 Identifier les devices non associes

```sql
SELECT device_id, label, last_seen, call_count
FROM call_device
WHERE poste_id IS NULL
ORDER BY call_count DESC;
```

### 7.4 Verifier les appels ingeres mais non attribues

```sql
SELECT external_id, device_id, commercial_id, commercial_phone, client_phone, call_status, duration_seconds, event_at
FROM call_event
WHERE call_status = 'outgoing'
  AND duration_seconds >= 90
  AND commercial_id IS NULL
  AND device_id IS NOT NULL
ORDER BY event_at DESC
LIMIT 100;
```

### 7.5 Verifier si ces appels sont matchables par device/poste

```sql
SELECT e.external_id, e.device_id, cd.poste_id, e.client_phone, e.duration_seconds, e.event_at
FROM call_event e
JOIN call_device cd ON cd.device_id = e.device_id
WHERE e.call_status = 'outgoing'
  AND e.duration_seconds >= 90
  AND cd.poste_id IS NOT NULL
ORDER BY e.event_at DESC
LIMIT 100;
```

## 8. Risques et points d'attention

### 8.1 Risque d'attribution au mauvais commercial

Le rattachement par poste est fiable si un seul commercial utilise le poste le jour donne. C'est votre regle metier actuelle. Mais techniquement, si deux commerciaux se connectent au meme poste le meme jour, ou si une session reste ouverte, l'attribution peut etre fausse.

Mitigation :

- verifier les sessions de presence par `call_timestamp`.
- forcer la deconnexion en fin de jour.
- journaliser la source d'attribution.

### 8.2 Risque device non associe

Si `call_device.poste_id` est null, les appels du device restent impossibles a rattacher au poste. L'ecran admin existe, mais il faut une procedure operationnelle : tout nouveau device detecte doit etre associe rapidement.

### 8.3 Risque de non-retroactivite

Les appels deja ignores par `isEligibleForObligation()` n'ont pas forcement de log `call_validation`. Le retry historique peut les recuperer depuis `call_event`, mais seulement si :

- `call_event.device_id` est renseigne.
- `call_status = outgoing`.
- `duration_seconds >= 90`.
- le device est maintenant associe a un poste.

Apres correction, il faudra lancer `POST /admin/order-sync/retry-obligations` ou attendre le cron de retry.

### 8.4 Risque feature flag

Si `FF_CALL_OBLIGATIONS_ENABLED` n'est pas `true`, aucune obligation ne sera validee.

Reference : `message_whatsapp/src/call-obligations/call-obligation.service.ts:67`

## 9. Conclusion

La fonctionnalite n'est pas absente : elle est partiellement implementee et dispose deja des briques necessaires pour votre besoin `device_id -> poste -> commercial connecte`.

La raison principale pour laquelle les appels ne sont pas detectes et comptabilises dans le front commercial est que le flux temps reel exige encore `local_number` pour declarer un appel eligible aux obligations. Cette condition rend invisible le fallback `device_id`, car elle bloque l'appel avant `matchObligation()`.

La correction prioritaire est de modifier l'eligibilite pour accepter un appel sortant avec `local_number` OU `device_id`. Ensuite, il faut s'assurer que tous les devices sont associes a leur poste dans `call_device`, puis relancer le retry des obligations pour recuperer les appels historiques deja ingeres.

