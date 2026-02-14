import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import * as cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppModule } from './../src/app.module';
import { CommunicationWhapiService } from './../src/communication_whapi/communication_whapi.service';
import { WhapiChannel } from './../src/channel/entities/channel.entity';
import { ProviderChannel } from './../src/channel/entities/provider-channel.entity';
import { WebhookEventLog } from './../src/whapi/entities/webhook-event.entity';

const shouldRun = process.env.E2E_RUN === 'true';
const describeMaybe = shouldRun ? describe : describe.skip;

describeMaybe('Webhook security (e2e)', () => {
  let app: INestApplication<App>;
  let channelRepository: Repository<WhapiChannel>;
  let providerChannelRepository: Repository<ProviderChannel>;
  let webhookEventRepository: Repository<WebhookEventLog>;

  const unique = `${Date.now()}`;
  const channelId = `e2e-sec-channel-${unique}`;
  const tenantId = `e2e-tenant-${unique}`;

  beforeAll(async () => {
    process.env.WHAPI_WEBHOOK_SECRET_HEADER = 'x-whapi-signature';
    process.env.WHAPI_WEBHOOK_SECRET_VALUE = 'e2e-whapi-secret';
    process.env.WHATSAPP_APP_SECRET = 'e2e-meta-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CommunicationWhapiService)
      .useValue({
        sendToWhapiChannel: async () => ({
          message: { id: `whapi-mock-${Date.now()}` },
        }),
        sendTyping: async () => undefined,
        getChannel: async () => null,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    channelRepository = moduleFixture.get<Repository<WhapiChannel>>(
      getRepositoryToken(WhapiChannel),
    );
    providerChannelRepository = moduleFixture.get<Repository<ProviderChannel>>(
      getRepositoryToken(ProviderChannel),
    );
    webhookEventRepository = moduleFixture.get<Repository<WebhookEventLog>>(
      getRepositoryToken(WebhookEventLog),
    );

    await channelRepository.save(
      channelRepository.create({
        id: tenantId,
        tenant_id: tenantId,
        provider: 'whapi',
        external_id: channelId,
        channel_id: channelId,
        token: `token-${unique}`,
        start_at: 0,
        uptime: 1,
        version: '1.0.0',
        device_id: 1,
        ip: '127.0.0.1',
        is_business: false,
        api_version: '1',
        core_version: '1',
      }),
    );

    await providerChannelRepository.save(
      providerChannelRepository.create({
        tenant_id: tenantId,
        provider: 'whapi',
        external_id: channelId,
        channel_id: channelId,
      }),
    );
  });

  afterAll(async () => {
    if (webhookEventRepository) {
      try {
        await webhookEventRepository.delete({ provider: 'whapi' });
      } catch (error) {
        // ignore cleanup errors for missing table in test env
      }
    }
    if (providerChannelRepository) {
      await providerChannelRepository.delete({ external_id: channelId });
    }
    if (channelRepository) {
      await channelRepository.delete({ channel_id: channelId });
    }

    if (app) {
      await app.close();
    }
  });

  it('rejects missing whapi secret', async () => {
    const payload = {
      channel_id: channelId,
      event: { type: 'messages' },
      messages: [
        {
          id: `in-${unique}`,
          chat_id: `2250700${unique.slice(-6)}@s.whatsapp.net`,
          from_me: false,
          from: `2250700${unique.slice(-6)}`,
          from_name: 'Client E2E',
          timestamp: Math.floor(Date.now() / 1000),
          type: 'text',
          text: { body: 'Bonjour' },
        },
      ],
    };

    await request(app.getHttpServer())
      .post('/webhooks/whapi')
      .send(payload)
      .expect(401);
  });

  it('rejects invalid whapi secret', async () => {
    const payload = {
      channel_id: channelId,
      event: { type: 'messages' },
      messages: [
        {
          id: `in-${unique}-badsecret`,
          chat_id: `2250700${unique.slice(-6)}@s.whatsapp.net`,
          from_me: false,
          from: `2250700${unique.slice(-6)}`,
          from_name: 'Client E2E',
          timestamp: Math.floor(Date.now() / 1000),
          type: 'text',
          text: { body: 'Bonjour' },
        },
      ],
    };

    const rawBody = Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', 'bad-secret')
      .update(rawBody)
      .digest('hex');
    const signature = `sha256=${digest}`;

    await request(app.getHttpServer())
      .post('/webhooks/whapi')
      .set('x-whapi-signature', signature)
      .send(payload)
      .expect(403);
  });

  it('rejects unknown tenant mapping', async () => {
    const payload = {
      channel_id: `unknown-${channelId}`,
      event: { type: 'messages' },
      messages: [
        {
          id: `in-${unique}-unknown`,
          chat_id: `2250700${unique.slice(-6)}@s.whatsapp.net`,
          from_me: false,
          from: `2250700${unique.slice(-6)}`,
          from_name: 'Client E2E',
          timestamp: Math.floor(Date.now() / 1000),
          type: 'text',
          text: { body: 'Bonjour' },
        },
      ],
    };

    const rawBody = Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', 'e2e-whapi-secret')
      .update(rawBody)
      .digest('hex');
    const signature = `sha256=${digest}`;

    await request(app.getHttpServer())
      .post('/webhooks/whapi')
      .set('x-whapi-signature', signature)
      .send(payload)
      .expect(422);
  });

  it('accepts valid whapi webhook', async () => {
    const payload = {
      channel_id: channelId,
      event: { type: 'messages' },
      messages: [
        {
          id: `in-${unique}-ok`,
          chat_id: `2250700${unique.slice(-6)}@s.whatsapp.net`,
          from_me: false,
          from: `2250700${unique.slice(-6)}`,
          from_name: 'Client E2E',
          timestamp: Math.floor(Date.now() / 1000),
          type: 'text',
          text: { body: 'Bonjour' },
        },
      ],
    };

    const rawBody = Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', 'e2e-whapi-secret')
      .update(rawBody)
      .digest('hex');
    const signature = `sha256=${digest}`;

    await request(app.getHttpServer())
      .post('/webhooks/whapi')
      .set('x-whapi-signature', signature)
      .send(payload)
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`Expected 200/201, got ${res.status}`);
        }
      });
  });

  it('rejects missing meta signature when secret set', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: `waba-${unique}`,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '0000',
                  phone_number_id: channelId,
                },
                contacts: [
                  {
                    wa_id: `2250700${unique.slice(-6)}`,
                    profile: { name: 'Client E2E' },
                  },
                ],
                messages: [
                  {
                    from: `2250700${unique.slice(-6)}`,
                    id: `meta-${unique}`,
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'text',
                    text: { body: 'Bonjour meta' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .send(payload)
      .expect(401);
  });

  it('accepts valid meta signature', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: `waba-${unique}-ok`,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '0000',
                  phone_number_id: channelId,
                },
                contacts: [
                  {
                    wa_id: `2250700${unique.slice(-6)}`,
                    profile: { name: 'Client E2E' },
                  },
                ],
                messages: [
                  {
                    from: `2250700${unique.slice(-6)}`,
                    id: `meta-${unique}-ok`,
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'text',
                    text: { body: 'Bonjour meta' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBody = Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', 'e2e-meta-secret')
      .update(rawBody)
      .digest('hex');
    const signature = `sha256=${digest}`;

    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', signature)
      .send(payload)
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`Expected 200/201, got ${res.status}`);
        }
      });
  });
});
