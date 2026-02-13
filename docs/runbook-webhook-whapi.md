# Runbook Incident Webhook/Whapi

Date: 2026-02-13  
Scope: `message_whatsapp` (webhook entrant + envoi sortant provider Whapi)

## 1. Symptomes Cibles
- Messages clients non visibles dans le front/admin.
- Reponses agent/admin en echec (`MESSAGE_SEND_ERROR`).
- Erreurs 401/403 sur webhook.
- Erreurs 429/5xx cote provider.
- Doublons ou pertes de messages.

## 2. Arbre de Decision Incident
1. Le webhook `/webhooks/whapi` recoit-il des requetes ?
- `non`: verifier URL webhook Whapi + HTTPS + reseau + reverse proxy.
- `oui`: passer a l'etape 2.
2. Le webhook retourne-t-il `2xx` ?
- `non`: verifier secret header Whapi et validation payload.
- `oui`: passer a l'etape 3.
3. Le message entrant est-il persiste en DB ?
- `non`: verifier assignation dispatcher (poste/queue) + channel + erreurs TypeORM.
- `oui`: passer a l'etape 4.
4. Le message est-il emis en socket ?
- `non`: verifier gateway connectee + auth socket JWT.
- `oui`: diagnostiquer front (reconnect/resync/store).
5. Envoi sortant en echec ?
- `oui`: classifier erreur provider:
  - `transient` (`408/425/429/5xx`): retry auto + monitoring saturation.
  - `permanent` (`4xx` hors liste): corriger payload (`to/body/channel`).

## 3. Verification Rapide (PowerShell)
Depuis `C:\Users\gbamb\Desktop\projet\whatsapp`:

```powershell
# 1) Backend up
npm run start:dev --prefix message_whatsapp
```

```powershell
# 2) Verifier logs de trace (entree/sortie)
if (Get-Command rg -ErrorAction SilentlyContinue) {
  rg -n "INCOMING_|OUTBOUND_|MESSAGE_SEND_ERROR|Webhook idempotency table missing" message_whatsapp/src
}
```

```powershell
# 3) Tests smoke E2E backend
$env:E2E_RUN='true'; npm run test:e2e --prefix message_whatsapp
```

```powershell
# 4) Validation build front/admin
npm run build --prefix front
npm run build --prefix admin
```

## 4. Controles Config Critiques
- `JWT_SECRET`
- `WHAPI_WEBHOOK_SECRET_HEADER`
- `WHAPI_WEBHOOK_SECRET_VALUE`
- `WEBHOOK_WHAPI_SECRET` (fallback legacy)
- `MESSAGE_RESPONSE_TIMEOUT_HOURS`
- `WHAPI_OUTBOUND_MAX_RETRIES`
- `MYSQL_*`

## 5. Procedure de Reprise
1. Stabiliser ingestion:
- corriger secret webhook, redeployer backend, valider `2xx` webhook.
2. Stabiliser sortie:
- verifier `channel_id` conversation + token channel actif.
- verifier format `to` (digits only) et `body` non vide.
3. Rejouer de maniere controlee:
- si provider rejoue automatiquement: laisser l'idempotence absorber.
- si resync manuel necessaire: renvoyer seulement les messages manquants via API admin `POST /messages` (pas de replay brut DB).
4. Verifier coherence:
- `/chats` montre conversation + `channel_id`.
- `/messages/:chat_id` contient IN et OUT attendus.
- front socket reconnect affiche les messages sans doublon.

## 6. Cas Connus et Action
- `403 Invalid webhook secret`: corriger header configure dans Whapi.
- `ER_NO_SUCH_TABLE webhook_event_log`: migration/table manquante; incident non bloquant immediate (fallback actif), corriger schema ensuite.
- `CHANNEL_NOT_FOUND`: conversation sans channel resolu; verifier dernier message client et mapping channel.
- `WHAPI_TRANSIENT_ERROR`: surveiller retries, reessayer apres stabilisation provider.
- `WHAPI_PERMANENT_ERROR`: payload invalide, corriger `to/body/channel`.

## 7. Critere de Sortie Incident
- Webhook en `2xx` stable.
- Messages entrants visibles en front/admin.
- Reponses agent/admin livrees sans erreur.
- E2E backend vert (`test:e2e`).

