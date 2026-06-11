# Plan de correction — "Lus sans réponse" (130+ conversations par jour)

> Date : 2026-06-11  
> Statut : PLAN — non implémenté

---

## Comportements intentionnels (ne pas modifier)

1. **`recordAccess` sort sans rien faire si `respondedAt != null`** : un commercial peut
   relire indéfiniment une conversation déjà répondue, qu'elle soit lue ou non. Ceci est voulu.

2. **Bypass `unreadCount <= 0` dans `chatStore.ts:412`** : corollaire du point 1 — une
   conversation sans messages non lus peut être consultée librement sans passer par la
   restriction. Ceci est également voulu.

---

## Le vrai bug — `recordAccess` appelé AVANT `checkRestriction`

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:834-836`

```typescript
// Code actuel — ordre incorrect
await this.restrictionService.recordAccess(agent.commercialId, payload.chat_id);
const status = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
client.emit('restriction:status', status);
```

### Mécanisme d'accumulation des fantômes

`recordAccess` est appelé AVANT la vérification. Résultat : la conversation demandée est
inscrite dans `commercial_conversation_access` avec `respondedAt = NULL` même si le commercial
se retrouve ensuite bloqué et **n'ouvre jamais la conversation**.

```
Exemple avec maxUnrespondedConvs = 3

T1 — Jessica ouvre conv_1 (vraie lecture)
     → recordAccess(conv_1) → [conv_1, respondedAt=NULL]     ← 1 non-répondu
     → checkRestriction → 1 < 3 → triggered: false → conv_1 s'ouvre
     → conversation:read → readByCommercialId = jessica ✓
     → Jessica ne répond pas

T2 — Jessica ouvre conv_2 (vraie lecture)
     → recordAccess(conv_2) → [conv_2, respondedAt=NULL]     ← 2 non-répondus
     → checkRestriction → 2 < 3 → triggered: false → conv_2 s'ouvre
     → readByCommercialId = jessica ✓
     → Jessica ne répond pas

T3 — Jessica ouvre conv_3 (vraie lecture)
     → recordAccess(conv_3) → [conv_3, respondedAt=NULL]     ← 3 non-répondus
     → checkRestriction → 3 >= 3 → triggered: TRUE → modal ← BLOQUÉE
     → conv_3 n'est jamais ouverte MAIS son accès est déjà en DB comme non-répondu

     État DB  : [conv_1 ∅, conv_2 ∅, conv_3 ∅ (fantôme)]
     Métrique : conv_1 "lue sans réponse", conv_2 "lue sans réponse"
     Compteur : 3 non-répondus (dont 1 fantôme)

T4 — Jessica répond à conv_1
     → recordResponse(conv_1) → respondedAt = now
     → checkRestriction → 2 non-répondus (conv_2 + conv_3 fantôme)
     → 2 < 3 → triggered: false

T5 — Jessica ouvre conv_4 (vraie lecture souhaitée)
     → recordAccess(conv_4) → [conv_4, respondedAt=NULL]     ← 3 non-répondus
     → checkRestriction → 3 >= 3 → triggered: TRUE → bloquée encore
     → conv_4 est un nouveau fantôme

     État DB  : [conv_1 répondu, conv_2 ∅, conv_3 fantôme, conv_4 fantôme]
     Métrique : conv_2 "lue sans réponse"
     Compteur : 3 non-répondus (dont 2 fantômes!)
```

### Conséquence directe sur les 130+

Plus le temps passe, plus les fantômes s'accumulent. La restriction se déclenche
prématurément (les fantômes saturent le quota), ce qui frustra la commerciale qui clique
d'autres conversations pour "essayer" d'accéder à quelque chose. Chaque clic supplémentaire
ajoute un nouveau fantôme. Le compteur de non-répondus s'emballe alors qu'en réalité le
nombre de conversations RÉELLEMENT lues reste contenu.

À l'inverse : quand la restriction ne déclenche pas (fantômes < seuil), le commercial peut
lire davantage de conversations que le seuil voulu car les fantômes "occupent" des slots sans
jamais être répondus.

---

## Bug secondaire — Sémantique de `>=` dans le calcul de déclenchement

**Fichier** : `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts:215`

```typescript
const triggered = config.enabled && unrespondedCount >= config.maxUnrespondedConvs;
```

Avec le fix P0 (check avant record), le `>=` produit un effet de bord :

```
maxUnrespondedConvs = 1

Jessica ouvre conv_1 :
  → preCheck (0 non-répondus, 0 >= 1 → false) → OK
  → recordAccess(conv_1)
  → recheck (1 non-répondu, 1 >= 1 → true) → triggered: true !
  → La conversation ne s'ouvre pas → fantôme créé
```

Avec `>=`, le commercial est bloqué dès la première ouverture de la journée. Le seuil correct
est `> maxUnrespondedConvs` : le commercial peut avoir *au maximum* N conversations
non-répondues; c'est à la tentative d'ouverture de la (N+1)ème qu'il est bloqué.

```
maxUnrespondedConvs = 1, opérateur >

Jessica ouvre conv_1 :
  → preCheck (0 > 1 → false) → OK
  → recordAccess(conv_1) → 1 non-répondu
  → recheck (1 > 1 → false) → triggered: false → conv_1 s'ouvre ✓

Jessica ouvre conv_2 (sans avoir répondu à conv_1) :
  → preCheck (1 > 1 → false) → OK
  → recordAccess(conv_2) → 2 non-répondus
  → recheck (2 > 1 → true) → triggered: true → BLOQUÉE ✓
```

---

## Bug #3 (performance) — Bootstrap séquentiel dans `checkRestriction`

**Fichier** : `conversation-restriction.service.ts:170-188`

```typescript
// 1 requête DB par accès non-répondu
for (const access of rawAccesses) {
  const hasQualifyingMsg = await this.messageRepository
    .createQueryBuilder('msg')
    .where(...)
    .getCount();
```

Si Jessica a 50 accès non-répondus en DB ce jour, `checkRestriction` fait 50 requêtes
séquentielles. Chaque ouverture de conversation coûte 50 aller-retours DB.

---

## Plan de corrections

### P0 — Inverser l'ordre : check avant record + opérateur `>`

**Fichier** : `whatsapp_message.gateway.ts` — `handleConversationAccessed`

```typescript
// Avant
await this.restrictionService.recordAccess(agent.commercialId, payload.chat_id);
const status = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
client.emit('restriction:status', status);

// Après
const preCheck = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
if (preCheck.triggered) {
  // Déjà au seuil → on bloque SANS enregistrer l'accès (pas de fantôme)
  client.emit('restriction:status', preCheck);
  return;
}
// Sous le seuil → enregistrer l'accès puis réévaluer
await this.restrictionService.recordAccess(agent.commercialId, payload.chat_id);
const status = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
client.emit('restriction:status', status);
```

**Fichier** : `conversation-restriction.service.ts:215`

```typescript
// Avant
const triggered = config.enabled && unrespondedCount >= config.maxUnrespondedConvs;

// Après
const triggered = config.enabled && unrespondedCount > config.maxUnrespondedConvs;
```

**Effet** : un commercial avec `maxUnrespondedConvs = N` peut ouvrir exactement N
conversations non-répondues. La tentative d'ouverture de la (N+1)ème est bloquée, et cette
conversation ne génère aucun fantôme en DB.

---

### P1 — Bootstrap en une seule requête groupée

**Fichier** : `conversation-restriction.service.ts:145-191`

Remplacer la boucle séquentielle par une requête unique :

```typescript
// Une seule requête pour tous les chatIds non-répondus
const chatIds = rawAccesses.map((a) => a.chatId);
if (chatIds.length === 0) { /* ... */ }

const respondedRows = await this.messageRepository
  .createQueryBuilder('msg')
  .select('msg.chat_id', 'chatId')
  .where('msg.chat_id IN (:...chatIds)', { chatIds })
  .andWhere('msg.commercial_id = :commercialId', { commercialId })
  .andWhere('msg.from_me = :fromMe', { fromMe: true })
  .andWhere('msg.timestamp >= :todayStart', { todayStart })
  .andWhere(`CHAR_LENGTH(COALESCE(msg.text, '')) >= :minChars`, { minChars: config.minResponseChars })
  .andWhere('msg.deletedAt IS NULL')
  .groupBy('msg.chat_id')
  .getRawMany<{ chatId: string }>();

const respondedChatIds = new Set(respondedRows.map((r) => r.chatId));

// Mettre à jour en batch les accès maintenant résolus
const toMarkResponded = rawAccesses.filter((a) => respondedChatIds.has(a.chatId));
if (toMarkResponded.length > 0) {
  void this.accessRepository
    .createQueryBuilder()
    .update()
    .set({ respondedAt: new Date(), responseLength: config.minResponseChars })
    .whereInIds(toMarkResponded.map((a) => a.id))
    .execute();
}

// Filtrer les accès effectivement non-répondus
const effectiveAccesses = rawAccesses.filter((a) => !respondedChatIds.has(a.chatId));
```

---

## Fichiers à modifier (récapitulatif)

| Priorité | Fichier | Changement |
|---|---|---|
| P0 | `whatsapp_message/whatsapp_message.gateway.ts:834-836` | Inverser order check/record — bloquer sans enregistrer si déjà triggered |
| P0 | `conversation-restriction/conversation-restriction.service.ts:215` | `>=` → `>` dans le calcul `triggered` |
| P1 | `conversation-restriction/conversation-restriction.service.ts:170-188` | Bootstrap en requête groupée unique |

---

## Tests de régression

1. Commercial ouvre conv_1 (premiere de la journée, `maxUnrespondedConvs = 1`) → s'ouvre sans blocage
2. Commercial ouvre conv_2 sans avoir répondu à conv_1 → bloqué; conv_2 **absente** de `commercial_conversation_access`
3. Commercial répond à conv_1 → peut ouvrir conv_2 normalement
4. `checkRestriction` avec 30+ accès non-répondus → une seule requête DB au lieu de 30+
