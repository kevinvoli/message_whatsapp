# Rapport d'Analyse Redis — CPU 53%
> Analysé le 2026-06-23

## Métriques observées
- CPU Redis : **53%** (anormal)
- RAM : 13.95 MB
- Trafic entrant : 2.19 MB | Sortant : 830 KB

## Causes identifiées (par impact décroissant)

---

## 🔴 P0 — REDIS.KEYS() — Bloquant (20-30% CPU)

`KEYS pattern*` scanne TOUTES les clés en mémoire Redis. Opération O(N) qui gèle Redis pendant l'exécution.

| Fichier | Ligne | Pattern | Déclencheur |
|---|---|---|---|
| `src/rbac/rbac.service.ts` | ~200 | `rbac:perms:${tenantId}:*` | À chaque changement de rôle |
| `src/work-schedule/work-schedule.service.ts` | ~120 | `schedule:commercial:*` | À chaque modification planning |
| `src/redis/agent-presence.service.ts` | ~95 | `presence:commercial:*` | `getPresentAgents()` cron/poste |

**Fix** : Remplacer chaque `redis.keys()` par invalidation individuelle des clés connues, ou utiliser un index Redis Set.

---

## 🔴 P1 — Agent Presence SETEX — Refresh trop fréquent (15-25% CPU)

```
src/redis/agent-presence.service.ts:119 — @Interval(25_000)
```

À chaque cycle de 25s : **2 SETEX par agent actif** (commercial + poste).
- 30 agents connectés = 60 SETEX toutes les 25s = **2.4 ops/sec constant**
- TTL 45s avec refresh 25s = inutile, overlap de 20s

**Fix** :
1. Passer `@Interval(25_000)` → `@Interval(40_000)` (refresh avant expiration)
2. **Batching pipeline** : remplacer les SETEX individuels par `redis.pipeline()` → 1 round-trip au lieu de N

---

## 🔴 P2 — Socket.IO Redis Adapter PUBSUB (10-20% trafic)

```
src/whatsapp_message/whatsapp_message.gateway.ts — @WebSocketGateway
```

Chaque `server.to('poste:X').emit(...)` = 1 PUBLISH Redis. En multi-instance, chaque événement passe par Redis.

Sources les plus fréquentes :
- Chaque message entrant/sortant → PUBLISH
- Chaque typing indicator → PUBLISH
- Chaque changement de queue → PUBLISH global

**Fix** :
1. **Ne pas publier les TYPING indicators** sur Redis (non critiques)
2. **Batch les événements** : accumuler 100ms, PUBLISH une fois par poste

---

## 🟠 P3 — TTL trop courts sur les caches (5-10% CPU)

| Fichier | Clé | TTL actuel | TTL recommandé |
|---|---|---|---|
| `src/realtime/socket-list-cache.service.ts:85` | `queue:positions` | **3s** | 30s |
| `src/realtime/socket-list-cache.service.ts:33` | `socket:conversations:*` | 15s | 60s |
| `src/realtime/socket-list-cache.service.ts:68` | `socket:contacts:*` | 10s | 30s |

`queue:positions` à 3s → invalidation 0.33×/sec + recalcul DB constant.

---

## Tableau synthétique

| Rang | Source | CPU | Ops/sec | Fix |
|---|---|---|---|---|
| 1 | Agent Presence SETEX (25s) | Très élevé | ~2-5 | Pipeline + interval 40s |
| 2 | Socket.IO PUBSUB storm | Élevé | ~10-15 | Filtrer TYPING, batch events |
| 3 | REDIS.KEYS() scans | Élevé | 0.2-0.5 (bloquant) | Supprimer, index Set |
| 4 | Cache TTL courts (3-15s) | Moyen-élevé | ~0.5-1 | TTL 30-60s |
| 5 | Distributed locks (Redlock) | Moyen | 0.1-0.5 | OK, pas critique |

---

## Plan d'implémentation

### Sprint Redis-1 — P0 (estimé : ~2 jours)
- **R1** : `rbac.service.ts` — supprimer `redis.keys()`, invalider clés individuelles
- **R2** : `work-schedule.service.ts` — supprimer `redis.keys()`, index Set
- **R3** : `agent-presence.service.ts` — supprimer `redis.keys()`, Map in-process

### Sprint Redis-2 — P1 (estimé : ~1 jour)
- **R4** : `agent-presence.service.ts` — pipeline SETEX + interval 40s

### Sprint Redis-3 — P2 (estimé : ~1 jour)
- **R5** : `whatsapp_message.gateway.ts` — ne pas publier TYPING sur Redis
- **R6** : Batch les événements Socket.IO par poste (debounce 100ms)

### Sprint Redis-4 — P3 (estimé : ~0.5 jour)
- **R7** : `socket-list-cache.service.ts` — TTL 3s → 30s, 15s → 60s, 10s → 30s
