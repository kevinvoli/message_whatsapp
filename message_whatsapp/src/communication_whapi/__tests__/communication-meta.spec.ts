import axios from 'axios';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { WhapiOutboundError } from 'src/communication_whapi/errors/whapi-outbound.error';
import { AppLogger } from 'src/logging/app-logger.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const buildService = (maxRetries = 0) => {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as AppLogger;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'META_API_VERSION') return 'v22.0';
      if (key === 'META_OUTBOUND_MAX_RETRIES') return String(maxRetries);
      return undefined;
    }),
  };

  return new CommunicationMetaService(logger, configService as any);
};

const validData = {
  text: 'Hello',
  to: '213612345678',
  phoneNumberId: 'phone-id-42',
  accessToken: 'test-token',
};

describe('CommunicationMetaService.sendTextMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retourne { providerMessageId } lors d\'une réponse réussie', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: {
        messages: [{ id: 'wamid.abc123' }],
      },
    });

    const service = buildService(0);
    const result = await service.sendTextMessage(validData);

    expect(result.providerMessageId).toBe('wamid.abc123');
  });

  it('lève WhapiOutboundError avec kind=permanent pour une réponse 400', async () => {
    const axiosError = Object.assign(new Error('Bad Request'), {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: { message: 'Invalid phone number', code: 100 },
        },
      },
    });
    mockedAxios.post = jest.fn().mockRejectedValue(axiosError);

    const service = buildService(0);

    await expect(service.sendTextMessage(validData)).rejects.toMatchObject({
      kind: 'permanent',
    });
    await expect(service.sendTextMessage(validData)).rejects.toBeInstanceOf(WhapiOutboundError);
  });

  it('lève WhapiOutboundError avec kind=transient pour une réponse 429', async () => {
    const axiosError = Object.assign(new Error('Too Many Requests'), {
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          error: { message: 'Rate limit exceeded', code: 613 },
        },
      },
    });
    mockedAxios.post = jest.fn().mockRejectedValue(axiosError);

    // maxRetries=0 → échoue immédiatement sans retry
    const service = buildService(0);

    await expect(service.sendTextMessage(validData)).rejects.toMatchObject({
      kind: 'transient',
    });
    await expect(service.sendTextMessage(validData)).rejects.toBeInstanceOf(WhapiOutboundError);
  });

  it('lève WhapiOutboundError si la réponse ne contient pas messages[0].id', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: { messages: [] },
    });

    const service = buildService(0);

    await expect(service.sendTextMessage(validData)).rejects.toBeInstanceOf(WhapiOutboundError);
  });

  it('lève une erreur de validation pour un destinataire vide', async () => {
    const service = buildService(0);

    await expect(
      service.sendTextMessage({ ...validData, to: '' }),
    ).rejects.toThrow();
  });
});
