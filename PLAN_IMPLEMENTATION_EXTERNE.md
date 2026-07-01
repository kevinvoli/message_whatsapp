# Plan d'implémentation — Services externes

> Branche : `production` · Référence : `RAPPORT_ARCHITECTURE.md`
> Scope : fonctionnalités nécessitant un service externe au projet (cloud, infrastructure tierce)
> **Ces implémentations sont différées** jusqu'à validation du budget et de la configuration infrastructure.

---

## Règles de développement durable — RAPPEL OBLIGATIONS

```
R1. Toute nouvelle feature backend doit avoir ≥ 1 test unitaire sur le service
R4. Zéro `any` TypeScript — bloquant en PR review
R7. Les constantes Socket.IO ne sont jamais dupliquées — shared package uniquement
```

## Points d'excellence à préserver

```
E1. Sécurité webhooks — HMAC + timingSafeEqual + idempotency
     → Toute intégration externe doit valider les signatures entrantes
     → Pas de secrets dans les logs ni dans les payloads stockés

E3. CI/CD avec migrations auto
     → Toute migration de données (ex : médias → R2) doit être réversible
     → Les scripts de migration one-shot sont testés sur staging avant production
```

---

## Stratégie anti-régression globale — Services externes

Les services externes introduisent un vecteur de défaillance supplémentaire : **la disponibilité du service tiers**.
Chaque phase applique obligatoirement ces principes :

```
1. CIRCUIT BREAKER — si le service externe est indisponible, le code bascule sur un fallback local
2. FEATURE FLAG — tout service externe est activable/désactivable sans redéploiement
3. STAGING FIRST — validation sur staging avec le service réel avant production
4. MIGRATION RÉVERSIBLE — toute migration de données peut être annulée sans perte
5. OBSERVABILITÉ — logger les appels externes (latence, erreurs) dès le premier déploiement
```

---

## Phase A — File de messages robuste — Redis + BullMQ (Jalon J2)

### Contexte

**Problème actuel :** `WebhookDegradedQueueService` stocke les tâches webhook en `Map` mémoire.
Un redémarrage du process = perte des messages en cours de traitement.

**Note :** `ioredis` est déjà dans les dépendances. Redis est déjà dans `.env.example`. Infrastructure préparée.

### A.1 Infrastructure Redis

**Option 1 — Auto-hébergé :**
```yaml
# docker-compose.yml — ajout
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
  volumes: [redis_data:/data]
  ports: ["6379:6379"]
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    retries: 5
```

**Variables d'environnement :**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
FF_BULLMQ_WEBHOOK=false   # désactivé par défaut — activer progressivement
```

### A.2 Migration WebhookDegradedQueueService → BullMQ

**Installation :**
```bash
npm install @nestjs/bullmq bullmq
```

**Architecture cible :**
```
Webhook entrant
  → [HMAC validation — E1 toujours actif]
  → UnifiedIngressService (idempotency check)
  → BullMQ queue "webhook-inbound" (persisté en Redis)
    → WebhookWorker (concurrence : 20)
      → InboundMessageService → DispatcherService
```

**Migration progressive :**
```typescript
// UnifiedIngressService — feature flag obligatoire
if (process.env.FF_BULLMQ_WEBHOOK === 'true') {
  await this.webhookProducer.enqueue(provider, payload, eventId);
} else {
  await this.legacyDegradedQueue.enqueue(provider, payload);
}
```

**Effort :** 4 jours

---

#### Risques de régression — Phase A

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| RA.1 | Redis est indisponible → toute réception de webhook est bloquée (exception non catchée) | **Perte de tous les messages WhatsApp entrants** | **Critique** |
| RA.2 | La concurrence BullMQ (20 workers simultanés) sature le pool de connexions MySQL (30 max) | Backend en deadlock DB — service dégradé ou planté | **Critique** |
| RA.3 | Double-processing d'un webhook : le `eventId` est dans l'idempotency cache mais le job BullMQ est rejoué après un crash | Message reçu en double côté commercial | Élevée |
| RA.4 | Le feature flag `FF_BULLMQ_WEBHOOK` est activé sur prod avant que le worker BullMQ soit déployé | Jobs mis en file mais jamais consommés — accumulation infinie | Élevée |
| RA.5 | Les jobs en échec (failed queue) s'accumulent et saturent la mémoire Redis | Redis OOM → indisponibilité | Moyenne |

**Prévention — Circuit breaker Redis obligatoire :**

```typescript
// webhook-producer.service.ts
async enqueue(provider: string, payload: unknown, eventId: string): Promise<void> {
  try {
    await this.queue.add(provider, { provider, payload, eventId }, {
      jobId:          eventId,
      attempts:       3,
      backoff:        { type: 'exponential', delay: 2_000 },
      removeOnComplete: 500,
      removeOnFail:   200,   // garder seulement 200 jobs en erreur (limite Redis)
    });
  } catch (err) {
    // Circuit breaker : si Redis est indisponible, fallback sur la file mémoire
    this.logger.error(`BullMQ unavailable, falling back to memory queue: ${err.message}`);
    await this.legacyDegradedQueue.enqueue(provider, payload);
    // Alerte monitoring
    this.metricsService?.webhookFallback?.inc({ provider });
  }
}
```

**Limite de concurrence worker ≤ 15** (laisse 15 connexions MySQL libres pour le reste) :
```typescript
@Processor('webhook-inbound', { concurrency: 15 })  // pas 20
```

**Test de non-régression BullMQ (R1) :**
```typescript
// webhook-producer.service.spec.ts
describe('WebhookProducerService', () => {
  it('bascule sur la file mémoire si Redis est indisponible', async () => {
    mockQueue.add.mockRejectedValue(new Error('Redis connection refused'));
    await producer.enqueue('whapi', {}, 'evt-123');
    expect(mockLegacyQueue.enqueue).toHaveBeenCalledWith('whapi', {});
  });

  it('déduplication : deux appels avec le même eventId → un seul job', async () => {
    await producer.enqueue('whapi', {}, 'evt-dup');
    await producer.enqueue('whapi', {}, 'evt-dup');
    expect(mockQueue.add).toHaveBeenCalledTimes(1);  // BullMQ déduplique par jobId
  });

  it('les secrets ne sont jamais loggués dans les erreurs', async () => {
    mockQueue.add.mockRejectedValue(new Error('Redis error'));
    await producer.enqueue('meta', { token: 'SECRET' }, 'evt-secret');
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('SECRET'));
  });
});
```

**Ordre de déploiement obligatoire :**
1. Déployer Redis (healthcheck OK)
2. Déployer le backend avec `FF_BULLMQ_WEBHOOK=false` (pas de changement de comportement)
3. Vérifier en staging que le worker consomme bien les jobs (tester avec un webhook réel)
4. Activer `FF_BULLMQ_WEBHOOK=true` sur staging pendant 24h, vérifier les métriques
5. Activer sur production **uniquement** après validation staging

**Rollback :**
```bash
# Immédiat — aucun redéploiement requis
FF_BULLMQ_WEBHOOK=false   # redis-cli set ou modification .env + restart backend
# Les jobs restants dans Redis seront drainés automatiquement au prochain redémarrage
```

**Smoke test post-déploiement :**
- [ ] Envoyer un message WhatsApp depuis le téléphone → reçu côté commercial ✅
- [ ] Redémarrer le backend pendant un webhook → message reçu malgré tout ✅
- [ ] Couper Redis → message reçu via fallback mémoire, log warn visible ✅
- [ ] BullBoard (si installé) montre 0 failed jobs ✅

---

## Phase B — Stockage médias externe — Cloudflare R2 (Jalon J3)

### Contexte

**Problème actuel :**
- Médias stockés sur le filesystem Docker — risque de perte si volume non persisté
- Téléchargements servis par l'API NestJS → charge sur le serveur

**Cloudflare R2 :** compatible S3, sans frais d'egress, CDN Cloudflare intégré.

### B.1 Configuration R2

**Variables d'environnement :**
```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=whatsapp-media
R2_PUBLIC_URL=https://cdn.votre-domaine.com
FF_R2_STORAGE=false   # désactivé par défaut
```

### B.2 Abstraction `IMediaStorage`

```typescript
export interface IMediaStorage {
  save(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  healthCheck(): Promise<boolean>;   // requis pour le circuit breaker
}
```

**Effort :** 5 jours

---

#### Risques de régression — Phase B

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| RB.1 | R2 est indisponible pendant un webhook → le message est reçu mais la photo est perdue | Médias manquants sans notification au commercial | **Critique** |
| RB.2 | La migration des médias existants écrase `local_url` avant que R2 soit confirmé → rollback impossible | Perte définitive des URLs de médias | **Critique** |
| RB.3 | Les anciennes URLs locales (`/uploads/media/...`) deviennent des liens morts après la migration | Toutes les images dans les conversations historiques cassées | **Critique** |
| RB.4 | L'upload vers R2 est synchrone et ajoute de la latence au traitement du webhook | Timeouts sur les webhooks avec médias | Élevée |
| RB.5 | Les credentials R2 expirent ou sont révoqués → plus aucun upload possible | Médias non téléchargés sans alerte | Moyenne |

**Prévention :**

**Circuit breaker R2 avec fallback local obligatoire :**
```typescript
// r2-media-storage.ts
async save(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  try {
    await this.client.send(new PutObjectCommand({ ... }));
    return this.getUrl(key);
  } catch (err) {
    this.logger.error(`R2 upload failed for ${key}: ${err.message}`);
    // Fallback : sauvegarder en local + marquer pour re-upload ultérieur
    const localUrl = await this.localFallback.save(key, buffer, mimeType);
    await this.pendingUploads.markForRetry(key);   // table pending_r2_uploads
    return localUrl;
  }
}
```

**L'upload R2 reste asynchrone** (comme l'existant avec `setImmediate`) — ne jamais bloquer le webhook :
```typescript
// MediaStorageService.saveMedia()
setImmediate(async () => {
  await this.storage.save(key, buffer, mimeType);  // R2 ou local selon FF
});
```

**Stratégie de migration des médias existants — IRRÉVERSIBLE → procédure stricte :**

```sql
-- ÉTAPE 0 : Snapshot complet avant migration
-- Rollback : restaurer ce snapshot
CREATE TABLE whatsapp_media_backup_20260701 AS SELECT * FROM whatsapp_media;
```

```typescript
// Script de migration — JAMAIS en one-shot brutal
// Traiter par batch de 100, avec rollback par batch
async migrateBatch(offset: number, limit: number) {
  const medias = await this.mediaRepo.find({
    where: { localPath: Not(IsNull()), r2Url: IsNull() },
    skip: offset, take: limit,
  });

  for (const media of medias) {
    try {
      const r2Url = await this.r2.save(media.mediaId, readFile(media.localPath), media.mimeType);
      // Ne jamais supprimer local_url — ajouter r2_url à côté
      await this.mediaRepo.update(media.id, { r2Url });
    } catch (err) {
      this.logger.error(`Migration failed for ${media.id}: ${err.message}`);
      // Continuer — ne pas bloquer la migration entière pour 1 fichier
    }
  }
}
```

**Ne JAMAIS supprimer les fichiers locaux** tant que `FF_R2_STORAGE=true` n'est pas validé en production depuis ≥ 7 jours.

**Conservation des anciennes URLs locales :**
Quand `FF_R2_STORAGE=true`, `getUrl()` retourne l'URL R2. Mais `local_url` reste en BDD comme fallback.
Si la migration doit être annulée : `FF_R2_STORAGE=false` → `getUrl()` retourne à nouveau `local_url`.

**Tests de non-régression (R1) :**
```typescript
describe('R2MediaStorage', () => {
  it('bascule sur le fallback local si R2 est indisponible', async () => {
    mockS3Client.send.mockRejectedValue(new Error('R2 unavailable'));
    const url = await storage.save('test.jpg', buffer, 'image/jpeg');
    expect(url).toMatch(/\/uploads\/media\//);  // URL locale, pas R2
    expect(mockPendingUploads.markForRetry).toHaveBeenCalled();
  });

  it('ne logge jamais les credentials R2', async () => {
    mockS3Client.send.mockRejectedValue(new Error('InvalidAccessKeyId'));
    await storage.save('test.jpg', buffer, 'image/jpeg');
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining(process.env.R2_SECRET_ACCESS_KEY)
    );
  });
});
```

**Rollback complet :**
```bash
# 1. Désactiver R2
FF_R2_STORAGE=false

# 2. Si des médias ont perdu leur local_url (ne doit pas arriver avec la procédure ci-dessus)
UPDATE whatsapp_media m
JOIN whatsapp_media_backup_20260701 b ON m.id = b.id
SET m.local_url = b.local_url, m.local_path = b.local_path
WHERE m.local_url IS NULL;
```

**Smoke test post-déploiement :**
- [ ] Envoyer une image WhatsApp → reçue et affichée (URL R2) ✅
- [ ] Couper R2 → image sauvegardée en local, log warn visible ✅
- [ ] Les conversations historiques avec d'anciennes images → toujours affichées (local_url fallback) ✅
- [ ] Aucune credential R2 dans les logs ✅

---

## Phase C — Tracing distribué — OpenTelemetry (Jalon J3)

### Contexte

**Problème actuel :** impossible de corréler webhook entrant → traitement → événement Socket.IO.

**Infrastructure Jaeger all-in-one (staging) :**
```yaml
jaeger:
  image: jaegertracing/all-in-one:1.58
  environment:
    COLLECTOR_OTLP_ENABLED: "true"
  ports:
    - "16686:16686"   # UI
    - "4318:4318"     # OTLP HTTP
```

**Installation backend :**
```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
            @opentelemetry/exporter-trace-otlp-http
```

**Variables d'environnement :**
```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
OTEL_SERVICE_NAME=whatsapp-backend
OTEL_TRACES_SAMPLER_ARG=0.1   # 10% en production
FF_OTEL_ENABLED=false          # désactivé par défaut
```

**Effort :** 3 jours

---

#### Risques de régression — Phase C

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| RC.1 | L'initialisation OTEL dans `main.ts` échoue → le backend ne démarre pas du tout | Service totalement indisponible | **Critique** |
| RC.2 | L'export OTEL vers Jaeger est synchrone et ajoute de la latence sur chaque requête webhook | SLA breaches — commerciaux voient les messages avec du retard | Élevée |
| RC.3 | L'instrumentation automatique (`auto-instrumentations-node`) intercepte les connexions MySQL et les ralentit | Dégradation globale des performances | Moyenne |
| RC.4 | Jaeger est indisponible → l'exporter OTEL retente indéfiniment et consomme des ressources | Leak mémoire graduel sur le backend | Moyenne |
| RC.5 | Le sampler à 10% est mal configuré → 100% des traces exportées → Jaeger saturé | Perte de toutes les traces, Jaeger OOM | Faible |

**Prévention :**

**Initialisation OTEL dans un `try/catch` — le process ne doit JAMAIS planter à cause d'OTEL :**
```typescript
// src/tracing.ts
let sdk: NodeSDK | null = null;

if (process.env.FF_OTEL_ENABLED === 'true') {
  try {
    sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'whatsapp-backend',
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        timeoutMillis: 2_000,   // timeout court — ne jamais bloquer
      }),
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },  // trop verbeux
      })],
    });
    sdk.start();
  } catch (err) {
    console.error('[OTEL] Failed to start — tracing disabled:', err.message);
    // Le backend continue sans OTEL
  }
}

process.on('SIGTERM', async () => { await sdk?.shutdown(); });
```

**Export asynchrone avec timeout court :**
- `timeoutMillis: 2_000` — si Jaeger ne répond pas en 2s, l'exporter abandonne la trace
- L'export OTEL est toujours asynchrone (ne bloque pas la réponse HTTP)

**Sampler explicite :**
```typescript
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

spanProcessor: new BatchSpanProcessor(exporter, {
  maxQueueSize: 2048,        // limite la mémoire utilisée par les spans en attente
  scheduledDelayMillis: 5_000,
}),
sampler: new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(
    parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG ?? '0.1')
  ),
}),
```

**Tests de non-régression (R1) :**
```typescript
describe('TracingService', () => {
  it('le backend démarre même si OTEL échoue à s\'initialiser', async () => {
    process.env.FF_OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://invalid-host:4318';
    // Ne doit pas throw — le backend continue sans OTEL
    await expect(initTracing()).resolves.not.toThrow();
  });
});
```

**Ordre de déploiement :**
1. Déployer avec `FF_OTEL_ENABLED=false` — aucun impact
2. Activer `FF_OTEL_ENABLED=true` sur staging pendant 48h, monitorer la latence des webhooks
3. Vérifier que P99 webhook latency n'augmente pas de plus de 5%
4. Activer sur production avec sampler à 5% d'abord, puis monter à 10%

**Rollback :**
```bash
FF_OTEL_ENABLED=false   # désactivation immédiate sans redéploiement
```

**Smoke test post-déploiement :**
- [ ] Envoyer un message WhatsApp → trace visible dans l'UI Jaeger ✅
- [ ] Couper Jaeger → webhooks continuent d'être traités normalement ✅
- [ ] Latence webhook P99 stable (± 5%) après activation OTEL ✅
- [ ] Mémoire backend stable après 24h avec OTEL actif ✅

---

## Phase D — Observabilité complète — Loki + Grafana + Prometheus (Jalon J4)

### Contexte

**Problème actuel :** logs sur disque non interrogeables sans SSH. Aucune alerte automatique.

**Stack :**
```yaml
# docker-compose.observability.yml
services:
  prometheus:
    image: prom/prometheus:v2.53.0
    volumes: [./config/prometheus.yml:/etc/prometheus/prometheus.yml]
    ports: ["9090:9090"]

  loki:
    image: grafana/loki:3.0.0
    volumes: [loki_data:/loki]
    ports: ["3100:3100"]

  promtail:
    image: grafana/promtail:3.0.0
    volumes:
      - ./logs:/app/logs:ro   # volume partagé avec le backend
      - ./config/promtail.yml:/etc/promtail/config.yml

  grafana:
    image: grafana/grafana:11.0.0
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    ports: ["3030:3000"]
```

**Effort :** 4 jours

---

#### Risques de régression — Phase D

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| RD.1 | Promtail a accès en lecture aux logs qui contiennent des données sensibles (tokens, numéros de téléphone) → les logs sont indexés dans Loki et exposés à tous les utilisateurs Grafana | Fuite de données personnelles | **Critique** |
| RD.2 | L'endpoint `/metrics` (Prometheus) est exposé sans authentification → cartographie complète du système pour un attaquant | Fuite d'information système | Élevée |
| RD.3 | Loki sature le disque du serveur (logs non filtrés, rétention non configurée) | Serveur en panne disk-full — toute l'application tombe | Élevée |
| RD.4 | Les alertes Grafana sont mal calibrées → flood d'alertes à chaque nuit calme (faux positifs) | Alerte fatigue — les vraies alertes sont ignorées | Élevée |
| RD.5 | Le scraping Prometheus toutes les 15s génère une charge DB inattendue (si les métriques font des requêtes SQL) | Dégradation des performances backend | Moyenne |

**Prévention :**

**Masquage des données sensibles dans Promtail (obligatoire avant tout déploiement) :**
```yaml
# config/promtail.yml
pipeline_stages:
  - json:
      expressions:
        message: message
        level: level
  - replace:
      expression: '("token"\s*:\s*)"[^"]*"'
      replace:    '$1"[REDACTED]"'
  - replace:
      expression: '("webhook_secret"\s*:\s*)"[^"]*"'
      replace:    '$1"[REDACTED]"'
  - replace:
      # Masquer les numéros de téléphone (RGPD)
      expression: '\+?\d{10,15}'
      replace:    '[PHONE]'
```

**Endpoint `/metrics` protégé par token :**
```typescript
// metrics.controller.ts
@Get('metrics')
@UseGuards(PrometheusTokenGuard)   // vérifie Authorization: Bearer ${PROMETHEUS_TOKEN}
async getMetrics() { ... }
```

**Rétention Loki obligatoire :**
```yaml
# config/loki-config.yml
limits_config:
  retention_period: 720h   # 30 jours maximum
compactor:
  retention_enabled: true
```

**Alertes calibrées avec des délais d'évaluation raisonnables :**
```yaml
# Ne jamais alerter sur un spike < 5 minutes
- alert: WebhookErrorRate
  expr: rate(webhook_failed_total[5m]) / rate(webhook_received_total[5m]) > 0.05
  for: 5m    # alerte uniquement si le taux reste > 5% pendant 5 minutes
  labels:
    severity: critical
```

**Tests de non-régression métriques (R1) :**
```typescript
describe('MetricsService', () => {
  it('webhookReceived incrémente le counter par provider', () => {
    service.webhookReceived.labels('whapi').inc();
    const value = service.webhookReceived.hashMap['provider:whapi'].value;
    expect(value).toBe(1);
  });

  it('les métriques ne contiennent jamais de tokens ou de secrets', async () => {
    const metricsText = await collectDefaultMetrics();
    expect(metricsText).not.toMatch(/token|secret|password/i);
  });
});
```

**Ordre de déploiement :**
1. Déployer Loki + Promtail avec masquage activé sur staging
2. Vérifier manuellement dans l'UI Loki qu'aucun token ne s'affiche dans les logs
3. Déployer Prometheus + Grafana avec `/metrics` protégé
4. Créer les 4 dashboards en staging, calibrer les seuils d'alerte sur 7 jours de données réelles
5. Déployer sur production uniquement après validation des seuils d'alerte

**Rollback :**
```bash
# Stack d'observabilité totalement découplée du backend
docker compose -f docker-compose.observability.yml down
# Aucun impact sur le backend ou le front
```

**Smoke test post-déploiement :**
- [ ] Loki : logs visibles dans Grafana ✅
- [ ] Loki : aucun token ni numéro de téléphone dans les logs indexés ✅
- [ ] Prometheus : métriques webhook + dispatch visibles ✅
- [ ] `/metrics` retourne 401 sans token d'authentification ✅
- [ ] Dashboard Grafana : webhook rate-chart s'affiche en temps réel ✅
- [ ] Rétention Loki : configurée à 30 jours maximum ✅

---

## Récapitulatif — Tableau de bord

| Phase | Service externe | Effort | Criticité | Jalon | Risques critiques identifiés |
|---|---|---|---|---|---|
| A | Redis + BullMQ | 4j | P0 | J2 | Redis indisponible bloque tout (RA.1), pool MySQL saturé (RA.2) |
| B | Cloudflare R2 | 5j | P1 | J3 | Migration irréversible (RB.2), URLs historiques cassées (RB.3) |
| C | OpenTelemetry + Jaeger | 3j | P1 | J3 | OTEL crashe le bootstrap (RC.1), latence webhooks (RC.2) |
| D | Loki + Grafana + Prometheus | 4j | P1 | J4 | Fuite données dans Loki (RD.1), disk-full serveur (RD.3) |
| **Total** | | **~16j** | | | |

---

## Checklist universelle de non-régression — Services externes (avant chaque déploiement prod)

```
□ Feature flag désactivé par défaut (FF_*)
□ Circuit breaker implémenté avec fallback local testé
□ Le backend démarre normalement si le service externe est indisponible
□ Aucun secret (token, credential, numéro de téléphone) dans les logs du service externe
□ Rollback documenté et testé sur staging
□ Latence P99 validée sur staging (≤ +5% vs baseline) avant activation prod
□ Ordre de déploiement respecté (backend → validation 24h staging → prod)
□ Smoke tests post-déploiement tous verts avant de considérer la phase terminée
□ assertWhapiSecret() / assertMetaSignature() non modifiés (E1)
□ Migrations de données ont un snapshot de rollback (R3)
```
