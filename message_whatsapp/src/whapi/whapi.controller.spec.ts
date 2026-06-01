import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createHmac } from 'crypto';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';
import { ChannelService } from 'src/channel/channel.service';
import { UnifiedIngressService } from 'src/webhooks/unified-ingress.service';
import { WebhookRateLimitService } from './webhook-rate-limit.service';
import { WebhookTrafficHealthService } from './webhook-traffic-health.service';
import { WebhookDegradedQueueService } from './webhook-degraded-queue.service';
import { WebhookMetricsService } from './webhook-metrics.service';
import { WhatsappTemplateService } from 'src/whatsapp_template/whatsapp_template.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { createMocker } from 'src/test-utils/nest-mocker';

// ---------------------------------------------------------------------------
// Test basique (existant)
// ---------------------------------------------------------------------------

describe('WhapiController', () => {
  let controller: WhapiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhapiController],
      providers: [WhapiService],
    })
      .useMocker(createMocker)
      .compile();

    controller = module.get<WhapiController>(WhapiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Helpers Instagram
// ---------------------------------------------------------------------------

const IG_ACCOUNT_ID = 'ig-account-test-123';
const IG_SECRET = 'ig-test-secret';
const IG_VERIFY_TOKEN = 'ig-verify-token-abc';
const TENANT_ID = 'tenant-ig-test';

function igSignature(payload: unknown, secret = IG_SECRET): string {
  // Le controller tombe en fallback sur JSON.stringify(payload) quand rawBody est absent
  const buf = Buffer.from(JSON.stringify(payload));
  const digest = createHmac('sha256', secret).update(buf).digest('hex');
  return `sha256=${digest}`;
}

function makeIgPayload(mid = 'mid-001', text = 'bonjour'): object {
  return {
    object: 'instagram',
    entry: [
      {
        id: IG_ACCOUNT_ID,
        time: Date.now(),
        messaging: [
          {
            sender: { id: 'igsid-client-999' },
            recipient: { id: IG_ACCOUNT_ID },
            timestamp: Date.now(),
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mocks partagés
// ---------------------------------------------------------------------------

const mockChannelService = {
  hasMatchingVerifyToken: jest.fn(),
  findChannelByExternalId: jest.fn(),
};
const mockWhapiService = {
  isReplayEvent: jest.fn(),
  resolveTenantByProviderExternalId: jest.fn(),
};
const mockUnifiedIngress = { ingestInstagram: jest.fn() };
const mockRateLimit = { assertRateLimits: jest.fn() };
const mockHealth = {
  record: jest.fn(),
  isCircuitOpen: jest.fn().mockReturnValue(false),
};
const mockMetrics = {
  recordReceived: jest.fn(),
  recordDuplicate: jest.fn(),
  recordLatency: jest.fn(),
  recordError: jest.fn(),
  recordSignatureInvalid: jest.fn(),
  recordTenantResolutionFailed: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite Instagram webhook
// ---------------------------------------------------------------------------

describe('WhapiController — Instagram webhook', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Valeurs par défaut : happy path
    mockChannelService.hasMatchingVerifyToken.mockResolvedValue(true);
    mockChannelService.findChannelByExternalId.mockResolvedValue({
      channel_id: 'ig-channel-id',
      meta_app_secret: IG_SECRET,
      verify_token: IG_VERIFY_TOKEN,
    });
    mockWhapiService.resolveTenantByProviderExternalId.mockResolvedValue(TENANT_ID);
    mockWhapiService.isReplayEvent.mockResolvedValue('new');
    mockUnifiedIngress.ingestInstagram.mockResolvedValue(undefined);
    mockHealth.isCircuitOpen.mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhapiController],
      providers: [
        { provide: WhapiService, useValue: mockWhapiService },
        { provide: ChannelService, useValue: mockChannelService },
        { provide: UnifiedIngressService, useValue: mockUnifiedIngress },
        { provide: WebhookRateLimitService, useValue: mockRateLimit },
        { provide: WebhookTrafficHealthService, useValue: mockHealth },
        { provide: WebhookDegradedQueueService, useValue: {} },
        { provide: WebhookMetricsService, useValue: mockMetrics },
        { provide: WhatsappTemplateService, useValue: {} },
        { provide: WhatsappMessageGateway, useValue: {} },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /webhooks/instagram — vérification challenge
  // -------------------------------------------------------------------------

  describe('GET /webhooks/instagram — challenge', () => {
    it('retourne le challenge si verify_token valide', async () => {
      await request(app.getHttpServer())
        .get('/webhooks/instagram')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': IG_VERIFY_TOKEN,
          'hub.challenge': 'challenge-abc123',
        })
        .expect(200)
        .expect('challenge-abc123');
    });

    it('retourne 403 si verify_token invalide', async () => {
      mockChannelService.hasMatchingVerifyToken.mockResolvedValue(false);

      await request(app.getHttpServer())
        .get('/webhooks/instagram')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'mauvais-token',
          'hub.challenge': 'challenge-xyz',
        })
        .expect(403);
    });

    it("retourne 403 si hub.mode n'est pas 'subscribe'", async () => {
      await request(app.getHttpServer())
        .get('/webhooks/instagram')
        .query({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': IG_VERIFY_TOKEN,
          'hub.challenge': 'challenge-xyz',
        })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST /webhooks/instagram — signature HMAC
  // -------------------------------------------------------------------------

  describe('POST /webhooks/instagram — signature HMAC', () => {
    it('accepte un payload avec signature HMAC valide', async () => {
      const payload = makeIgPayload();
      const sig = igSignature(payload);

      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .set('x-hub-signature-256', sig)
        .send(payload)
        .expect((res) => {
          if (![200, 201].includes(res.status)) {
            throw new Error(`Attendu 200/201, reçu ${res.status}: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('retourne 401 si x-hub-signature-256 est absent', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .send(makeIgPayload('mid-no-sig'))
        .expect(401);
    });

    it('retourne 403 si la signature est incorrecte', async () => {
      const payload = makeIgPayload('mid-bad-sig');
      const sig = igSignature(payload, 'mauvais-secret');

      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .set('x-hub-signature-256', sig)
        .send(payload)
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST /webhooks/instagram — résolution canal / tenant
  // -------------------------------------------------------------------------

  describe('POST /webhooks/instagram — résolution canal', () => {
    it('retourne 422 si le canal est introuvable (ig_account_id inconnu)', async () => {
      // Pas de secret configuré → signature check ignorée en mode non-prod
      mockChannelService.findChannelByExternalId.mockResolvedValue(null);
      mockWhapiService.resolveTenantByProviderExternalId.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .send(makeIgPayload('mid-unknown'))
        .expect(422);
    });

    it('appelle ingestInstagram avec le bon contexte provider/tenant/channel', async () => {
      const payload = makeIgPayload('mid-ctx');
      const sig = igSignature(payload);

      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .set('x-hub-signature-256', sig)
        .send(payload)
        .expect((res) => {
          if (![200, 201].includes(res.status)) {
            throw new Error(`Attendu 200/201, reçu ${res.status}`);
          }
        });

      expect(mockUnifiedIngress.ingestInstagram).toHaveBeenCalledWith(
        expect.objectContaining({ object: 'instagram' }),
        { provider: 'instagram', tenantId: TENANT_ID, channelId: 'ig-channel-id' },
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /webhooks/instagram — validation payload
  // -------------------------------------------------------------------------

  describe('POST /webhooks/instagram — validation payload', () => {
    it("retourne 400 si object !== 'instagram'", async () => {
      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .send({ object: 'whatsapp_business_account', entry: [{ id: IG_ACCOUNT_ID }] })
        .expect(400);
    });

    it('retourne 400 si entry est absent', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .send({ object: 'instagram' })
        .expect(400);
    });

    it('retourne 400 si entry est un tableau vide', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .send({ object: 'instagram', entry: [] })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /webhooks/instagram — idempotence
  // -------------------------------------------------------------------------

  describe('POST /webhooks/instagram — idempotence', () => {
    it("retourne { status: 'duplicate_ignored' } pour un événement déjà traité", async () => {
      mockWhapiService.isReplayEvent.mockResolvedValue('duplicate');
      const payload = makeIgPayload('mid-dup');
      const sig = igSignature(payload);

      const res = await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .set('x-hub-signature-256', sig)
        .send(payload);

      expect([200, 201]).toContain(res.status);
      expect(res.body).toMatchObject({ status: 'duplicate_ignored' });
      expect(mockUnifiedIngress.ingestInstagram).not.toHaveBeenCalled();
    });

    it('retourne 409 en cas de conflit idempotence', async () => {
      mockWhapiService.isReplayEvent.mockResolvedValue('conflict');
      const payload = makeIgPayload('mid-conflict');
      const sig = igSignature(payload);

      await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .set('x-hub-signature-256', sig)
        .send(payload)
        .expect(409);
    });
  });

  // -------------------------------------------------------------------------
  // POST /webhooks/instagram — nominal
  // -------------------------------------------------------------------------

  describe('POST /webhooks/instagram — réponse nominale', () => {
    it("retourne { status: 'ok' } après ingestion réussie", async () => {
      const payload = makeIgPayload('mid-ok');
      const sig = igSignature(payload);

      const res = await request(app.getHttpServer())
        .post('/webhooks/instagram')
        .set('x-hub-signature-256', sig)
        .send(payload);

      expect([200, 201]).toContain(res.status);
      expect(res.body).toMatchObject({ status: 'ok' });
    });
  });
});
