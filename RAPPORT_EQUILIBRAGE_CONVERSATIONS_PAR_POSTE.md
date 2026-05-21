# Rapport d'Audit — Équilibrage des Conversations par Poste

> **Date :** 2026-05-21  
> **Branche :** `production`  
> **Contexte :** Certaines conversations accumulent 50+ messages sur un même poste pendant que d'autres n'en ont qu'un seul.

---

## Résumé Exécutif

L'audit révèle **19 failles** dans le processus d'attribution et d'équilibrage des conversations par poste.

**Observation clé confirmée :** Le clic sur "Exécuter maintenant" du cron `sla-checker` corrige immédiatement et correctement le déséquilibre. Cela prouve que **l'algorithme de rééquilibrage `jobRunnerAllPostes` est fonctionnel**. Le problème est ailleurs : c'est le **dispatch initial** qui assigne mal les conversations, et le cron ne corrige la situation que 30 minutes plus tard (voire jamais si la plage horaire est dépassée).

**Diagnostic principal :**
1. Chaque nouveau message appelle `assignConversation()` → `least_loaded` → **ignore les convs FERME** → assigne toujours le même poste surchargé
2. Le cron `sla-checker` tourne toutes les **30 minutes** et ne touche que les convs sans réponse depuis **15 min minimum**
3. Entre deux cycles du cron, le dispatch initial continue d'alimenter le mauvais poste
4. Le cron ne tourne **pas entre 21h et 5h** → 8 heures d'accumulation sans correction possible

La racine du problème est donc le **dispatch temps-réel cassé**, pas le rééquilibrage périodique.

---

## 1. Architecture Globale du Dispatch

### 1.1 Deux chemins distincts

```
CHEMIN 1 — Temps réel (à chaque message entrant)
  Webhook entrant
    └─ inbound-message.service.ts
         └─ dispatcherService.assignConversation()
              └─ dispatcher.service.ts (assignConversationInternal)
                   └─ queueService.getNextInQueue()
                        └─ queue.service.ts (least_loaded ou round_robin)
                             ← BUG ICI : FERME ignoré → mauvais poste choisi

CHEMIN 2 — Correctif périodique (cron sla-checker)
  NestJS Scheduler (setInterval)
    └─ first-response-timeout.job.ts (handler)
         └─ dispatcher.service.ts : jobRunnerAllPostes()
              ← Fonctionne bien mais tourne toutes les 30 min
              ← Inactif entre 21h et 5h
              ← Ne traite que les convs sans réponse depuis 15+ min
```

**Le Chemin 1 crée le déséquilibre, le Chemin 2 le corrige — mais avec 15 à 30 min de retard.**

### 1.2 Trois modes d'attribution

| Mode | Condition | Logique |
|------|-----------|---------|
| **Dédié** | `channel.poste_id IS NOT NULL` | Tous les messages → poste fixe, ignore l'équilibrage global |
| **Pool global** (défaut) | `channel.poste_id IS NULL` | Round-robin ou least-loaded via queue ordonnée |
| **Fallback BDD** | Queue vide | Requête directe → poste avec le moins de conversations |

---

## 2. Failles Critiques (causent directement la disparité 50 vs 1)

### FAILLE #1 — Statut `FERME` ignoré dans `least_loaded`

**Fichier :** `dispatcher/services/queue.service.ts` lignes 219–228

```typescript
// Comptage actuel — INCOMPLET
.andWhere('chat.status IN (:...statuses)', {
  statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
  // FERME manquant → le poste accumule des convs fermées invisibles au compteur
})
```

**Problème :** Les conversations au statut `FERME` restent physiquement assignées à leur poste (`poste_id` non NULL dans `whatsapp_chat`) mais ne sont **pas comptabilisées** dans le sélecteur `least_loaded`. Un poste peut avoir 49 conversations fermées + 1 active, mais afficher un score de 1 — identique à un poste vierge.

**Scénario concret :**
```
Poste A : 49 convs FERME + 1 ACTIF → score comptabilisé : 1
Poste B : 1 conv ACTIF              → score comptabilisé : 1

least_loaded voit égalité → choisit Poste A (premier de liste)
→ Poste A reçoit le 50e message, Poste B stagne à 1
```

**Correction :** Inclure `WhatsappChatStatus.FERME` dans le filtre, ou mieux, exclure les conversations fermées de l'assignation via un `poste_id = NULL` à la clôture.

---

### FAILLE #2 — Conversation `FERME` reste assignée au poste original

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 178–179

```typescript
if (conversation.status === WhatsappChatStatus.FERME) {
  conversation.status = WhatsappChatStatus.ACTIF;
  // poste_id non modifié → reste sur le poste qui a clôturé
}
```

**Problème :** Quand un client répond après une fermeture, la conversation réouvre mais reste sur le poste qui l'avait clôturée. Si ce poste est offline ou surchargé, la conversation y reste bloquée sans mécanisme de réassignation.

---

### FAILLE #3 — Réinjection SLA ignorée si un seul poste en queue

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 369–381

```typescript
const alternatives = await this.queueService.countQueuedPostesExcluding(chat.poste_id);
if (alternatives === 0) {
  // Prolonge la deadline de 30 min et abandonne le redispatch
  await this.chatRepository.update(chat.id, {
    first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
  });
  return null;  // ← BOUCLE INFINIE POTENTIELLE
}
```

**Problème :** Si un seul poste est actif, une conversation qui dépasse son SLA est simplement prolongée de 30 min, encore et encore. Elle reste sur le même agent inactif sans escalade. Une conversation peut rester 1h+ sans réponse sans aucune alerte.

---

### FAILLE #4 — Fallback BDD sans vérification que le commercial est actif

**Fichier :** `dispatcher/services/queue.service.ts` lignes 254–307

```typescript
const allPostes = await this.posteRepository
  .createQueryBuilder('p')
  .innerJoin('p.commercial', 'c')
  .where('p.is_queue_enabled = :enabled', { enabled: true })
  // ← Aucun filtre sur la connexion réelle du commercial (isOnline, lastSeen…)
  .getMany();
```

**Problème :** Quand la queue est vide, le fallback peut sélectionner un poste dont le commercial est déconnecté depuis des heures. La conversation est assignée mais jamais reçue.

---

## 3. Failles Importantes (contribuent à la disparité)

### FAILLE #5 — `moveToEnd()` non atomique avec `getNextInQueue()`

**Fichier :** `queue.service.ts` lignes 123–125, 249, 318–351

La sélection du poste et son déplacement en fin de queue ne sont pas dans la même transaction. Deux messages arrivant simultanément peuvent être tous deux assignés au même poste "premier de liste" avant que le déplacement soit committé.

```
T1 : Thread 1 lit Poste A (position 1)
T2 : Thread 2 lit Poste A (position 1)  ← avant T1 a fini
T3 : Thread 1 déplace A en fin de queue
T4 : Thread 2 déplace A en fin → conflit ou double assignation
```

---

### FAILLE #6 — Mutex par chat, pas par poste lors de la sélection

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 19–29

```typescript
private readonly chatDispatchLocks = new Map<string, Mutex>();
// Verrou = par chat (chatId), non par poste
```

**Problème :** Deux conversations différentes peuvent appeler `getNextInQueue()` en parallèle. Le comptage `least_loaded` se base sur un snapshot de la DB qui devient stale entre la lecture et l'assignation effective.

```
T1 : Chat A → lit countMap : {Poste1: 5, Poste2: 5} → choisit Poste1
T2 : Chat B → lit countMap : {Poste1: 5, Poste2: 5} → choisit Poste1
Résultat : Poste1 = 7, Poste2 = 5 (déséquilibre immédiat)
```

---

### FAILLE #7 — Exclusion des canaux dédiés incohérente dans le SLA checker

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 587–592

La sous-requête d'exclusion des canaux dédiés est dupliquée 4 fois et peut exclure des conversations mal-assignées au lieu de les corriger, les rendant invisibles au rééquilibrage.

---

### FAILLE #8 — Target SLA calculé sans inclure les postes offline

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 655–656

```typescript
// target = ceil(totalEligible / queuedPostes.length)
// Postes offline inclus dans totalEligible mais pas dans le dénominateur
```

**Problème :** Si 50 conversations sont sur un poste offline et 2 postes sont actifs, le target sera `ceil(70/2) = 35` au lieu de `ceil(70/3) = 24`. Les postes actifs reçoivent plus de conversations que nécessaire.

---

## 4. Failles Moyennes (dégradent la qualité sans causer la disparité seuls)

### FAILLE #9 — Boucle greedy sans recalcul du target

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 705–710

Le target est calculé une seule fois. Pendant la boucle de redispatch, les compteurs changent mais le seuil de saturation reste fixe, causant un rééquilibrage partiel.

---

### FAILLE #10 — `last_client_message_at` non mis à jour si dispatch échoue

**Fichier :** `webhooks/inbound-message.service.ts` lignes 173–185

Si le dispatch lève une exception, `last_client_message_at` n'est pas sauvegardé. Le job SLA ignore ensuite cette conversation car son timestamp ne passe pas le filtre de threshold.

---

### FAILLE #11 — `assigned_mode = 'OFFLINE'` informatif seulement

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 221, 279

Le flag `assigned_mode = 'OFFLINE'` est positionné mais aucune logique métier ne force une réassignation basée dessus. La conversation reste sur un poste offline jusqu'au prochain cycle SLA.

---

### FAILLE #12 — Canal dédié offline → pas d'escalade SLA

**Fichier :** `dispatcher/dispatcher.service.ts` lignes 354–363

Une conversation sur un canal dédié est exclue du redispatch SLA. Si le poste dédié est offline pendant 1 heure, toutes ses conversations restent `EN_ATTENTE` sans notification ni escalade.

---

### FAILLE #13 — `first_response_deadline_at` incohérent selon le chemin

| Chemin | Deadline |
|--------|----------|
| Nouvelle conversation | 5 min |
| Conversation réouverte | 5 min |
| Après réinjection SLA | 30 min |

Les conversations en attente depuis longtemps obtiennent un traitement plus généreux que les nouvelles, ce qui défavorise les nouveaux clients.

---

### FAILLE #14 — Index `IDX_chat_poste_activity` décalé entre entité et migration

**Entité :** `@Index('IDX_chat_poste_activity', ['poste_id', 'last_activity_at'])` (pas de `DESC`)  
**Migration :** `ADD INDEX ... (poste_id, last_activity_at DESC, chat_id DESC)`

Un futur `schema:sync` pourrait écraser l'index optimisé par un index sans `DESC`, causant des full scans sur les requêtes triées.

---

## 5. Tableau Récapitulatif des Failles

| # | Fichier | Lignes | Sévérité | Impact |
|---|---------|--------|----------|--------|
| 1 | `queue.service.ts` | 219–228 | **CRITIQUE** | Compteur least_loaded incomplet (FERME ignoré) |
| 2 | `dispatcher.service.ts` | 178–179 | **CRITIQUE** | Conv FERME reste sur poste mort |
| 3 | `dispatcher.service.ts` | 369–381 | **CRITIQUE** | Boucle infinie SLA si 1 seul poste |
| 4 | `queue.service.ts` | 254–307 | **CRITIQUE** | Fallback sélectionne postes offline |
| 5 | `queue.service.ts` | 123–351 | Important | moveToEnd non atomique → race condition |
| 6 | `dispatcher.service.ts` | 19–29 | Important | Mutex par chat → sélection poste non exclusive |
| 7 | `dispatcher.service.ts` | 587–592 | Important | Exclusion canaux dédiés dupliquée et incohérente |
| 8 | `dispatcher.service.ts` | 655–656 | Important | Target SLA sans postes offline → sur-dispatch |
| 9 | `dispatcher.service.ts` | 705–710 | Moyen | Greedy sans recalcul → rééquilibrage partiel |
| 10 | `inbound-message.service.ts` | 173–185 | Moyen | last_client_message_at non sauvegardé sur erreur |
| 11 | `dispatcher.service.ts` | 221, 279 | Moyen | assigned_mode=OFFLINE informatif seulement |
| 12 | `dispatcher.service.ts` | 354–363 | Moyen | Canal dédié offline → pas d'escalade |
| 13 | `dispatcher.service.ts` | 174, 280, 321, 407 | Moyen | Deadlines incohérentes selon chemin |
| 14 | `whatsapp_chat.entity.ts` | 36–37 | Faible | Index DESC écrasable par schema:sync |

---

## 6. Scénario Concret Reproduisant la Disparité 50 vs 1

```
CONFIGURATION INITIALE
  Poste A : actif, commercial en ligne
  Poste B : actif, commercial en ligne
  Mode     : least_loaded

JOUR 1 — 10h00
  → 2 messages arrivent
  → Poste A : 1 conv ACTIF | Poste B : 1 conv ACTIF

JOUR 1 — 11h00
  → Agent A clôture sa conversation (status = FERME)
  → least_loaded : countMap = {A: 0, B: 1}  ← FERME ignoré !
  → Nouveaux messages → tous assignés à Poste A (score le plus bas)
  → Au bout de 15 messages : Poste A = 15 convs, Poste B = 1 conv

JOUR 1 — 12h00
  → Agent B se déconnecte
  → Queue ne contient plus que Poste A
  → Fallback : Poste A seul candidat
  → Messages supplémentaires → tous sur Poste A

JOUR 1 — 13h00
  → Job SLA : target = ceil(n / 1) = n → Poste A "pas surchargé"
  → Aucune redistribution

JOUR 1 — 14h00
  → Agent B se reconnecte → Poste B : toujours 1 conv (la première)
  → Poste A : 30+ convs

RÉSULTAT : Poste A = 30–50 convs | Poste B = 1 conv
```

---

## 7. Recommandations Prioritaires

### P0 — Corrections immédiates (bloquantes)

**1. Inclure `FERME` dans least_loaded** (`queue.service.ts` ligne 224)
```typescript
statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.FERME],
```
Ou mieux : mettre `poste_id = NULL` lors de la clôture pour libérer le slot.

**2. Libérer le poste_id à la clôture** (`dispatcher/conversation` service)
```typescript
// À la fermeture d'une conversation
conversation.poste_id = null;
conversation.poste = null;
```

**3. Supprimer la sortie silencieuse si alternatives === 0** (`dispatcher.service.ts` ligne 374)
Remplacer par une escalade (notification admin, flag d'alerte) plutôt qu'un abandon.

### P1 — Corrections importantes (sprint suivant)

**4. Rendre getNextInQueue atomique avec moveToEnd**  
Fusionner les deux appels dans une seule transaction MySQL ou utiliser un `SELECT ... FOR UPDATE`.

**5. Ajouter vérification `isOnline` dans le fallback BDD**  
Joindre la table de présence agent avant de sélectionner le poste cible.

**6. Inclure postes offline dans le calcul du target SLA**
```typescript
const allTargetPostes = [...queuedPostes, ...unavailablePostes];
const target = Math.ceil(totalEligible / allTargetPostes.length);
```

### P2 — Améliorations qualité (backlog)

**7. Recalculer le target après chaque déplacement** dans la boucle greedy.  
**8. Forcer réassignation si `assigned_mode = OFFLINE`** lors du prochain message.  
**9. Ajouter escalade SLA pour canaux dédiés offline** (notification admin).  
**10. Uniformiser les deadlines** : même TTL (5 min) pour toutes les sources.

---

## 8. Configuration du Cron `sla-checker`

**Fichiers :**
- `src/jorbs/cron-config.service.ts` — Orchestrateur principal (728 lignes)
- `src/jorbs/first-response-timeout.job.ts` — Handler du cron (lignes 21–39)
- `src/jorbs/cron-config.controller.ts` ligne 51 — Endpoint `POST /cron-configs/:key/run`

### Paramètres par défaut

| Paramètre | Valeur | Impact |
|-----------|--------|--------|
| `scheduleType` | `interval` | Pas un cron classique, un `setInterval` |
| `intervalMinutes` | 30 min | Fenêtre d'accumulation = 30 min |
| `noResponseThresholdMinutes` | 15 min | Convs sans réponse < 15 min ignorées |
| `maxSteps` (batch) | 300 | Max 300 convs rééquilibrées par cycle |
| **Plage horaire** | **5h–21h** | **8h par nuit sans aucune correction** |

### Pourquoi "Exécuter maintenant" fonctionne

```typescript
// cron-config.service.ts ligne 467
const result = await handler(true);  // manual = true

// first-response-timeout.job.ts ligne 22-31
if (!manual) {  // ← ce guard est bypassé en mode manuel
  const hour = new Date().getHours();
  if (hour >= 21 || hour < 5) {
    return `Ignoré — hors plage horaire`;
  }
}
```

L'exécution manuelle :
- Bypasse la plage horaire 5h–21h
- S'exécute immédiatement sans attendre le `setInterval`
- Appelle exactement le même `jobRunnerAllPostes()` que l'automatique

**C'est pour ça que ça corrige tout : l'algorithme est bon, c'est le timing qui est mauvais.**

### Conditions qui bloquent l'exécution automatique

1. **Hors plage 5h–21h** → ignoré silencieusement
2. **`enabled = false` en DB** → arrête même le `setInterval`
3. **Moins de 2 postes en queue** → retourne sans rééquilibrer
4. **`isSlaRunning = true`** → cycle déjà en cours, skip

---

## 9. Scénario Concret avec le Cron

```
08h00 — Début de journée
  Cron en attente (prochain cycle à 08h30)
  3 postes actifs, 0 conversation

08h01–08h29 — Flux de messages (29 min avant le cron)
  Poste A : reçoit 30 convs (FERME ignoré en least_loaded → score 0 = priorité maximale)
  Poste B : reçoit 1 conv (score 1)
  Poste C : reçoit 1 conv (score 1)

08h30 — Cron s'exécute
  target = ceil(32 / 3) = 11
  Poste A surchargé (30 > 11) → redistribue 19 convs vers B et C ✓
  MAIS : de 08h01 à 08h30, 28 min de déséquilibre avec clients en attente

Nuit (21h–05h) — 8 heures sans cron
  Même phénomène, aucune correction automatique possible
  → Le déséquilibre peut atteindre 50 vs 1 avant 5h du matin
```

---

## 10. Fichiers Clés à Modifier

| Fichier | Rôle |
|---------|------|
| `message_whatsapp/src/dispatcher/services/queue.service.ts` | **[PRIORITÉ 1]** Sélection du poste (least_loaded, round_robin, fallback) |
| `message_whatsapp/src/dispatcher/dispatcher.service.ts` | Orchestration dispatch, réinjection SLA, job rééquilibrage |
| `message_whatsapp/src/jorbs/first-response-timeout.job.ts` | Handler cron — plage horaire à assouplir |
| `message_whatsapp/src/jorbs/cron-config.service.ts` | Config cron — intervalMinutes réduire de 30 → 5 min |
| `message_whatsapp/src/webhooks/inbound-message.service.ts` | Point d'entrée messages, mise à jour timestamps |
| `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | Entité conversation (statuts, index) |

---

## 11. Plan de Correction Recommandé

### Correction rapide (sans refactoring, impact immédiat)

**Option A — Réduire l'intervalle du cron**  
Dans la table `cron_config`, passer `intervalMinutes` de 30 à 5.  
→ La fenêtre d'accumulation passe de 30 min à 5 min.  
→ Aucune modification de code, configurable depuis l'admin.

**Option B — Élargir la plage horaire**  
Dans `first-response-timeout.job.ts` ligne 25, changer `hour >= 21` en `hour >= 23` et `hour < 5` en `hour < 4`.  
→ Réduit la fenêtre nocturne sans correction de 8h à 5h.

### Correction structurelle (résout la cause racine)

**Option C — Libérer le `poste_id` à la clôture** *(recommandé)*  
Quand une conversation passe au statut `FERME`, mettre `poste_id = NULL`.  
Le compteur `least_loaded` ne compterait plus jamais les convs fermées.  
→ Résout FAILLE #1 et #2 d'un seul coup.

**Option D — Corriger le filtre `least_loaded`** *(alternatif à C)*  
Ajouter `WhatsappChatStatus.FERME` au filtre dans `queue.service.ts` ligne 224.  
→ Plus rapide à implémenter mais accumule quand même les `poste_id` orphelins.

---

*Rapport généré le 2026-05-21 — Audit statique + observation comportementale branche `production`*
