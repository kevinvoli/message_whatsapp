import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookProducerService } from './webhook-producer.service';
import { WebhookDegradedQueueService } from 'src/whapi/webhook-degraded-queue.service';
import { UnifiedIngressService } from './unified-ingress.service';

describe('WebhookProducerService', () => {
  let service: WebhookProducerService;
  let mockQueue: { add: jest.Mock };
  let mockDegradedQueue: { enqueue: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({}) };
    mockDegradedQueue = { enqueue: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProducerService,
        {
          provide: getQueueToken('webhook-inbound'),
          useValue: mockQueue,
        },
        {
          provide: WebhookDegradedQueueService,
          useValue: mockDegradedQueue,
        },
        {
          provide: UnifiedIngressService,
          useValue: {
            ingestWhapi: jest.fn(),
            ingestMeta: jest.fn(),
            ingestMessenger: jest.fn(),
            ingestInstagram: jest.fn(),
            ingestTelegram: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookProducerService>(WebhookProducerService);
  });

  it('bascule sur la file mémoire si Redis est indisponible', async () => {
    mockQueue.add.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await service.enqueueIngestion('whapi', { channel_id: 'ch-001' }, 'evt-001');

    expect(mockDegradedQueue.enqueue).toHaveBeenCalledWith(
      'whapi',
      expect.objectContaining({ run: expect.any(Function) }),
    );
  });

  it('déduplication : deux enqueues avec le même eventId → jobId identique', async () => {
    const eventId = 'evt-dedup-001';

    await service.enqueueIngestion('whapi', { channel_id: 'ch-001' }, eventId);
    await service.enqueueIngestion('whapi', { channel_id: 'ch-001' }, eventId);

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
    const firstCallOptions = mockQueue.add.mock.calls[0][2] as { jobId: string };
    const secondCallOptions = mockQueue.add.mock.calls[1][2] as { jobId: string };
    expect(firstCallOptions.jobId).toBe(eventId);
    expect(secondCallOptions.jobId).toBe(eventId);
  });

  it('ne logge jamais le contenu du payload dans les erreurs Redis', async () => {
    const sensitivePayload = {
      channel_id: 'ch-001',
      token: 'super-secret-token',
      webhook_secret: 'mysecret',
      meta_app_secret: 'appsecret',
    };
    mockQueue.add.mockRejectedValueOnce(new Error('Redis down'));

    const loggerSpy = jest.spyOn(
      (service as unknown as { logger: { error: jest.Mock } }).logger,
      'error',
    );

    await service.enqueueIngestion('whapi', sensitivePayload, 'evt-001');

    expect(loggerSpy).toHaveBeenCalled();
    const loggedMessage = String(loggerSpy.mock.calls[0]?.[0] ?? '');
    expect(loggedMessage).not.toContain('super-secret-token');
    expect(loggedMessage).not.toContain('mysecret');
    expect(loggedMessage).not.toContain('appsecret');
    expect(loggedMessage).not.toContain(JSON.stringify(sensitivePayload));
  });
});
