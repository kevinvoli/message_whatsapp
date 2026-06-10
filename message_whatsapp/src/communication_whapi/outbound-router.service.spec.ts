import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboundRouterService } from './outbound-router.service';
import { CommunicationWhapiService } from './communication_whapi.service';
import { CommunicationMetaService } from './communication_meta.service';
import { CommunicationMessengerService } from './communication_messenger.service';
import { CommunicationInstagramService } from './communication_instagram.service';
import { CommunicationTelegramService } from './communication_telegram.service';
import { ChannelService } from 'src/channel/channel.service';
import { AppLogger } from 'src/logging/app-logger.service';
import { WhapiChannel } from './../../src/channel/entities/channel.entity';
import { createTestingModule } from '../../test/helpers/create-test-module';
import type { OutboundSendResponse } from './dto/outbound-send-response.dto';

// ─── Factories locales ────────────────────────────────────────────────────────

function makeChannel(overrides: Partial<WhapiChannel> = {}): WhapiChannel {
  return {
    id: 'chan-uuid-001',
    channel_id: 'channel-test-001',
    token: 'token-test',
    provider: 'whapi',
    external_id: 'ext-id-001',
    label: null,
    tenant_id: null,
    meta_app_id: null,
    meta_app_secret: null,
    webhook_secret: null,
    verify_token: null,
    poste_id: null,
    ...overrides,
  } as WhapiChannel;
}

// ─── Mocks des services provider ─────────────────────────────────────────────

function makeMockWhapiService() {
  return {
    sendToWhapiChannel: jest.fn(),
    sendLocationToWhapiChannel: jest.fn(),
    sendHsmToWhapiChannel: jest.fn(),
    sendMediaToWhapiChannel: jest.fn(),
    getMessageMediaLink: jest.fn(),
  };
}

function makeMockMetaService() {
  return {
    sendTextMessage: jest.fn(),
    sendLocationMessage: jest.fn(),
    sendTemplateMessage: jest.fn(),
    sendMediaMessage: jest.fn(),
    downloadMedia: jest.fn(),
  };
}

function makeMockMessengerService() {
  return {
    sendTextMessage: jest.fn(),
    sendMediaMessage: jest.fn(),
    downloadMedia: jest.fn(),
  };
}

function makeMockInstagramService() {
  return {
    sendTextMessage: jest.fn(),
    sendMediaMessage: jest.fn(),
  };
}

function makeMockTelegramService() {
  return {
    sendTextMessage: jest.fn(),
    sendMediaMessage: jest.fn(),
  };
}

// ─── Suite principale ─────────────────────────────────────────────────────────

describe('OutboundRouterService', () => {
  let service: OutboundRouterService;
  let mockWhapiService: ReturnType<typeof makeMockWhapiService>;
  let mockMetaService: ReturnType<typeof makeMockMetaService>;
  let mockMessengerService: ReturnType<typeof makeMockMessengerService>;
  let mockInstagramService: ReturnType<typeof makeMockInstagramService>;
  let mockTelegramService: ReturnType<typeof makeMockTelegramService>;
  let mockChannelService: { findOne: jest.Mock };
  let mockLogger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockWhapiService = makeMockWhapiService();
    mockMetaService = makeMockMetaService();
    mockMessengerService = makeMockMessengerService();
    mockInstagramService = makeMockInstagramService();
    mockTelegramService = makeMockTelegramService();
    mockChannelService = { findOne: jest.fn() };
    mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module = await createTestingModule([
      OutboundRouterService,
      { provide: CommunicationWhapiService, useValue: mockWhapiService },
      { provide: CommunicationMetaService, useValue: mockMetaService },
      { provide: CommunicationMessengerService, useValue: mockMessengerService },
      { provide: CommunicationInstagramService, useValue: mockInstagramService },
      { provide: CommunicationTelegramService, useValue: mockTelegramService },
      { provide: ChannelService, useValue: mockChannelService },
      { provide: AppLogger, useValue: mockLogger },
    ]);

    service = module.get<OutboundRouterService>(OutboundRouterService);
  });

  // ─── sendTextMessage ──────────────────────────────────────────────────────

  describe('sendTextMessage', () => {
    it('provider whapi → délègue à CommunicationWhapiService et retourne le contrat OutboundSendResponse', async () => {
      mockChannelService.findOne.mockResolvedValue(makeChannel({ provider: 'whapi' }));
      mockWhapiService.sendToWhapiChannel.mockResolvedValue({
        message: { id: 'whapi-msg-abc' },
      });

      const result = await service.sendTextMessage({
        text: 'Bonjour',
        to: '33600000001@c.us',
        channelId: 'channel-test-001',
      });

      expect(mockWhapiService.sendToWhapiChannel).toHaveBeenCalledTimes(1);
      expect(mockMetaService.sendTextMessage).not.toHaveBeenCalled();
      expect(result).toMatchObject<OutboundSendResponse>({
        providerMessageId: 'whapi-msg-abc',
        provider: 'whapi',
      });
    });

    it('provider meta → délègue à CommunicationMetaService et retourne le contrat OutboundSendResponse', async () => {
      mockChannelService.findOne.mockResolvedValue(
        makeChannel({ provider: 'meta', external_id: 'phone-number-id-001' }),
      );
      mockMetaService.sendTextMessage.mockResolvedValue({
        providerMessageId: 'meta-wamid-001',
      });

      const result = await service.sendTextMessage({
        text: 'Bonjour',
        to: '33600000001',
        channelId: 'channel-test-001',
      });

      expect(mockMetaService.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(mockWhapiService.sendToWhapiChannel).not.toHaveBeenCalled();
      expect(result).toMatchObject<OutboundSendResponse>({
        providerMessageId: 'meta-wamid-001',
        provider: 'meta',
      });
    });

    it('provider messenger → délègue à CommunicationMessengerService', async () => {
      mockChannelService.findOne.mockResolvedValue(
        makeChannel({ provider: 'messenger', external_id: 'page-id-001' }),
      );
      mockMessengerService.sendTextMessage.mockResolvedValue({
        providerMessageId: 'messenger-mid-001',
      });

      const result = await service.sendTextMessage({
        text: 'Hello',
        to: 'psid-001@messenger',
        channelId: 'channel-test-001',
      });

      expect(mockMessengerService.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('messenger');
    });

    it('canal introuvable → lève NotFoundException', async () => {
      mockChannelService.findOne.mockResolvedValue(null);

      await expect(
        service.sendTextMessage({
          text: 'Test',
          to: '33600000001@c.us',
          channelId: 'channel-inexistant',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockWhapiService.sendToWhapiChannel).not.toHaveBeenCalled();
    });

    it('provider meta sans external_id → lève NotFoundException', async () => {
      mockChannelService.findOne.mockResolvedValue(
        makeChannel({ provider: 'meta', external_id: null }),
      );

      await expect(
        service.sendTextMessage({
          text: 'Test',
          to: '33600000001',
          channelId: 'channel-test-001',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('idempotence : deux appels identiques → deux appels au provider (pas de cache côté router)', async () => {
      mockChannelService.findOne.mockResolvedValue(makeChannel({ provider: 'whapi' }));
      mockWhapiService.sendToWhapiChannel.mockResolvedValue({
        message: { id: 'whapi-msg-abc' },
      });

      const payload = { text: 'Bonjour', to: '33600000001@c.us', channelId: 'channel-test-001' };
      await service.sendTextMessage(payload);
      await service.sendTextMessage(payload);

      // Le router ne déduplique pas les envois — c'est voulu (pas de cache côté router)
      // Mais il doit router vers le bon provider à chaque appel sans erreur
      expect(mockWhapiService.sendToWhapiChannel).toHaveBeenCalledTimes(2);
      expect(mockChannelService.findOne).toHaveBeenCalledTimes(2);
    });
  });

  // ─── sendTemplateMessage ──────────────────────────────────────────────────

  describe('sendTemplateMessage', () => {
    it('provider meta → délègue à MetaService.sendTemplateMessage', async () => {
      mockChannelService.findOne.mockResolvedValue(
        makeChannel({ provider: 'meta', external_id: 'phone-number-id-001' }),
      );
      mockMetaService.sendTemplateMessage.mockResolvedValue({
        providerMessageId: 'meta-tmpl-wamid-001',
      });

      const result = await service.sendTemplateMessage({
        to: '33600000001',
        channelId: 'channel-test-001',
        templateName: 'hello_world',
        languageCode: 'fr',
      });

      expect(mockMetaService.sendTemplateMessage).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject<OutboundSendResponse>({
        providerMessageId: 'meta-tmpl-wamid-001',
        provider: 'meta',
      });
    });

    it('provider whapi → délègue à WhapiService.sendHsmToWhapiChannel', async () => {
      mockChannelService.findOne.mockResolvedValue(makeChannel({ provider: 'whapi' }));
      mockWhapiService.sendHsmToWhapiChannel.mockResolvedValue({
        message: { id: 'whapi-hsm-001' },
      });

      const result = await service.sendTemplateMessage({
        to: '33600000001@c.us',
        channelId: 'channel-test-001',
        templateName: 'hello_world',
        languageCode: 'fr',
      });

      expect(mockWhapiService.sendHsmToWhapiChannel).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('whapi');
    });

    it('provider inconnu (messenger) → lève BadRequestException', async () => {
      mockChannelService.findOne.mockResolvedValue(
        makeChannel({ provider: 'messenger', external_id: 'page-id-001' }),
      );

      await expect(
        service.sendTemplateMessage({
          to: '33600000001',
          channelId: 'channel-test-001',
          templateName: 'hello_world',
          languageCode: 'fr',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('canal introuvable → lève NotFoundException', async () => {
      mockChannelService.findOne.mockResolvedValue(null);

      await expect(
        service.sendTemplateMessage({
          to: '33600000001',
          channelId: 'channel-inexistant',
          templateName: 'hello_world',
          languageCode: 'fr',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── sendLocationMessage ──────────────────────────────────────────────────

  describe('sendLocationMessage', () => {
    it('provider whapi → délègue à WhapiService.sendLocationToWhapiChannel', async () => {
      mockChannelService.findOne.mockResolvedValue(makeChannel({ provider: 'whapi' }));
      mockWhapiService.sendLocationToWhapiChannel.mockResolvedValue({
        message: { id: 'whapi-loc-001' },
      });

      const result = await service.sendLocationMessage({
        to: '33600000001@c.us',
        channelId: 'channel-test-001',
        latitude: 5.345317,
        longitude: -4.024429,
      });

      expect(mockWhapiService.sendLocationToWhapiChannel).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('whapi');
    });

    it('provider meta → délègue à MetaService.sendLocationMessage', async () => {
      mockChannelService.findOne.mockResolvedValue(
        makeChannel({ provider: 'meta', external_id: 'phone-number-id-001' }),
      );
      mockMetaService.sendLocationMessage.mockResolvedValue({
        providerMessageId: 'meta-loc-001',
      });

      const result = await service.sendLocationMessage({
        to: '33600000001',
        channelId: 'channel-test-001',
        latitude: 5.345317,
        longitude: -4.024429,
      });

      expect(mockMetaService.sendLocationMessage).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('meta');
    });

    it('canal introuvable → lève NotFoundException', async () => {
      mockChannelService.findOne.mockResolvedValue(null);

      await expect(
        service.sendLocationMessage({
          to: '33600000001@c.us',
          channelId: 'channel-inexistant',
          latitude: 5.345317,
          longitude: -4.024429,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
