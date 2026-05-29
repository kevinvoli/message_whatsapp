# Analyse des bugs — Dispatch & File d'attente

Date : 2026-05-29  
Branche : `production`

---

## Contexte

Deux comportements anormaux signalés :

1. Un poste avec 100+ conversations « non lues » ne redispatche pas — confirmé : ces conversations ont `status = FERME` et `unread_count > 0`.
2. Un poste bloqué puis débloqué hors horaires ne réapparaît pas dans la file d'attente. Il revient à la normale seulement quand un commercial de ce poste se connecte.

---

## Vue d'ensemble de l'architecture de dispatch

```
Connexion commercial
  → purgeOfflinePostes()       [retire les postes offline de la queue]
  → addPosteToQueue()          [ajoute le nouveau poste connecté]
  → startAgentSlaMonitor()     [check SLA immédiat via jobRunnertcheque()]

Déconnexion commercial
  → removeFromQueue()          [si plus aucun commercial du poste actif]
  → fillQueueWithAllPostes()   [si queue vide → mode offline]

Admin bloque poste
  → blockPoste()               [is_queue_enabled = false, retrait queue]

Admin débloque poste
  → unblockPoste()             [is_queue_enabled = true, ± ajout queue]

Crons actifs
  → sla-checker             (5h–21h, interval configurable) → jobRunnerAllPostes()
  → read-only-enforcement   (configurable)                  → enforce() — ferme les convs inactives
  → offline-reinject        (configurable)                  → offlineReinject()
  → orphan-checker          (5h–21h, interval configurable) → checkOrphans()
```

---

## Explication : comment une conversation finit FERME avec unread_count > 0

C'est le cœur du problème.

### Flux complet

**Étape 1 — Poste offline, messages entrants non traités**

Quand un message arrive sur une conversation existante avec le poste offline (`nextAgent = null`), `assignConversation()` dans `dispatcher.service.ts` (lignes 206–228) fait :

```typescript
conversation.status = WhatsappChatStatus.EN_ATTENTE;
conversation.unread_count += 1;
conversation.last_activity_at = new Date();
conversation.last_client_message_at = new Date();
return this.chatRepository.save(conversation);
```

La conversation passe en `EN_ATTENTE`, `unread_count` s'incrémente, `last_activity_at` est mis à jour.

**Étape 2 — 24h sans activité → fermeture automatique**

`read-only-enforcement.job.ts` (lignes 61–116) ferme toutes les conversations inactives :

```typescript
// Éligible si status != FERME ET last_activity_at < now - 24h
private async findEligible(limit: Date): Promise<WhatsappChat[]> {
  return this.chatRepo.find({
    where: {
      status: Not(WhatsappChatStatus.FERME),
      last_activity_at: LessThan(limit),
    },
  });
}

async enforce(): Promise<string> {
  for (const chat of chats) {
    chat.status = WhatsappChatStatus.FERME;
    chat.read_only = false;
    await this.chatRepo.save(chat);  // ← unread_count NON reseté
  }
}
```

**`unread_count` n'est jamais remis à zéro.** La conversation est fermée avec son compteur intact.

**Résultat :** un poste offline depuis > 24h accumule des conversations `status = FERME` + `unread_count > 0`. Ces 100+ conversations «non lues» sont en réalité des conversations fermées automatiquement que personne n'a répondues.

---

## BUG #1 (principal) — `unblockPoste()` ne ré-insère pas le poste offline dans la queue

### Fichier
`message_whatsapp/src/dispatcher/services/queue.service.ts` — lignes 495–506

### Code fautif

```typescript
async unblockPoste(posteId: string): Promise<void> {
  await this.queueLock.runExclusive(async () => {
    await this.posteRepository.update(posteId, { is_queue_enabled: true });
    const poste = await this.posteRepository.findOne({ where: { id: posteId } });
    if (poste?.is_active) {                        // ← is_active = false si personne connecté
      await this.addPosteToQueueInternal(posteId); // ne s'exécute jamais hors horaires
    }
    this.logQueueEvent('unblock', { poste_id: posteId });
  });
}
```

### Problème

Après déblocage hors horaires (`is_active = false`) :
- `is_queue_enabled = true` ✅
- `addPosteToQueueInternal()` **non appelé** ❌
- Le poste reste **absent de `queue_positions`**

### Pourquoi la connexion d'un commercial résout tout

Quand un commercial du poste se connecte, la gateway appelle :
1. `addPosteToQueue(posteId)` → poste ré-inséré dans la queue
2. `startAgentSlaMonitor(posteId)` → `jobRunnertcheque(posteId)`

`jobRunnertcheque()` (`dispatcher.service.ts` lignes 544–561) :

```typescript
async jobRunnertcheque(poste_id: string) {
  const chats = await this.chatRepository.find({
    where: {
      poste_id: poste_id,
      status: In([ACTIF, EN_ATTENTE, WhatsappChatStatus.FERME]),  // ← inclut FERME
      unread_count: MoreThan(0),
      // ← PAS de filtre last_client_message_at
    },
  });
  for (const chat of chats) {
    await this.reinjectConversation(chat);  // redistribue sans condition de seuil
  }
}
```

C'est exactement ce mécanisme qui "résout tout" à la connexion : il prend **toutes** les conversations non lues du poste, y compris les `FERME`, sans filtre de seuil temporel.

---

## BUG #2 — `read-only-enforcement` ferme les conversations sans remettre `unread_count` à zéro

### Fichier
`message_whatsapp/src/jorbs/read-only-enforcement.job.ts` — ligne 110–112

### Code fautif

```typescript
chat.status = WhatsappChatStatus.FERME;
chat.read_only = false;
await this.chatRepo.save(chat);
// ← unread_count non reseté
```

### Conséquence

Une conversation `EN_ATTENTE` avec `unread_count = 5` fermée après 24h d'inactivité devient `FERME` + `unread_count = 5`. Elle apparaît comme «5 messages non lus» dans tous les affichages, métriques et crons qui filtrent sur `unread_count > 0`.

### Pourquoi aucun cron ne redispatche ces conversations

| Cron | Traite FERME + unread ? | Raison |
|------|------------------------|--------|
| `sla-checker` / `jobRunnerAllPostes()` | Partiellement | Pas de filtre status, mais seulement 5h–21h + seuil 20 min |
| `offline-reinjection` | ❌ Non | Filtre `status = ACTIF` (+ `EN_ATTENTE`) uniquement |
| `orphan-checker` | ❌ Non | Filtre `status IN (ACTIF, EN_ATTENTE)` uniquement |
| `jobRunnertcheque()` | ✅ Oui | Inclut `FERME`, pas de filtre seuil — appelé à la connexion |

`jobRunnerAllPostes()` pourrait techniquement redistribuer des FERME (pas de filtre status), mais uniquement si le poste est absent de la queue **ET** pendant la plage 5h–21h. Ce n'est pas le mécanisme prévu pour ça et son comportement dans ce cas n'est pas fiable.

---

## BUG #3 (secondaire) — `sla-checker` désactivé entre 21h et 5h

### Fichier
`first-response-timeout.job.ts` — lignes 24–31

Même si `jobRunnerAllPostes()` pouvait gérer les FERME + unread, il est inactif la nuit. Zéro redistribution possible entre 21h et 5h.

---

## Cascade complète du scénario signalé

```
J-1 (ex: 14h)   Poste X bloqué par admin
                 → is_queue_enabled = false, retiré de queue
                 → Conversations EN_ATTENTE restent assignées à Poste X

J-1 (21h)        Commerciaux déconnectés
                 → fillQueueWithAllPostes() → Poste X exclu (bloqué)
                 → sla-checker désactivé (21h–5h)

J (entre 21h–5h) Admin débloque Poste X
                 → is_queue_enabled = true ✅
                 → is_active = false → addPosteToQueueInternal() NON APPELÉ ← BUG #1
                 → Poste X ABSENT de queue_positions

J (pendant nuit) Conversations EN_ATTENTE inactives depuis > 24h
                 → read-only-enforcement ferme → FERME + unread_count reste ← BUG #2
                 → Ces conversations disparaissent des radars des crons de redistribution

J (5h–21h)       sla-checker reprend
                 → Pourrait trouver Poste X via unavailableCountRows
                 → Mais ne gère les FERME que de façon incidente (pas prévu)
                 → offline-reinjection ne les voit pas (filtre ACTIF/EN_ATTENTE)

Résolution       Commercial de Poste X se connecte
                 → addPosteToQueue(X)         ← Poste X dans la queue
                 → jobRunnertcheque(X)        ← FERME + unread inclus, sans filtre seuil
                 → Tout est redistribué ← comportement observé
```

---

## Résumé des bugs

| # | Bug | Fichier | Ligne | Priorité |
|---|-----|---------|-------|----------|
| **1** | `unblockPoste()` ne ré-insère pas le poste offline dans la queue | `queue.service.ts` | 501 | **Haute** |
| **2** | `read-only-enforcement` ferme sans remettre `unread_count = 0` | `read-only-enforcement.job.ts` | 110–112 | **Haute** |
| 3 | `sla-checker` désactivé 21h–5h (pas de filet de nuit) | `first-response-timeout.job.ts` | 26–30 | Moyenne |

---

## Corrections recommandées

### Fix #1 — `queue.service.ts` (prioritaire, simple)

Supprimer la condition `if (poste?.is_active)`. Les gardes internes de `addPosteToQueueInternal()` suffisent.

```typescript
// AVANT
async unblockPoste(posteId: string): Promise<void> {
  await this.queueLock.runExclusive(async () => {
    await this.posteRepository.update(posteId, { is_queue_enabled: true });
    const poste = await this.posteRepository.findOne({ where: { id: posteId } });
    if (poste?.is_active) {
      await this.addPosteToQueueInternal(posteId);
    }
    this.logQueueEvent('unblock', { poste_id: posteId });
  });
}

// APRÈS
async unblockPoste(posteId: string): Promise<void> {
  await this.queueLock.runExclusive(async () => {
    await this.posteRepository.update(posteId, { is_queue_enabled: true });
    await this.addPosteToQueueInternal(posteId);
    this.logQueueEvent('unblock', { poste_id: posteId });
  });
}
```

### Fix #2 — `read-only-enforcement.job.ts` (deux options, décision métier)

**Option A — Reset `unread_count = 0` à la fermeture**

Les conversations fermées automatiquement n'ont plus d'agent pour répondre. Garder `unread_count > 0` est trompeur.

```typescript
chat.status = WhatsappChatStatus.FERME;
chat.read_only = false;
chat.unread_count = 0;            // ← reset
await this.chatRepo.save(chat);
```

**Option B — Redistribuer avant de fermer si unread_count > 0**

Si une conversation a des messages non lus au moment de la fermeture auto, la redistribuer plutôt que la fermer. Cela permet à un autre agent de la prendre en charge.

```typescript
for (const chat of chats) {
  if (chat.unread_count > 0) {
    await this.dispatcher.reinjectConversation(chat);  // redistribue d'abord
    // Ne pas fermer : reinjectConversation la réouvre sur un autre poste
  } else {
    chat.status = WhatsappChatStatus.FERME;
    chat.read_only = false;
    await this.chatRepo.save(chat);
  }
}
```

**Recommandation :** Option A si la conversation fermée auto est définitivement terminée. Option B si on veut donner une dernière chance à des messages non lus d'être traités.

---

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `src/dispatcher/services/queue.service.ts` | Gestion file d'attente — Bug #1 |
| `src/jorbs/read-only-enforcement.job.ts` | Fermeture auto sans reset unread_count — Bug #2 |
| `src/jorbs/first-response-timeout.job.ts` | SLA checker + `startAgentSlaMonitor` — Bug #3 |
| `src/dispatcher/dispatcher.service.ts` | `assignConversation`, `jobRunnertcheque`, `jobRunnerAllPostes` |
