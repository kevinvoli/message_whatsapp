# Plan d'Implémentation — Analyse Expert Redis & Optimisation BDD
> Basé sur l'analyse du 2026-06-23

## Légende
- 🔴 P0 — Critique (bug, risque prod, N+1 interdit par CLAUDE.md)
- 🟠 P1 — Important (robustesse, performance sous charge)
- 🟡 P2 — Optimisation (référentiels, select explicite)
- XS < 1h | S — demi-journée | M — 1 jour | L — 2-3 jours

---

## Groupe 1 — N+1 interdits (règle CLAUDE.md : Zéro N+1) 🔴 P0

### N1 — `conversation-restriction.service.ts:209` : `.getOne()` par conversation

- **Fichier** : `src/conversation-restriction/conversation-restriction.service.ts:209-241`
- **Problème** : Pour chaque conversation, une sous-requête `.getOne()` charge le dernier message (`ORDER BY createdAt DESC LIMIT 1`). Sur N conversations = N requêtes séquentielles.
- **Effort** : M
- **Fix** :
  1. Collecter tous les `chat_id` des conversations à filtrer
  2. Une seule requête SQL avec sous-requête "dernier message par chat" :
  ```typescript
  // Sous-requête : dernier message from_me par chat_id
  const lastMessages = await this.messageRepo
    .createQueryBuilder('m')
    .select('m.chat_id', 'chatId')
    .addSelect('m.from_me', 'fromMe')
    .where('m.chat_id IN (:...chatIds)', { chatIds })
    .andWhere('m.id = (SELECT id FROM whatsapp_message WHERE chat_id = m.chat_id ORDER BY createdAt DESC LIMIT 1)')
    .getRawMany<{ chatId: string; fromMe: boolean }>();
  const lastMsgMap = new Map(lastMessages.map((r) => [r.chatId, r.fromMe]));
  ```
  3. Filtrer en mémoire avec `lastMsgMap.get(chatId)`
- **Alternative** : Si la table `whatsapp_last_message` ou un champ `last_message_from_me` existe sur `whatsapp_chat` → lire directement la colonne dénormalisée (0 jointure)

---

### N2 — `campaign-link.service.ts:204 & 267` : `findOne` channel par lien en boucle

- **Fichier** : `src/campaign-link/campaign-link.service.ts:204, 267`
- **Problème** : Dans une boucle sur les liens, `channelRepository.findOne({ where: { id: dto.channel_id } })` est appelé pour chaque lien.
- **Effort** : S
- **Fix** :
  ```typescript
  // Collecter les channel IDs uniques
  const channelIds = [...new Set(links.map((l) => l.channelId).filter(Boolean))];
  const channels = await this.channelRepository.findBy({ id: In(channelIds) });
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  // Dans la boucle → channelMap.get(link.channelId)
  ```

---

### N3 — `label.service.ts:93` : `findOneLabel` par label pour validation

- **Fichier** : `src/label/label.service.ts:93`
- **Problème** : Boucle de validation qui charge chaque label un par un.
- **Effort** : S
- **Fix** :
  ```typescript
  // Un seul find avec In()
  const found = await this.labelRepo.findBy({ id: In(labelIds) });
  if (found.length !== labelIds.length) {
    throw new NotFoundException('Un ou plusieurs labels introuvables');
  }
  ```

---

### N4 — `order-call-sync.service.ts:181` : `findOne` commercial par remplacement en boucle

- **Fichier** : `src/order-call-sync/order-call-sync.service.ts:181`
- **Problème** : Pour chaque appel à remplacer, `findOne` commercial séquentiel.
- **Effort** : S
- **Fix** : Pré-charger les commerciaux avec `In(commercialIds)` + Map avant la boucle (même pattern que DB-5, DB-7, DB-21).

---

## Groupe 2 — Redis : robustesse et correctness 🟠 P1

### RC1 — `channel.service.ts:61` : `cachedGet` local dupliqué sans error handling

- **Fichier** : `src/channel/channel.service.ts:61-70`
- **Problème** : Le service réimplémente sa propre version de `cachedGet` sans `try/catch`. Un `redis.get()` qui lève une exception fait planter la requête HTTP, alors que le helper partagé `redis-cache.helper.ts` catch et fait fallback sur la DB.
- **Effort** : S
- **Fix** :
  1. Identifier `src/redis/redis-cache.helper.ts` (ou équivalent)
  2. Remplacer la méthode locale `cachedGet` par le helper partagé
  3. Vérifier que le comportement (TTL, clés) est identique

---

### RC2 — Cache stampede : protection manquante sur les clés chaudes

- **Fichier** : `src/redis/redis-cache.helper.ts` + services à fort trafic
- **Problème** : Quand une clé expire (ex: `channel:id:*` TTL 120s, `dispatch-settings` TTL court), toutes les requêtes concurrentes rechargent la DB simultanément (thundering herd). Sur le chemin du dispatcher (chaque message entrant), c'est un pic de charge garanti.
- **Effort** : M
- **Fix — Stale-while-revalidate** :
  ```typescript
  async cachedGetSafe<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    const raw = await this.redis?.get(key).catch(() => null);
    if (raw) return JSON.parse(raw) as T;

    // Anti-stampede : seul un process recharge (lock 5s)
    const lockKey = `lock:revalidate:${key}`;
    const gotLock = await this.redis?.set(lockKey, '1', 'EX', 5, 'NX').catch(() => null);
    if (!gotLock) {
      // Attendre un peu et retenter le cache (le winner aura reloadé)
      await new Promise((r) => setTimeout(r, 50));
      const retry = await this.redis?.get(key).catch(() => null);
      if (retry) return JSON.parse(retry) as T;
    }

    const value = await loader();
    await this.redis?.setex(key, ttl, JSON.stringify(value)).catch(() => null);
    return value;
  }
  ```
- **Priorité** : Appliquer en premier sur les clés les plus chaudes : `channel:id:*`, `dispatch-settings`, `sla:rules:*`

---

### RC3 — Cache négatif non borné (null caché avec TTL plein)

- **Fichier** : `src/redis/redis-cache.helper.ts` + `src/channel/channel.service.ts`
- **Problème** : Quand `loader()` retourne `null` (entité introuvable), `null` est mis en cache avec le même TTL que les valeurs réelles. Si l'entité est créée ensuite, le cache retourne `null` pendant tout le TTL.
- **Effort** : S
- **Fix** :
  ```typescript
  const NULL_TTL = 15; // secondes — court pour les misses
  const effectiveTtl = value === null ? NULL_TTL : ttl;
  await this.redis?.setex(key, effectiveTtl, JSON.stringify(value));
  ```

---

### RC4 — BullMQ : `maxRetriesPerRequest: null` manquant

- **Fichier** : `src/queue/queue.module.ts:35`
- **Problème** : La connexion BullMQ n'a pas `maxRetriesPerRequest: null`. Sans ce paramètre, certaines versions d'ioredis font des retries automatiques qui perturbent BullMQ (erreurs ECONNRESET non déterministes).
- **Effort** : XS
- **Fix** :
  ```typescript
  connection: {
    host: host ?? 'localhost',
    port,
    password,
    maxRetriesPerRequest: null, // Requis par BullMQ
  }
  ```
- **Note** : Vérifier que la connexion BullMQ est SÉPARÉE de `REDIS_CLIENT` (ne pas partager un blocking client). Si c'est la même instance → créer une connexion dédiée BullMQ.

---

### RC5 — `notify-keyspace-events` via CONFIG SET — non compatible Redis managé

- **Fichier** : `src/redis/agent-presence.service.ts`
- **Problème** : `CONFIG SET notify-keyspace-events KEA` échoue silencieusement sur ElastiCache, Upstash, Redis Cloud (CONFIG SET interdit). Si la feature est essentielle, elle doit être configurée côté serveur Redis.
- **Effort** : XS
- **Fix** :
  1. Wrapper l'appel CONFIG SET dans un `try/catch` avec log warning clair
  2. Documenter dans `.env.example` : `# Redis managé : activer notify-keyspace-events côté serveur`
  3. Ajouter une variable d'environnement `REDIS_KEYSPACE_NOTIFICATIONS_SUPPORTED=true/false` pour conditionner l'appel

---

## Groupe 3 — Cache des référentiels stables 🟡 P2

### CA1 — `dispatch-settings` : rechargé à chaque message entrant

- **Fichier** : `src/dispatcher/services/queue.service.ts:307` (ou `dispatch-settings.service.ts`)
- **Problème** : Les dispatch-settings sont lus à chaque appel `getNextInQueue()` (chaque message entrant). Ces données changent très rarement (modification admin).
- **Effort** : S
- **Fix** : Utiliser `cachedGet('dispatch:settings', 300, () => this.settingsRepo.findOne(...))` + invalidation explicite à l'écriture (`DELETE cache après PATCH /queue/dispatch/settings`)

---

### CA2 — Règles SLA : déjà mis en cache mais inconsistant

- **Fichier** : `src/sla/sla.service.ts` — `getActiveRules()` utilise déjà le cache
- **Problème** : Certains appelants passent par `ruleRepo.find()` directement (contournement du cache vérifié en DB-2 et DB-14 Sprint 1-3).
- **Effort** : XS
- **Fix** : Audit final des appelants de `ruleRepo.find()` dans `sla.service.ts` — tous doivent passer par `getActiveRules()`.

---

### CA3 — `select` explicite sur les `find()` qui hydratent l'entité complète

- **Problème** : Plusieurs `find()` ou `findOne()` chargent toutes les colonnes alors qu'un seul champ est utilisé.
- **Effort** : S
- **Fix** : Auditer les `find()` dans les services à fort trafic (dispatcher, channel, queue) et ajouter `select: ['id', 'channel_id']` etc.
- **Exemple** :
  ```typescript
  // Avant
  const channel = await this.channelRepo.findOne({ where: { channel_id } });
  return channel?.poste_id;

  // Après
  const channel = await this.channelRepo.findOne({
    where: { channel_id },
    select: ['id', 'poste_id'],
  });
  return channel?.poste_id;
  ```

---

## Récapitulatif par sprint

| Sprint | Tâches | Effort | Gain attendu |
|---|---|---|---|
| **Sprint N+1** | N1 → N4 | ~3 jours | Suppression N+1 interdits (règle CLAUDE.md) |
| **Sprint Redis-Robustesse** | RC1 → RC5 | ~3 jours | Robustesse sous charge, anti-stampede, BullMQ |
| **Sprint Cache-Ref** | CA1 → CA3 | ~1 jour | Réduction rechargements référentiels stables |
| **Total** | **12 tâches** | **~7 jours** | |

---

## Ordre d'implémentation recommandé

```
Semaine 1 :
  N2 + N3 + N4  [S chacun — parallèles, pattern identique In() + Map]
  RC4           [XS — BullMQ maxRetriesPerRequest:null]
  RC5           [XS — try/catch CONFIG SET]
  RC3           [S — null TTL borné]
  RC1           [S — unifier cachedGet channel.service]

Semaine 2 :
  N1            [M — sous-requête last message]
  RC2           [M — anti-stampede stale-while-revalidate]
  CA1           [S — cache dispatch-settings]
  CA2 + CA3     [XS + S — SLA audit + select explicite]
```

---

## Ce qui est déjà bien (ne pas modifier)

- Graceful degradation `if (redis)` partout — **conserver**
- `DistributedLockService` via Redlock + `tryWithLock(fail-fast)` — **conserver**
- `AgentPresenceService` pipeline SETEX (après nos corrections R3+R4) — **conserver**
- BullMQ `removeOnComplete/removeOnFail` bornés — **conserver**
- `cachedGet` helper partagé avec fallback — **étendre** (RC1, RC2, RC3)
