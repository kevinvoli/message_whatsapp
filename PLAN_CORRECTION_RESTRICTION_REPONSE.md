# Plan de correction — Fonctionnalité « Restriction de réponse »

> Périmètre audité (lecture intégrale) :
> - `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts`
> - `message_whatsapp/src/conversation-restriction/conversation-restriction.controller.ts`
> - `message_whatsapp/src/conversation-restriction/conversation-restriction.module.ts`
> - `message_whatsapp/src/conversation-restriction/entities/commercial-conversation-access.entity.ts`
> - `message_whatsapp/src/conversation-restriction/dto/restriction-config.dto.ts`
> - `message_whatsapp/src/conversation-restriction/conversation-restriction.service.spec.ts`
> - `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` (handlers `conversation:accessed`, `restriction:check`, `message:send`, helpers `resolveCurrentBypass`, `isRestrictionExemptPoste`)
> - `message_whatsapp/src/system-config/system-config.service.ts`
> - `front/src/store/chatStore.ts`
> - `front/src/components/ConversationRestrictionModal.tsx`
> - `front/src/components/WebSocketEvents.tsx`
> - `front/src/types/chat.ts`

---

## Contexte

La feature « restriction de réponse » bloque un commercial qui ouvre plusieurs conversations non lues sans y répondre (≥ `RESTRICTION_MIN_RESPONSE_CHARS` caractères). La source de vérité est backend : une table `commercial_conversation_access` trace, par jour, les conversations consultées et leur état de réponse. Le gateway WebSocket émet `restriction:status`, le frontend (Zustand) affiche `ConversationRestrictionModal`.

Le flux nominal :
1. `selectConversation(chat_id)` (front) → si restriction activée + conv non lue → `emit('conversation:accessed')` et stocke `pendingConversationId`.
2. Gateway `handleConversationAccessed` → `preCheck` → `recordAccess` → `checkRestriction` → `emit('restriction:status')`.
3. Le handler `socket.on('restriction:status')` (dans `setSocket`) décide d'afficher le modal ou de reprendre la sélection en attente.
4. À l'envoi (`message:send`), garde backend + `recordResponse` + ré-émission de `restriction:status`.

---

## Éléments réutilisables identifiés

| Élément | Emplacement | Réutilisation |
|---|---|---|
| `ConversationRestrictionService` | `conversation-restriction.service.ts` | Cœur métier — à corriger, pas à recréer |
| `getRestrictionConfig()` | service L25-42 | Point central de lecture config — à mettre en cache plutôt que dupliquer |
| `isRestrictionExemptPoste()` / `resolveCurrentBypass()` | gateway L823-838 | Logique d'exemption déjà factorisée — réutiliser telle quelle |
| `RestrictionStatusDto` | `dto/restriction-config.dto.ts` | Contrat partagé backend ↔ front (`RestrictionStatus` dans `types/chat.ts`) — à étendre (champ `requestedChatId`) |
| `_doSelectConversation()` | `chatStore.ts` L349 | Sélection bas-niveau réutilisée par `selectConversation` et la reprise du pending |
| Mock helpers de test | `test/helpers/mock-repository`, `test/factories/conversation.factory` | Réutiliser pour les nouveaux tests |

---

## Risques de duplication

- **Lecture de config dispersée** : `getRestrictionConfig()` est appelé jusqu'à **3 fois par action** (dans `isRestrictionExemptPoste`, dans `checkRestriction`, et dans la branche exempt du gateway), chaque appel = 5 requêtes `SystemConfig.get`. Avant d'ajouter une nouvelle correction qui relit la config, **centraliser/cacher** la config (voir Tâche 8) pour éviter de multiplier les lectures.
- **`generateUuid()` dupliqué** (service backend L279-285 ET `chatStore.ts` L10-19) — même implémentation Math.random. Côté backend il est en plus inutile (la colonne est `@PrimaryGeneratedColumn('uuid')`).
- **Logique « la conv courante est-elle dans la liste des non-répondues »** présente côté front (handler `restriction:status`, filtre `shouldTrigger`) ET côté gateway (garde `message:send`, L1101). Le critère de décision doit être **unifié** via le contrat (champ `requestedChatId`) plutôt que ré-implémenté des deux côtés avec des sémantiques divergentes.

---

# 1. Validation des bugs du rapport

### BUG #1 — Modale invisible — **CONFIRMÉ (conditionnel, logique fragile)**

`chatStore.ts` L247-249 :
```ts
const shouldTrigger =
  status.triggered &&
  status.unrespondedConversations.some((c) => c.chat_id !== currentChatId);
```

Analyse exacte :
- `triggered = config.enabled && unrespondedCount > config.maxUnrespondedConvs` (service L227), et `maxUnrespondedConvs` a un `@Min(1)` (dto L8-9). Donc en config **valide**, `triggered=true ⇒ unrespondedCount ≥ 2` ⇒ il y a toujours au moins un `chat_id` différent de `currentChatId` ⇒ `shouldTrigger == triggered`. Le filtre est alors un **no-op** : il ne remplit pas son intention affichée dans le commentaire (« ne pas afficher si la seule conv bloquante est l'ouverte »).
- En config **dégradée** (`RESTRICTION_MAX_UNRESPONDED_CONVS = 0`, atteignable par écriture SQL directe ou parsing — `getRestrictionConfig` ne replafonne pas à 1, L36), `triggered=true` avec **une seule** conv non-répondue. Si cette conv est celle ouverte → `some(...) === false` → **modal muet** alors que le backend déclenche. C'est le scénario exact du rapport.
- **Effet de bord majeur** (interaction avec BUG #3) : la reprise du pending utilise `status.triggered` (brut backend, L257) tandis que l'affichage utilise `shouldTrigger`. Quand `shouldTrigger=false` mais `status.triggered=true`, **ni le modal ne s'affiche, ni le pending ne reprend** → la conversation cliquée n'est jamais ouverte (deadlock silencieux).

**Verdict : réel.** À corriger en supprimant la divergence `shouldTrigger`/`status.triggered` et en filtrant la liste affichée (exclure la conv ouverte) plutôt que la décision d'affichage.

---

### BUG #2 — Requête N+1 — **CONFIRMÉ (mais pas à l'endroit indiqué)**

Le rapport vise « la boucle `for + await getOne()` par conversation non-répondue ». Le **bootstrap** (service L170-203) est en réalité **déjà optimisé** en une seule requête groupée (`getRawMany` + `groupBy`). Le N+1 subsiste à **deux autres endroits** :

1. **`requireLastMessageMine`** — L207-224 : `for (const access of effectiveAccesses) { ... await getOne() }` → 1 requête par conversation.
2. **Enrichissement `unrespondedConversations`** — L230-250 : `Promise.all(map(async () => await getOne()))` → N requêtes (parallèles mais N quand même) pour `lastClientMsg`.

Ces deux blocs s'exécutent à **chaque** `conversation:accessed`, `restriction:check` et `message:send`. Avec 10 conversations non-répondues, c'est jusqu'à 20 requêtes superflues par clic.

**Verdict : réel.** À corriger par deux requêtes groupées (window function ou agrégat `IN (:...ids)`).

---

### BUG #3 — `pendingConversationId` vidé trop tôt — **PARTIELLEMENT INFIRMÉ / REQUALIFIÉ**

Contrairement à l'énoncé, le pending **n'est pas vidé au déclenchement** : le handler `restriction:status` (L251-265) ne touche `pendingConversationId` que dans la branche `if (!status.triggered)`. Au trigger, il est **préservé**. Les vrais défauts de reprise sont :

- **(a) Pending orphelin** (cause = BUG #1) : si `status.triggered=true` mais `shouldTrigger=false`, aucun modal n'apparaît et le pending n'est jamais consommé.
- **(b) Reprise basée sur `triggered` brut** : la reprise se déclenche dès qu'**un** `restriction:status` avec `triggered=false` arrive — y compris ceux émis par la **garde d'envoi** ou le **succès d'envoi** d'une AUTRE conversation (gateway L1191). Conséquence : après avoir répondu à A, le front peut **sauter automatiquement vers B** (le pending resté en mémoire) alors que la commerciale était en train de travailler sur A → navigation surprise.
- **(c) `dismissRestriction` (L491) et `closeRestrictionModal` (L498)** mettent `pendingConversationId: null` sans le reprendre — acceptable (choix explicite de l'utilisateur), mais l'intention initiale (B) est perdue silencieusement.

**Verdict : le bug existe mais sous une autre forme** (reprise non corrélée, pending orphelin). À corriger en corrélant la reprise au `requestedChatId` (voir contrat).

---

### BUG #4 — `preCheck` sans connaissance du `chat_id` cliqué — **CONFIRMÉ**

Gateway `handleConversationAccessed` L859-866 :
```ts
const preCheck = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
if (preCheck.triggered) {
  client.emit('restriction:status', preCheck);
  return;                       // ← recordAccess JAMAIS appelé
}
await this.restrictionService.recordAccess(agent.commercialId, payload.chat_id);
```

`checkRestriction` ne reçoit **pas** `payload.chat_id`. Conséquences :
- Si la conv cliquée **est déjà** dans la liste des non-répondues (action légitime de déblocage), le serveur renvoie quand même `triggered` et bloque côté flux ; c'est le front qui rattrape via le modal + `dismissRestriction`. Logique de décision dupliquée et fragile.
- `recordAccess` est sauté quand `preCheck.triggered` : ouvrir une conv déjà non-répondue ne rafraîchit pas `accessedAt`, et une **nouvelle** conv cliquée pendant un état déjà déclenché n'est jamais tracée (elle « disparaît » de la comptabilité).
- Le serveur ne peut pas distinguer « clic pour débloquer une conv listée » de « clic pour ouvrir une nouvelle conv » → c'est cette information manquante qui empêche une décision propre côté backend.

**Verdict : réel.** À corriger en passant `requestedChatId` à `checkRestriction` et en autorisant explicitement l'ouverture d'une conv déjà listée.

---

### BUG #5 — Race condition envoi ↔ vérification — **CONFIRMÉ**

`restriction:status` est émis depuis **4 points** (gateway L855/861/866, L881/894, L1111, L1191) et **tous** sont traités par un **unique handler** (`chatStore.ts` L241) qui n'a **aucun moyen de corréler** l'événement reçu au clic/à l'envoi qui l'a provoqué : le DTO `RestrictionStatusDto` ne contient ni `requestedChatId`, ni timestamp, ni id de requête.

Scénarios reproductibles :
- Clic rapide A puis B : deux `conversation:accessed` en vol, deux `restriction:status` reviennent dans un ordre non garanti ; le **dernier** écrase l'état, potentiellement avec la réponse correspondant au **premier** clic.
- Envoi valide dans A (gateway émet `restriction:status` triggered=false, L1191) pendant qu'un clic B est en attente → la reprise du pending (B) se déclenche sur un statut qui ne concernait pas B.
- Le front (`selectConversation` L415-419) lit `restrictionConfig` en cache local : entre l'envoi et la réception du nouveau statut, un clic intermédiaire évalue une **restriction fantôme** sur l'ancien état.

**Verdict : réel.** Racine commune avec BUG #3/#4 : **absence de corrélation** dans le contrat `restriction:status`.

---

# 2. Angles morts supplémentaires (non couverts par le rapport)

### AM-1 — `restriction:status` sans corrélation (racine de #3/#4/#5)
Le DTO ne renvoie pas le `chat_id` à l'origine de la requête. **C'est le défaut structurant.** Ajouter `requestedChatId?: string` à `RestrictionStatusDto` / `RestrictionStatus` permet de corriger #3, #4 et #5 d'un seul contrat.

### AM-2 — Race insertion concurrente dans `recordAccess`
Service L70-94 : `findOne` puis `create`+`save` (check-then-insert). L'index unique `UQ_cca_commercial_chat_date` (entity L12-14) garantit l'intégrité mais **deux `conversation:accessed` concurrents sur le même chat lèvent une `QueryFailedError` (duplicate key)** non capturée → rejet de promesse / 500 WebSocket. À remplacer par un `upsert` (`orIgnore` / `ON DUPLICATE KEY`).

### AM-3 — `generateUuid()` backend inutile et faible
Service L85-86 passe `id: this.generateUuid()` (Math.random) alors que l'entité est `@PrimaryGeneratedColumn('uuid')`. À supprimer (laisser TypeORM/DB générer). Élimine aussi la duplication avec `chatStore.ts`.

### AM-4 — Loophole « répondu une fois = ignoré toute la journée »
`checkRestriction` ne considère que les accès `respondedAt IS NULL` (L137). Dès qu'une conv a une réponse valide enregistrée, elle est **exclue définitivement pour la journée**, même si le client renvoie 10 messages ensuite. Un commercial peut répondre une fois (50 car.) puis ignorer tous les follow-ups du jour sans jamais re-déclencher la restriction. À arbitrer métier : faut-il « ré-ouvrir » l'obligation quand `last_client_message_at > respondedAt` ?

### AM-5 — Aucune ré-évaluation à l'arrivée d'un message client
Quand un client envoie un message (incrément `unread_count`), la restriction **n'est pas recalculée ni poussée**. L'état affiché côté commercial peut rester périmé jusqu'à sa prochaine action. Lié à AM-4. À décider : pousser un `restriction:status` au poste concerné lors de l'ingress entrant.

### AM-6 — Cohérence timezone `todayDateString()` / `todayStart`
`todayDateString()` (L271-277) et `todayStart` (L152-153) utilisent l'heure **locale du serveur**, tandis que `accessDate` est une colonne `date` et `msg.timestamp` est comparé en `>=`. Si la TZ de session MySQL diffère de la TZ Node, le « jour » de comptabilisation et le filtre messages peuvent diverger autour de minuit. À fixer une référence unique (UTC ou TZ explicite documentée).

### AM-7 — QueryBuilder chat ne filtre pas `deletedAt`
`checkRestriction` charge les chats via QueryBuilder (L144-148) qui **n'exclut pas** les soft-deletes (contrairement à `.find()`). Un chat soft-deleted pourrait entrer dans `chatMap`. Ajouter `andWhere('chat.deletedAt IS NULL')`. (Les requêtes messages filtrent déjà `deletedAt IS NULL` ✓.)

### AM-8 — L'entité `CommercialConversationAccess` n'a pas de soft-delete
Contrairement à la convention CLAUDE.md (« toutes les entités utilisent le soft-delete »), l'entité n'a pas de `@DeleteDateColumn`. À trancher : exception assumée (table technique journalière) ou alignement. Si exception → documenter ; ne pas ajouter de colonne sans migration.

### AM-9 — `checkRestriction` calcule tout le pipeline même si `enabled=false`
L'évaluation (requêtes accès + chats + messages + enrichissement) tourne intégralement avant le test `config.enabled` (L227). Court-circuiter en tête de méthode quand `!config.enabled` (retour `triggered:false`, liste vide). Gain perf direct.

### AM-10 — Config non cachée → multiplication des lectures
`getRestrictionConfig()` = 5 `repo.findOne` à chaque appel, appelé 2-3×/action. `SystemConfigService.get` ne cache rien (L128-131). Introduire un cache court (ex. 30 s) invalidé sur `set`/`setBulk`.

### AM-11 — Réponse `recordResponse` basée sur la longueur du payload, pas du message stocké
Gateway L1181 calcule `textLength = (payload.text ?? '').trim().length`, alors que le bootstrap auto-mark (service L181) compte `CHAR_LENGTH(COALESCE(msg.text,''))`. `.trim()` côté garde vs pas de trim côté SQL → un message « 50 espaces + 50 lettres » est compté différemment selon le chemin. Unifier la règle (trim ou non) entre `recordResponse`, la garde d'envoi (L1070) et le bootstrap SQL.

### AM-12 — Feedback silencieux « message trop court » côté front
`sendMessage` (chatStore L571-577) `return` silencieux si texte trop court : aucun message d'erreur affiché (contrairement au backend qui renvoie `MESSAGE_TOO_SHORT` → `setSendError`). L'utilisateur ne comprend pas pourquoi l'envoi échoue. Appeler `setSendError(...)` côté front aussi.

### AM-13 — Le modal liste la conversation déjà ouverte
`ConversationRestrictionModal` (L56) affiche **toutes** les `restrictionUnresponded`, y compris la conv active. Avec un bouton « Répondre » qui rouvre une conv déjà ouverte. Filtrer/labelliser la conv courante.

### AM-14 — `effectiveAccesses` vide mais `triggered=true` : impossible (à documenter)
Question posée : non, c'est impossible avec la logique actuelle (`triggered ⇒ count > max ≥ 1 ⇒ count ≥ 2 ⇒ liste non vide`). À garder comme invariant testé (test de non-régression) plutôt que comme garde runtime.

### AM-15 — Pas de purge des accès périmés
`commercial_conversation_access` croît d'une ligne par (commercial, chat, jour). Aucun cron de nettoyage. Prévoir une purge (ex. > 30 jours) — non bloquant.

### AM-16 — Re-fetch complet de `checkRestriction` dans la garde d'envoi
Gateway L1092 relance tout le pipeline `checkRestriction` à chaque `message:send`, puis L1106 refait un `findBychat_id`. Acceptable fonctionnellement, mais cumulé aux N+1 (BUG #2) c'est coûteux sur le chemin critique d'envoi. Bénéficie directement des corrections BUG #2 + AM-9 + AM-10.

---

# 3. Plan de correction — Tâches ordonnées

> **Tâche 0 (contrat) bloque tout** ce qui touche la corrélation (#3, #4, #5, AM-1). Les tâches backend pures (#2, AM-2, AM-3, AM-7, AM-9) et la tâche frontend #1 peuvent démarrer en parallèle après la Tâche 0.

## Contrat d'interface (Tâche 0 — obligatoire avant parallélisation)

**Étendre le DTO de statut** (backend `dto/restriction-config.dto.ts` + front `types/chat.ts`) :

```ts
// RestrictionStatusDto / RestrictionStatus
{
  triggered: boolean;
  unrespondedCount: number;
  unrespondedConversations: RestrictionUnrespondedConv[];
  config: RestrictionConfigDto;
  requestedChatId?: string;   // ← NOUVEAU : chat_id à l'origine de l'événement
  accessAllowed?: boolean;    // ← NOUVEAU : true si requestedChatId peut être ouvert
}
```

**Signature service modifiée :**
```ts
checkRestriction(
  commercialId: string,
  posteId?: string,
  requestedChatId?: string,   // ← NOUVEAU
): Promise<RestrictionStatusDto>
```
- `requestedChatId` est répercuté dans la réponse.
- `accessAllowed = !triggered || unrespondedConversations.some(c => c.chat_id === requestedChatId)` (ouvrir une conv déjà listée est toujours autorisé).

**Événements WebSocket (inchangés en nom) :**
- `conversation:accessed` ← `{ chat_id }` → `restriction:status` (avec `requestedChatId = chat_id`)
- `restriction:check` → `restriction:status` (`requestedChatId` absent)
- `message:send` → en cas de blocage, `restriction:status` (`requestedChatId = chat_id`, `accessAllowed=false`)

*Aucune migration SQL pour la Tâche 0 (champs de transport uniquement).*

---

## Tâche 1 — Frontend : corriger l'affichage du modal et la reprise (BUG #1, #3) — *frontend-dev — 2 h*
**Dépend de : Tâche 0.**

Fichier : `front/src/store/chatStore.ts` L241-265.

Avant :
```ts
socket.on('restriction:status', (status: RestrictionStatus) => {
  const currentChatId = get().selectedConversation?.chat_id;
  const shouldTrigger =
    status.triggered &&
    status.unrespondedConversations.some((c) => c.chat_id !== currentChatId);
  set({
    restrictionConfig: status.config,
    restrictionTriggered: shouldTrigger,
    restrictionUnresponded: status.unrespondedConversations,
  });
  if (!status.triggered) {
    const pending = get().pendingConversationId;
    if (pending) {
      set({ pendingConversationId: null });
      get()._doSelectConversation(pending);
    }
  }
});
```
Après (logique cible) :
```ts
socket.on('restriction:status', (status: RestrictionStatus) => {
  set({
    restrictionConfig: status.config,
    restrictionTriggered: status.triggered,           // plus de divergence shouldTrigger
    restrictionUnresponded: status.unrespondedConversations,
  });

  const pending = get().pendingConversationId;
  // Reprise UNIQUEMENT si l'événement concerne le pending et que l'accès est autorisé
  if (pending && status.requestedChatId === pending && status.accessAllowed) {
    set({ pendingConversationId: null });
    get()._doSelectConversation(pending);
  }
});
```
Et `ConversationRestrictionModal.tsx` L56 : filtrer la conv courante de la liste affichée
```ts
const currentChatId = useChatStore((s) => s.selectedConversation?.chat_id);
// ...
{restrictionUnresponded
  .filter((conv) => conv.chat_id !== currentChatId)
  .map((conv) => ( ... ))}
```

**Risques / effets de bord :**
- La reprise n'est plus déclenchée par les `restriction:status` d'un autre flux (envoi dans A) → corrige le « saut surprise » (BUG #3b). Vérifier que `restriction:check` (reconnect, sans `requestedChatId`) ne consomme pas le pending : OK car `requestedChatId === pending` sera false.
- Si la liste filtrée devient vide mais `triggered=true` (config max=0 dégradée), le modal s'afficherait vide → ajouter un garde : ne pas rendre le modal si la liste filtrée est vide (retomber sur la reprise / fermeture).

**Dépendance :** doit être faite **après** Tâche 0 (besoin de `requestedChatId`/`accessAllowed`) et **après** Tâche 2/3 backend pour que ces champs soient effectivement émis (sinon `accessAllowed` undefined → reprise jamais déclenchée). → **Tâche 1 se déploie après les tâches backend de contrat.**

---

## Tâche 2 — Backend : propager `requestedChatId` / `accessAllowed` (BUG #4, #5, AM-1) — *backend-dev — 3 h*
**Dépend de : Tâche 0.**

Fichiers : `conversation-restriction.service.ts`, `whatsapp_message.gateway.ts`.

1. **Service `checkRestriction`** : ajouter le paramètre `requestedChatId?`, calculer `accessAllowed`, les inclure dans le retour (L252-257).
2. **Gateway `handleConversationAccessed`** (L859-866) — réordonner pour tracer puis vérifier en connaissant la conv cliquée :
```ts
// Avant : preCheck (sans chat) → return si triggered → recordAccess → checkRestriction
// Après :
await this.restrictionService.recordAccess(agent.commercialId, payload.chat_id);
const status = await this.restrictionService.checkRestriction(
  agent.commercialId, agent.posteId, payload.chat_id,
);
client.emit('restriction:status', status);
```
   - `recordAccess` reste idempotent et no-op sur conv non éligible (lecture seule / fenêtre expirée / sans canal) → tracer avant la vérif ne fausse pas le compte (la conv non-répondue cliquée est légitimement comptée, et `accessAllowed=true` pour elle si elle est dans la liste).
3. **Gateway garde `message:send`** (L1101-1109) : remplacer la logique locale `isCurrentInUnrespondedList` par `status.accessAllowed` issu de `checkRestriction(..., payload.chat_id)`, en conservant le garde `unread_count > 0` re-fetché.
4. **Gateway branches exempt** (L855, L885) et **succès d'envoi** (L1191) : renseigner `requestedChatId` (= `payload.chat_id` quand pertinent) dans les `restriction:status` émis.

**Risques / effets de bord :**
- Tracer avant vérifier : une conv « nouvelle » cliquée pendant un état déjà déclenché sera désormais enregistrée (corrige AM-4 partiel / cohérence compteur). Vérifier que cela ne fait pas grimper artificiellement le compteur au-delà du réel : `recordAccess` ne crée qu'une ligne/jour (idempotent via unique index).
- La garde d'envoi devient dépendante de `accessAllowed` : s'assurer que `accessAllowed` est calculé avec le **même** `requestedChatId` que le message envoyé.

---

## Tâche 3 — Backend : éliminer les N+1 restants (BUG #2) — *backend-dev — 2 h*
**Indépendante (peut être parallèle à Tâche 2).**

Fichier : `conversation-restriction.service.ts` L205-250.

1. **`requireLastMessageMine`** (L207-224) — remplacer la boucle `for...getOne()` par une requête groupée du dernier message par chat :
```sql
-- dernier message (timestamp max) par chat_id parmi candidateChatIds, deletedAt IS NULL
```
   Implémentation TypeORM : sous-requête `MAX(timestamp) GROUP BY chat_id` jointe, OU `ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY timestamp DESC)` (MySQL 8). Récupérer `from_me` du dernier message en une passe, puis filtrer en mémoire.
2. **Enrichissement `unrespondedConversations`** (L230-250) — remplacer le `Promise.all(getOne)` par une seule requête « dernier message client (`from_me=false`) par chat_id » sur `effectiveUnresponded`, puis mapper en mémoire.

**Contraintes respectées :** property names camelCase dans QueryBuilder, paramètres liés `IN (:...ids)`, `deletedAt IS NULL`, zéro `any`.

**Risques / effets de bord :**
- Les window functions exigent MySQL 8+. Vérifier la version cible ; sinon fallback sous-requête corrélée *unique* (pas par ligne). Tester l'égalité des résultats avec l'ancienne implémentation (mêmes `last_client_message`).

---

## Tâche 4 — Backend : `recordAccess` upsert + suppression `generateUuid` (AM-2, AM-3) — *backend-dev — 1 h*
**Indépendante.**

Fichier : `conversation-restriction.service.ts` L48-95.
- Supprimer `id: this.generateUuid()` (L86) et la méthode `generateUuid()` (L279-285) — laisser `@PrimaryGeneratedColumn('uuid')` générer.
- Remplacer check-then-insert par un upsert atomique :
```ts
await this.accessRepository
  .createQueryBuilder()
  .insert()
  .values({ commercialId, chatId, accessDate: today, accessedAt: new Date(), responseLength: 0 })
  .orUpdate(['accessed_at'], ['commercial_id', 'chat_id', 'access_date'])  // ON DUPLICATE KEY
  .execute();
```
  ⚠️ Préserver la règle « ne pas réinitialiser si déjà répondu » : l'`orUpdate` ne doit mettre à jour que `accessed_at` (jamais `responded_at`/`response_length`). Conserve le comportement L74-83.

**Risques :** `orUpdate` MySQL via TypeORM nécessite que la cible du conflit corresponde exactement à l'index unique. Tester la collision concurrente (deux inserts simultanés → un seul gagne, pas d'exception).

---

## Tâche 5 — Backend : court-circuit `enabled=false` + filtre soft-delete chats (AM-7, AM-9) — *backend-dev — 0.5 h*
**Indépendante.**

Fichier : `conversation-restriction.service.ts`.
- En tête de `checkRestriction` (après L129) : `if (!config.enabled) return { triggered:false, unrespondedCount:0, unrespondedConversations:[], config, requestedChatId, accessAllowed:true };`
- Chat QueryBuilder L144-148 : ajouter `.andWhere('chat.deletedAt IS NULL')`.

**Risques :** négligeables. Vérifier que les tests existants (config enabled=true par défaut) ne sont pas affectés.

---

## Tâche 6 — Backend : unifier la règle de longueur (AM-11) — *backend-dev — 0.5 h*
**Indépendante.**

Aligner `recordResponse` (gateway L1181 `trim()`) et la garde d'envoi (L1070) avec le bootstrap SQL (service L181, `CHAR_LENGTH` sans trim). Décision recommandée : **trim partout** (cohérent avec la garde front L574 qui fait `text.trim().length`). Donc adapter le bootstrap SQL : `CHAR_LENGTH(TRIM(COALESCE(msg.text,'')))`.

**Risques :** un changement de la règle peut requalifier des accès en base (auto-mark). Effet uniquement sur le calcul du jour courant, pas de migration de données.

---

## Tâche 7 — Frontend : feedback « message trop court » + bypass cohérent (AM-12) — *frontend-dev — 0.5 h*
**Indépendante.**

Fichier : `chatStore.ts` L571-577. Remplacer le `return` silencieux par `set({ sendError: ... })` (réutiliser le même message que le backend `MESSAGE_TOO_SHORT`).

---

## Tâche 8 — Backend : cache config restriction (AM-10) — *backend-dev — 1 h*
**Indépendante — recommandée avant montée en charge.**

Option A (ciblée) : mémoïser `getRestrictionConfig()` dans `ConversationRestrictionService` avec TTL court (ex. 30 s), invalidé par un hook sur `setBulk` (le controller admin appelle `setBulk` → émettre un reset du cache).
Option B (transverse) : cache au niveau `SystemConfigService.get`. Plus large — à valider avec l'équipe (impacte d'autres conscommateurs).

**Recommandation :** Option A (périmètre maîtrisé, pas d'effet de bord sur les autres clés).

**Risques :** un cache mal invalidé ferait persister une ancienne config après modification admin. Brancher l'invalidation sur l'écriture.

---

## Tâche 9 — (Décisions métier, hors code immédiat) AM-4, AM-5, AM-6, AM-8, AM-15 — *architect + PO*
À arbitrer avant implémentation :
- AM-4/AM-5 : ré-ouvrir l'obligation quand un nouveau message client arrive après réponse ? + push `restriction:status` à l'ingress.
- AM-6 : fixer la TZ de référence (UTC recommandé) — impacte `todayDateString`/`todayStart`.
- AM-8 : statuer sur l'absence de soft-delete (exception assumée).
- AM-15 : cron de purge des accès > N jours.

*Aucune de ces sous-tâches ne doit introduire de migration sans validation.*

---

## Dépendances inter-tâches (résumé)

```
Tâche 0 (contrat)
   ├── Tâche 2 (backend corrélation) ──┐
   ├── Tâche 1 (frontend modal/reprise) ── nécessite que 2 émette requestedChatId/accessAllowed
   └── (les champs sont optionnels → pas de breaking change si 1 déployée avant 2,
        mais la reprise ne marchera qu'une fois 2 en prod)

Indépendantes (parallélisables) : 3, 4, 5, 6, 7, 8
Bloc décisions : 9 (avant tout dev correspondant)
```

Ordre critique : **0 → 2 → 1** pour la chaîne corrélation. Le reste en parallèle.

---

# 4. Tests à ajouter

### Backend — `conversation-restriction.service.spec.ts` (étendre l'existant)
- **#1/invariant AM-14** : `triggered=true ⇒ unrespondedConversations.length ≥ 2` avec config standard (max=1). Et cas `max=0` → `triggered` avec 1 seule conv, `accessAllowed` correct.
- **#2** : `requireLastMessageMine=true` avec 3 convs → vérifier **une seule** requête « dernier message » (spy sur `createQueryBuilder`/`getRawMany`, pas de N appels `getOne`).
- **#2** : enrichissement `unrespondedConversations` → une seule requête « dernier message client ».
- **#4** : `checkRestriction(..., requestedChatId)` → `accessAllowed=true` quand `requestedChatId` ∈ liste, `false` sinon ; `requestedChatId` répercuté dans le retour.
- **AM-2** : `recordAccess` appelé 2× en parallèle (même chat/jour) → un seul effet, pas d'exception (mock upsert).
- **AM-3** : `recordAccess` ne passe plus d'`id` (l'objet inséré n'a pas de champ `id`).
- **AM-7** : un chat soft-deleted (`deletedAt != null`) n'apparaît pas dans `unrespondedConversations`.
- **AM-9** : `config.enabled=false` → retour immédiat, **aucune** requête accès/messages (spy : 0 appel `createQueryBuilder`).
- **AM-11** : message « 60 espaces » avec `minResponseChars=50` → **non** compté comme réponse (trim).

### Backend — gateway (spec gateway si existant, sinon créer ciblé)
- `handleConversationAccessed` : trace puis vérifie ; émet `restriction:status` avec `requestedChatId = payload.chat_id`.
- `message:send` garde : bloque seulement si `accessAllowed=false` ET `unread_count>0` ; autorise une conv listée.

### Frontend — `chatStore` (RTL/Jest sur le store)
- **#1** : `restriction:status` `triggered=true` avec liste [A] et `selectedConversation=A` → modal **ne s'affiche pas vide** (garde liste filtrée vide) mais reprise/fermeture cohérente.
- **#3** : `restriction:status` `triggered=false` avec `requestedChatId ≠ pending` (cas envoi dans autre conv) → **ne reprend pas** le pending.
- **#3** : `restriction:status` `triggered=false` avec `requestedChatId === pending` & `accessAllowed=true` → reprend `_doSelectConversation(pending)`.
- **#5** : deux `restriction:status` reçus dans le désordre → seul celui matchant le pending courant déclenche la reprise.
- **AM-12** : `sendMessage` texte trop court → `sendError` renseigné.

### Frontend — `ConversationRestrictionModal` (RTL)
- **AM-13** : la conv courante (`selectedConversation`) est exclue de la liste rendue.
- Liste filtrée vide → le modal ne rend rien.

---

# 5. Ordre de déploiement recommandé

> **Aucune migration SQL n'est requise** pour les corrections (#1–#5, AM-1/2/3/7/9/11/12/13). Les champs ajoutés au DTO sont du transport WebSocket. L'upsert (Tâche 4) s'appuie sur l'index unique **déjà existant** (`UQ_cca_commercial_chat_date`). AM-8/AM-15 (soft-delete, purge) nécessiteraient une migration → **hors de ce lot**, à traiter en Tâche 9.

1. **Backend d'abord** (champs optionnels → rétrocompatible avec le front actuel) :
   - Tâche 0 (DTO) + Tâche 2 (corrélation) + Tâche 3 (N+1) + Tâche 4 (upsert) + Tâche 5 + Tâche 6 + Tâche 8.
   - Déployable seul : le front existant ignore les nouveaux champs, comportement inchangé.
2. **Frontend ensuite** : Tâche 1 + Tâche 7.
   - À déployer **après** que le backend émet `requestedChatId`/`accessAllowed`, sinon la reprise (qui exige `accessAllowed`) ne se déclencherait jamais.
3. **Vérifications post-déploiement** : `npm run build` backend (0 erreur TS), `npm test -- --testPathPattern=conversation-restriction`, `npm run build` front.

Rollback : revert frontend possible indépendamment (backend rétrocompatible). Revert backend → front Tâche 1 retombe sur reprise inopérante (pending jamais consommé) → préférer revert des deux ensemble.

---

# 6. Definition of Done (par bug)

| Bug | Critère de validation |
|---|---|
| **#1** | Modal s'affiche dès que `triggered=true` et qu'au moins une conv ≠ active reste non-répondue ; ne s'affiche jamais **vide** ; plus de divergence `shouldTrigger`/`triggered`. Test store + modal verts. |
| **#2** | `checkRestriction` exécute un nombre de requêtes **constant** quel que soit le nombre de convs (vérifié par spy). `requireLastMessageMine` et l'enrichissement ne bouclent plus avec `getOne`. |
| **#3** | La reprise du pending ne se déclenche **que** sur `requestedChatId === pending && accessAllowed`. Plus de « saut surprise » après envoi dans une autre conv. Pending jamais orphelin (cas BUG #1 résolu). |
| **#4** | `checkRestriction` reçoit `requestedChatId` ; `recordAccess` exécuté avant la vérif ; ouvrir une conv déjà listée renvoie `accessAllowed=true` ; une nouvelle conv reste bloquée. |
| **#5** | Chaque `restriction:status` porte `requestedChatId` ; le front ne traite que l'événement corrélé au clic/à l'envoi courant ; clics rapides A/B dans le désordre → état final correct (test store). |
| **AM-2** | Deux `conversation:accessed` concurrents → aucune `QueryFailedError`, une seule ligne d'accès. |
| **AM-3** | Aucun appel à `generateUuid` côté service ; id généré par la DB. |
| **AM-7/9** | Chats soft-deleted exclus ; `enabled=false` → retour immédiat sans requête. |
| **AM-11** | Règle de longueur (trim) identique sur les 3 chemins (garde envoi, recordResponse, bootstrap SQL). |
| **AM-12** | Tentative d'envoi trop court → message d'erreur visible côté commercial. |
| **AM-13** | Conv active absente de la liste du modal. |
| Global | `npm run build` (back + front) 0 erreur, **zéro `any`**, `npm test -- --testPathPattern=conversation-restriction` vert, lint OK. |

---

## Fichiers impactés

- `message_whatsapp/src/conversation-restriction/dto/restriction-config.dto.ts` — ajout `requestedChatId`, `accessAllowed` à `RestrictionStatusDto` (Tâche 0)
- `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts` — signature `checkRestriction` + `accessAllowed` (T2), N+1 (T3), upsert + suppression `generateUuid` (T4), court-circuit `enabled` + soft-delete chats (T5), règle longueur (T6), cache config (T8)
- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` — réordonnancement `handleConversationAccessed`, garde `message:send` via `accessAllowed`, `requestedChatId` dans les émissions (T2), règle longueur (T6)
- `message_whatsapp/src/conversation-restriction/conversation-restriction.service.spec.ts` — nouveaux tests (T2-T6, AM-*)
- `front/src/types/chat.ts` — `requestedChatId`/`accessAllowed` sur `RestrictionStatus` (T0)
- `front/src/store/chatStore.ts` — handler `restriction:status` (T1), feedback envoi court (T7)
- `front/src/components/ConversationRestrictionModal.tsx` — exclusion conv active + garde liste vide (T1/AM-13)

## Points d'attention

- **Rétrocompatibilité contrat** : `requestedChatId`/`accessAllowed` optionnels → déploiement backend non-breaking.
- **Pas de migration** dans ce lot ; AM-8/AM-15 (soft-delete, purge) renvoyés en Tâche 9 avec migration dédiée si validés.
- **Window functions** (Tâche 3) : confirmer MySQL ≥ 8 sinon fallback sous-requête unique.
- **Invalidation cache** (Tâche 8) obligatoire sur écriture admin sinon config périmée.
- **Convention** : `migration:run` jamais manuel (déploiement auto) — non concerné ici puisque pas de migration.
- **Ne pas commiter / ne pas créer de branche** sans instruction explicite.
