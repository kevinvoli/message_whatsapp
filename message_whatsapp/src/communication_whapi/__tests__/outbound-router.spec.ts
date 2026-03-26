import { NotFoundException } from '@nestjs/common';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { CommunicationInstagramService } from 'src/communication_whapi/communication_instagram.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { ChannelService } from 'src/channel/channel.service';
import { AppLogger } from 'src/logging/app-logger.service';

const buildRouter = (channelOverride?: Partial<{
  provider: string | null;
  external_id: string | null;
  token: string;
}>) => {
  const channel = {
    id: 'ch-1',
    channel_id: 'ch-1',
    provider: 'whapi',
    external_id: 'ext-123',
    token: 'tok-abc',
    ...channelOverride,
  };

  const whapiService = {
    sendToWhapiChannel: jest.fn().mockResolvedValue({ message: { id: 'whapi-msg-1' } }),
    sendMediaToWhapiChannel: jest.fn(),
    getMessageMediaLink: jest.fn(),
  } as unknown as CommunicationWhapiService;

  const metaService = {
    sendTextMessage: jest.fn().mockResolvedValue({ providerMessageId: 'meta-msg-1' }),
    sendMediaMessage: jest.fn(),
  } as unknown as CommunicationMetaService;

  const messengerService = {
    sendTextMessage: jest.fn().mockResolvedValue({ providerMessageId: 'messenger-msg-1' }),
    sendMediaMessage: jest.fn(),
  } as unknown as CommunicationMessengerService;

  const instagramService = {
    sendTextMessage: jest.fn().mockResolvedValue({ providerMessageId: 'ig-msg-1' }),
    sendMediaMessage: jest.fn(),
  } as unknown as CommunicationInstagramService;

  const telegramService = {
    sendTextMessage: jest.fn().mockResolvedValue({ providerMessageId: 'tg-msg-1' }),
    sendMediaMessage: jest.fn(),
  } as unknown as CommunicationTelegramService;

  const channelService = {
    findOne: jest.fn().mockResolvedValue(channel),
  } as unknown as ChannelService;

  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as AppLogger;

  const router = new OutboundRouterService(
    whapiService,
    metaService,
    messengerService,
    instagramService,
    telegramService,
    channelService,
    logger,
  );

  return {
    router,
    whapiService,
    metaService,
    messengerService,
    instagramService,
    telegramService,
    channelService,
  };
};

describe('OutboundRouterService.sendTextMessage', () => {
  const baseData = {
    text: 'Bonjour',
    to: '213612345678@s.whatsapp.net',
    channelId: 'ch-1',
  };

  it('délègue à CommunicationWhapiService pour un canal whapi', async () => {
    const { router, whapiService } = buildRouter({ provider: 'whapi' });

    const result = await router.sendTextMessage(baseData);

    expect(whapiService.sendToWhapiChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        text: baseData.text,
        to: baseData.to,
        channelId: baseData.channelId,
      }),
    );
    expect(result.provider).toBe('whapi');
    expect(result.providerMessageId).toBe('whapi-msg-1');
  });

  it('délègue à CommunicationMetaService pour un canal meta', async () => {
    const { router, metaService } = buildRouter({
      provider: 'meta',
      external_id: 'phone-number-id-123',
    });

    const result = await router.sendTextMessage(baseData);

    expect(metaService.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: baseData.text,
        phoneNumberId: 'phone-number-id-123',
      }),
    );
    expect(result.provider).toBe('meta');
    expect(result.providerMessageId).toBe('meta-msg-1');
  });

  it('lève NotFoundException si le canal meta est sans external_id', async () => {
    const { router } = buildRouter({ provider: 'meta', external_id: null });

    await expect(router.sendTextMessage(baseData)).rejects.toThrow(NotFoundException);
  });

  it('lève NotFoundException si le canal messenger est sans external_id', async () => {
    const { router } = buildRouter({ provider: 'messenger', external_id: null });

    await expect(router.sendTextMessage(baseData)).rejects.toThrow(NotFoundException);
  });

  it('lève NotFoundException si le canal instagram est sans external_id', async () => {
    const { router } = buildRouter({ provider: 'instagram', external_id: null });

    await expect(router.sendTextMessage(baseData)).rejects.toThrow(NotFoundException);
  });

  it('lève NotFoundException si le channel est introuvable', async () => {
    const { router, channelService } = buildRouter();
    (channelService.findOne as jest.Mock).mockResolvedValue(null);

    await expect(router.sendTextMessage(baseData)).rejects.toThrow(NotFoundException);
  });

  it('utilise whapi par défaut quand provider est null', async () => {
    const { router, whapiService } = buildRouter({ provider: null });

    const result = await router.sendTextMessage(baseData);

    expect(whapiService.sendToWhapiChannel).toHaveBeenCalled();
    expect(result.provider).toBe('whapi');
  });
});
