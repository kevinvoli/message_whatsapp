# Audit programmeTest - Outil de test webhook

**Date** : 2026-02-15
**Branche** : `inification`
**Scope** : `programmeTest/` (stress test multi-provider)

---

## 1. Architecture actuelle

```
programmeTest/
├── index.ts            # Orchestrateur principal (runStressTest + sendMessage)
├── config.ts           # Chargement .env multi-fichier + config
├── generator.ts        # Generation messages Whapi + Meta
├── webhook.ts          # Construction payloads webhook
├── payload.ts          # Interfaces TypeScript (WhapiWebhookPayload, MetaWebhookPayload)
├── stats-instance.ts   # Singleton stats
├── stats.ts            # StatsCollector (inutilise)
├── types.ts            # Interface FailedMessage
├── testWhat.js         # Script debug Meta brut (token en dur)
├── package.json        # Dependencies (axios, mysql2, cross-env)
└── tsconfig.json       # Config TS (NodeNext, ES2022)
```

**Scripts npm** :
| Script | Commande | Provider |
|--------|----------|----------|
| `npm test` | `node --loader ts-node/esm index.ts` | Defaut (.env) |
| `npm run whapi` | `cross-env PROVIDER=whapi ...` | Whapi |
| `npm run meta` | `cross-env PROVIDER=meta ...` | Meta |
| `npm run mix` | `cross-env PROVIDER=mix ...` | Alterne Whapi/Meta |
| `npm run what` | `node --loader ts-node/esm testWhats.ts` | Script inexistant |

---

## 2. Flux d'execution

```
runStressTest()
  ├── resolveMapping()          # DB ou config statique
  ├── generateChatIds(N)        # N numeros ivoiriens aleatoires
  └── pour chaque chat x message :
       ├── generateMetaWebhookPayload()
       ├── generateWebhookPayload()
       ├── choisir provider (whapi | meta | mix)
       ├── sendMessage({ provider, payload })
       │    ├── HMAC-SHA256 signature
       │    ├── axios.post(url, payload, headers)
       │    └── stats.recordSuccess / recordFailure
       └── batch parallelisation (config.parallelRequests)
```

---

## 3. Problemes identifies

### T0 - CRITIQUE : Token Meta expose en clair dans `testWhat.js`

**Fichier** : `testWhat.js:4`
**Gravite** : CRITIQUE / SECURITE

```javascript
Authorization: `Bearer EAAW6fPlo8HABQnu5rOSdXUsl2R...`
```

Un access token Meta Cloud API est commite en clair dans le repo. Meme si le fichier semble etre un brouillon, le token est dans l'historique git.

**Correction** :
1. Supprimer `testWhat.js`
2. Revoquer le token dans Meta Business Manager
3. Ajouter `testWhat.js` au `.gitignore`
4. Verifier l'historique git (`git filter-branch` ou `git-filter-repo`)

---

### T1 - Script `npm run what` pointe vers un fichier inexistant

**Fichier** : `package.json:12`

```json
"what": "node --loader ts-node/esm testWhats.ts"
```

Le script reference `testWhats.ts` mais le fichier s'appelle `testWhat.js`. Le script crash au lancement.

**Correction** : Supprimer le script ou le renommer pour pointer vers le bon fichier.

---

### T2 - `StatsCollector` (stats.ts) inutilise - code mort

**Fichier** : `stats.ts`

La classe `StatsCollector` est definie mais jamais importee nulle part. `stats-instance.ts` definit son propre objet litéral avec une API differente (`recordSuccess`, `recordFailure`, `detectErrorType`). Les deux coexistent sans lien.

**Correction** : Supprimer `stats.ts` ou fusionner la logique dans `stats-instance.ts`.

---

### T3 - Pas de test d'envoi de statut (status webhook)

**Fichier** : `generator.ts`, `webhook.ts`

Le programme ne genere **que des messages texte**. Il n'y a aucune generation de :
- **Statuts** (`delivered`, `read`, `failed`) - pour tester le flux `updateStatusMessage()`
- **Messages media** (`image`, `video`, `audio`, `document`)
- **Messages interactifs** (`button_reply`, `list_reply`)
- **Messages location**

Cote serveur, le controller Whapi accepte `event.type: 'statuses'` et le controller Meta accepte les `statuses[]` dans le payload. Ces chemins ne sont jamais testes.

**Correction** : Ajouter des generateurs pour :
```typescript
// Statut Whapi
{ event: { type: 'statuses', event: 'patch' }, statuses: [{ id, status, chat_id, recipient_id }] }

// Statut Meta
{ entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp, recipient_id }] } }] }] }

// Media (Whapi)
{ type: 'image', image: { id, mime_type, link, caption } }

// Interactive (Whapi)
{ type: 'reply', reply: { type: 'buttons_reply', buttons_reply: { id, title } } }
```

---

### T4 - Le payload Meta genere ne contient jamais de `statuses`

**Fichier** : `generator.ts:27-70`

La fonction `generateMetaPayload()` genere toujours `messages: [...]` et jamais `statuses: [...]`. Le serveur attend pourtant `value.statuses` pour les webhooks de statut Meta (P2 recemment implemente).

Le `assertMetaPayload()` du serveur valide `hasMessages || hasStatuses` - un payload sans ni l'un ni l'autre est rejete. Mais on ne teste jamais la branche `statuses`.

**Correction** : Ajouter `generateMetaStatusPayload()` dans `generator.ts`.

---

### T5 - Interfaces `payload.ts` desynchronisees du serveur

**Fichier** : `payload.ts`

| Champ | `payload.ts` (test) | Serveur (interface reelle) | Ecart |
|-------|---------------------|---------------------------|-------|
| `WhapiMessage.type` | `'text'` seulement | `string` (text, image, video, audio, document, sticker, location, interactive, reply...) | Sous-type |
| `WhapiMessage.source` | `'mobile'` seulement | `string` | Sous-type |
| `WhapiMessage.from_name` | optionnel | requis cote serveur (NOT NULL en DB) | Peut causer INSERT failure |
| `WhapiWebhookPayload.statuses` | absent | `statuses?: WhapiStatus[]` | Manquant |
| `MetaWebhookPayload.statuses` | absent | `value.statuses?: MetaStatus[]` | Manquant |
| `WhapiMessage.image/video/audio/document` | absents | presents dans interface serveur | Manquant |
| `WhapiMessage.reply` | absent | `reply?: { type, buttons_reply?, list_reply? }` | Manquant |

Le programme de test ne peut generer que des messages texte simples, ce qui ne couvre qu'une fraction des flux reels.

**Correction** : Aligner `payload.ts` sur les interfaces serveur (`whapi-webhook.interface.ts` et `whatsapp-whebhook.interface.ts`) ou les re-exporter.

---

### T6 - `resolveMapping()` - requete SQL sur table `whapi_channels` potentiellement inexistante

**Fichier** : `index.ts:36-41`

```typescript
const [whapiRows] = await connection.query(
  'SELECT channel_id FROM whapi_channels WHERE channel_id IS NOT NULL LIMIT 1',
);
```

La table `whapi_channels` est l'ancien nom. Apres unification, les channels sont dans la table `whapi_channel` (entity `WhapiChannel`). La requete va echouer silencieusement et fallback sur la config statique sans avertissement.

De plus, la deuxieme requete utilise `channels` :
```sql
SELECT channel_id FROM channels WHERE provider='whapi'
```
Cette table `channels` n'existe pas dans le schema actuel (c'est `whapi_channel`).

**Correction** : Mettre a jour les noms de tables ou utiliser l'entity name correct (`whapi_channel` pour channels, `provider_channel` pour mappings).

---

### T7 - Pas de validation du `from_name` - crash serveur

**Fichier** : `generator.ts:13`

```typescript
from_name: `Bot Stress ${Math.random().toString(36).slice(2)}`,
```

Le champ est present pour Whapi, mais dans `generateMetaPayload()`, le `contactName` est passe via `contacts[0].profile.name`. Si le serveur ne trouve pas le contact dans le webhook, `from_name` sera `undefined` et l'INSERT en DB crashera car la colonne `sender_name` est NOT NULL.

Le programme de test ne teste pas ce cas limite (contact absent, nom vide).

**Correction** : Ajouter un mode de test ou `contacts` est vide ou `profile.name` est absent.

---

### T8 - Le mode `mix` alterne de maniere simpliste

**Fichier** : `index.ts:137-140`

```typescript
if (config.provider === 'mix') {
  const provider: Provider = i % 2 === 0 ? 'whapi' : 'meta';
```

L'alternance `pair=whapi / impair=meta` est deterministe. Un vrai test devrait :
- Tester des ratios differents (80/20, 50/50, 20/80)
- Randomiser pour trouver des race conditions
- Permettre un ratio configurable

**Impact** : Faible - le test fonctionne mais la couverture est limitee.

---

### T9 - Pas de test de webhook de verification Meta (GET)

**Fichier** : aucun

Le serveur expose `GET /webhooks/whatsapp` pour la verification du webhook Meta (`hub.mode=subscribe`). Le programme de test ne teste jamais cet endpoint. En production, si ce endpoint echoue, Meta ne peut pas enregistrer le webhook.

**Correction** : Ajouter un test de verification Meta :
```typescript
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
```

---

### T10 - Pas de test de reponse idempotency/duplicate

Le serveur gere l'idempotency (retourne `{ status: 'duplicate_ignored' }` si un message est deja traite). Le programme de test envoie toujours des IDs uniques (`randomUUID()`, `Date.now()`), donc ne teste jamais :
- Le rejet de doublons
- Le comportement avec le meme `message_id` envoye 2 fois

**Correction** : Ajouter un mode qui reenvoie le meme payload pour verifier l'idempotency.

---

### T11 - Pas de test d'erreur de signature (HMAC invalide)

Le programme signe correctement chaque requete. Il ne teste jamais :
- Signature absente -> doit retourner 401
- Signature invalide -> doit retourner 403
- Secret rotation (previous secret) -> doit accepter

**Correction** : Ajouter des tests negatifs de securite.

---

### T12 - `stats.recordFailure()` ne compte pas les erreurs backend

**Fichier** : `stats-instance.ts:38-43`

```typescript
if (errorType === 'timeout') {
  this.timeout++;
} else if (errorType === 'network') {
  this.networkFailed++;
}
// 'backend' et 'unknown' ne sont PAS comptes dans les compteurs
```

Les erreurs de type `backend` (HTTP 4xx/5xx) et `unknown` sont enregistrees dans `failedMessages` mais pas dans les compteurs. Le `summary()` ne les affiche pas dans les totaux, ce qui donne une vue faussee.

**Correction** : Ajouter compteurs `backendFailed` et `unknownFailed`.

---

### T13 - Le `summary()` de `stats-instance` peut diviser par zero

**Fichier** : `stats.ts:19-22` (StatsCollector - inutilise mais symptomatique)

```typescript
acceptanceRate: `${((this.networkAccepted / this.sent) * 100).toFixed(2)}%`
```

Si `sent = 0`, le resultat est `NaN%`. Le `stats-instance.ts` ne calcule pas de taux mais le `StatsCollector` oui.

---

### T14 - Numeros generes potentiellement invalides

**Fichier** : `generator.ts:72-80`

```typescript
const rest = Math.floor(10000000 + Math.random() * 90000000);
return `225${prefix}${rest}`;
```

Cela genere des numeros de 12 chiffres (`225` + 2 prefix + 8 reste). Les numeros ivoiriens sont au format `225XXXXXXXXXX` (10 chiffres apres 225). Le generateur produit `225XX` + 8 = 12 chiffres apres 225, soit 15 digits au total. Le format correct serait 12 digits total (`225` + 10 chiffres avec indicatif operateur).

Si le serveur valide les numeros, certains messages seront rejetes.

---

### T15 - Pas de mesure de latence

Le programme mesure la duree totale (`start` -> `summary()`) mais pas la latence par requete. Pour un stress test, les metriques p50/p95/p99 sont essentielles.

**Correction** : Enregistrer `Date.now()` avant/apres chaque `axios.post()` et calculer percentiles.

---

### T16 - Pas de mode `status-only` pour tester les webhooks de statut

Le programme ne peut envoyer que des messages entrants. Il n'y a pas de mode pour tester :
- Le flux complet : envoyer un message -> recevoir statut `sent` -> `delivered` -> `read`
- Un webhook de statut `failed` avec `error_code` et `error_title`

---

## 4. Matrice de couverture

| Flux serveur | Teste par programmeTest | Commentaire |
|-------------|:-----------------------:|-------------|
| Whapi message texte IN | OUI | Seul flux teste |
| Meta message texte IN | OUI | Seul flux teste |
| Whapi statut (delivered/read/failed) | NON | Pas de generateur |
| Meta statut (delivered/read/failed) | NON | Pas de generateur |
| Whapi message media (image/video/audio/doc) | NON | Interface trop restrictive |
| Meta message media (image/video/audio/doc) | NON | Interface trop restrictive |
| Whapi message interactif (button/list reply) | NON | Pas de generateur |
| Meta message interactif (button/list reply) | NON | Pas de generateur |
| Whapi message location | NON | Pas de generateur |
| Meta message location | NON | Pas de generateur |
| Verification webhook Meta (GET) | NON | Pas de test |
| Idempotency / doublons | NON | IDs toujours uniques |
| Signature invalide / absente | NON | Signe toujours correctement |
| Rate limiting webhook | NON | Pas assez de volume par defaut |
| Circuit breaker / mode degrade | NON | Pas de test |
| Outbound (envoi agent -> provider) | NON | Programme test = inbound seulement |

**Taux de couverture** : ~2/16 flux = **12.5%**

---

## 5. Priorite de correction

| ID | Probleme | Severite | Effort |
|----|----------|----------|--------|
| **T0** | Token Meta en clair dans `testWhat.js` | CRITIQUE | 5 min |
| **T3** | Pas de test statut webhook | HAUTE | 1h |
| **T4** | Pas de payload Meta statut | HAUTE | 30 min |
| **T5** | Interfaces desynchronisees du serveur | HAUTE | 1h |
| **T6** | Noms de tables SQL obsoletes | MOYENNE | 15 min |
| **T7** | Pas de test `from_name` absent | MOYENNE | 15 min |
| **T1** | Script `npm run what` casse | BASSE | 5 min |
| **T2** | Code mort `StatsCollector` | BASSE | 5 min |
| **T8** | Mode mix simpliste | BASSE | 30 min |
| **T9** | Pas de test GET verification Meta | BASSE | 15 min |
| **T10** | Pas de test idempotency | BASSE | 30 min |
| **T11** | Pas de test securite negative | BASSE | 30 min |
| **T12** | Compteurs d'erreur incomplets | BASSE | 10 min |
| **T13** | Division par zero dans StatsCollector | BASSE | 5 min |
| **T14** | Numeros generes potentiellement invalides | BASSE | 10 min |
| **T15** | Pas de mesure de latence par requete | BASSE | 30 min |
| **T16** | Pas de mode status-only | MOYENNE | 1h |

---

## 6. Resume

Le programmeTest remplit son role minimal de stress test pour les messages texte entrants Whapi et Meta. Cependant :

1. **Couverture tres faible** (12.5%) - seuls les messages texte IN sont testes
2. **Faille de securite** - token Meta expose dans `testWhat.js`
3. **Desynchronisation** - les interfaces du test ne refletent pas les interfaces serveur actuelles (post-unification)
4. **Pas de test negatif** - aucun test de securite, idempotency, ou cas d'erreur
5. **Pas de test outbound** - le flux d'envoi de message (agent -> provider) n'est pas couvert
6. **Code mort** - `stats.ts` inutilise, `testWhat.js` orphelin, script `what` casse
