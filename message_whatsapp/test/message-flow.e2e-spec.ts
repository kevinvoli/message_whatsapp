import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { createHmac } from 'crypto';
import * as cookieParser from 'cookie-parser';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappPoste } from './../src/whatsapp_poste/entities/whatsapp_poste.entity';
import { QueuePosition } from './../src/dispatcher/entities/queue-position.entity';
import { WhapiChannel } from './../src/channel/entities/channel.entity';
import { ProviderChannel } from './../src/channel/entities/provider-channel.entity';
import { WhatsappChat } from './../src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from './../src/whatsapp_message/entities/whatsapp_message.entity';
import { CommunicationWhapiService } from './../src/communication_whapi/communication_whapi.service';

const shouldRun = process.env.E2E_RUN === 'true';
const describeMaybe = shouldRun ? describe : describe.skip;

describeMaybe('Message flow (e2e)', () => {
  let app: INestApplication<App>;
  let posteRepository: Repository<WhatsappPoste>;
  let queueRepository: Repository<QueuePosition>;
  let channelRepository: Repository<WhapiChannel>;
  let providerChannelRepository: Repository<ProviderChannel>;
  let chatRepository: Repository<WhatsappChat>;
  let messageRepository: Repository<WhatsappMessage>;

  const adminEmail = process.env.ADMIN_EMAIL ?? '';
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  const unique = `${Date.now()}`;
  const channelId = `e2e-channel-${unique}`;
  const chatId = `2250700${unique.slice(-6)}@s.whatsapp.net`;
  const clientPhone = chatId.split('@')[0];
  const requestTimeout = { response: 20000, deadline: 25000 };
  const logStep = (step: string) => {
    // eslint-disable-next-line no-console
    console.log(`[e2e][message-flow] ${step}`);
  };

  let adminCookies: string[] = [];
  let posteId = '';

  beforeAll(async () => {
    process.env.WHAPI_WEBHOOK_SECRET_HEADER =
      process.env.WHAPI_WEBHOOK_SECRET_HEADER ?? 'x-whapi-signature';
    process.env.WHAPI_WEBHOOK_SECRET_VALUE =
      process.env.WHAPI_WEBHOOK_SECRET_VALUE ?? 'e2e-whapi-secret';

    if (!adminEmail || !adminPassword) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required for E2E.');
    }

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

    posteRepository = moduleFixture.get<Repository<WhatsappPoste>>(
      getRepositoryToken(WhatsappPoste),
    );
    queueRepository = moduleFixture.get<Repository<QueuePosition>>(
      getRepositoryToken(QueuePosition),
    );
    channelRepository = moduleFixture.get<Repository<WhapiChannel>>(
      getRepositoryToken(WhapiChannel),
    );
    providerChannelRepository = moduleFixture.get<Repository<ProviderChannel>>(
      getRepositoryToken(ProviderChannel),
    );
    chatRepository = moduleFixture.get<Repository<WhatsappChat>>(
      getRepositoryToken(WhatsappChat),
    );
    messageRepository = moduleFixture.get<Repository<WhatsappMessage>>(
      getRepositoryToken(WhatsappMessage),
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`Admin login failed with ${res.status}`);
        }
      });

    const adminSetCookie = adminLogin.headers['set-cookie'];
    adminCookies = Array.isArray(adminSetCookie)
      ? adminSetCookie
      : adminSetCookie
        ? [adminSetCookie]
        : [];

    const poste = await posteRepository.save(
      posteRepository.create({
        name: `E2E Flow Poste ${unique}`,
        code: `E2EFLOW${unique.slice(-6)}`,
        is_active: true,
      }),
    );
    posteId = poste.id;

    await queueRepository.save(
      queueRepository.create({
        poste_id: poste.id,
        position: 1,
        poste,
      }),
    );

    const savedChannel = await channelRepository.save(
      channelRepository.create({
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
        tenant_id: savedChannel.id,
        provider: 'whapi',
        external_id: channelId,
        channel_id: channelId,
      }),
    );
  }, 30000);

  afterAll(async () => {
    if (messageRepository) {
      await messageRepository.delete({ chat_id: chatId });
    }
    if (chatRepository) {
      await chatRepository.delete({ chat_id: chatId });
    }
    if (queueRepository) {
      await queueRepository.delete({ poste_id: posteId });
    }
    if (posteRepository) {
      await posteRepository.delete({ id: posteId });
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
  }, 30000);

  it('processes incoming webhook then allows admin reply', async () => {
    const payload = {
      channel_id: channelId,
      event: { type: 'messages' },
      messages: [
        {
          id: `in-${unique}`,
          chat_id: chatId,
          from_me: false,
          from: clientPhone,
          from_name: 'Client E2E',
          timestamp: Math.floor(Date.now() / 1000),
          type: 'text',
          text: { body: 'Bonjour depuis webhook e2e' },
        },
      ],
    };

    const webhookHeader = process.env.WHAPI_WEBHOOK_SECRET_HEADER;
    const webhookValue = process.env.WHAPI_WEBHOOK_SECRET_VALUE;

    logStep('POST /webhooks/whapi');
    let webhookReq = request(app.getHttpServer())
      .post('/webhooks/whapi')
      .send(payload)
      .timeout(requestTimeout);

    if (webhookHeader && webhookValue) {
      const rawBody = Buffer.from(JSON.stringify(payload));
      const digest = createHmac('sha256', webhookValue)
        .update(rawBody)
        .digest('hex');
      const signature = `sha256=${digest}`;
      webhookReq = webhookReq.set(webhookHeader, signature);
    }

    await webhookReq.expect((res) => {
      if (![200, 201].includes(res.status)) {
        throw new Error(`Webhook failed with ${res.status}`);
      }
    });

    logStep('GET /chats');
    const chatsRes = await request(app.getHttpServer())
      .get('/chats')
      .set('Cookie', adminCookies)
      .timeout(requestTimeout)
      .expect(200);

    const chat = (chatsRes.body as any[]).find((c) => c.chat_id === chatId);
    expect(chat).toBeDefined();
    expect(chat.channel_id).toBe(channelId);

    logStep('GET /messages/:chatId (incoming)');
    const incomingMessagesRes = await request(app.getHttpServer())
      .get(`/messages/${chatId}`)
      .set('Cookie', adminCookies)
      .timeout(requestTimeout)
      .expect(200);

    const incomingMessages = incomingMessagesRes.body as Array<{
      direction: string;
      text?: string;
    }>;
    expect(
      incomingMessages.some((m) => m.direction === 'IN' && !!m.text),
    ).toBeTruthy();

    logStep('POST /messages (admin reply)');
    await request(app.getHttpServer())
      .post('/messages')
      .set('Cookie', adminCookies)
      .timeout(requestTimeout)
      .send({
        chat_id: chatId,
        text: 'Reponse admin e2e',
        poste_id: posteId,
        channel_id: channelId,
      })
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`Admin send message failed with ${res.status}`);
        }
      });

    logStep('GET /messages/:chatId (all)');
    const allMessagesRes = await request(app.getHttpServer())
      .get(`/messages/${chatId}`)
      .set('Cookie', adminCookies)
      .timeout(requestTimeout)
      .expect(200);

    const allMessages = allMessagesRes.body as Array<{ direction: string }>;
    expect(allMessages.some((m) => m.direction === 'IN')).toBeTruthy();
    expect(allMessages.some((m) => m.direction === 'OUT')).toBeTruthy();
  }, 30000);
});
