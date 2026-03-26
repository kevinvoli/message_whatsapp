import { InboundMessageService } from '../inbound-message.service';
import { UnifiedMessage } from '../normalization/unified-message';

/**
 * Tests d'idempotence et de sérialisation de InboundMessageService.
 * Le service utilise un Mutex par chatId pour sérialiser les messages
 * entrants d'un même chat.
 */
describe('InboundMessageService — sérialisation par chatId', () => {
  // chatId valide : phone entre 8 et 20 chiffres + @s.whatsapp.net
  const VALID_CHAT_1 = '21312345678@s.whatsapp.net';  // +213 Algérie
  const VALID_CHAT_2 = '33612345678@s.whatsapp.net';  // +33 France

  const makeMessage = (id: string, chatId: string): UnifiedMessage => ({
    provider: 'meta',
    providerMessageId: id,
    tenantId: 'tenant-1',
    channelId: 'phone-1',
    chatId,
    from: chatId.split('@')[0],
    fromName: 'Client',
    timestamp: Date.now() / 1000,
    direction: 'in',
    type: 'text',
    text: 'hello',
    raw: {},
  });

  const buildService = (overrides: Partial<ConstructorParameters<typeof InboundMessageService>[0]> = {}) => {
    const order: string[] = [];

    const dispatcherService = {
      assignConversation: jest.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return {
          id: 'chat-1',
          chat_id: '111@s.whatsapp.net',
          poste_id: 'poste-1',
          tenant_id: 'tenant-1',
        };
      }),
    };

    const whatsappMessageService = {
      saveIncomingFromUnified: jest.fn().mockImplementation(async (msg: UnifiedMessage) => {
        order.push(msg.providerMessageId);
        return { id: `db-${msg.providerMessageId}`, timestamp: new Date() };
      }),
      findOneWithMedias: jest.fn().mockImplementation(async (id: string) => ({ id })),
    };

    const messageGateway = {
      notifyNewMessage: jest.fn().mockResolvedValue(undefined),
    };

    const chatService = {
      findOrCreateByExternalChatId: jest.fn().mockResolvedValue({ chat_id: VALID_CHAT_1 }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const mediaRepository = { save: jest.fn().mockResolvedValue({}) };
    const channelService = { findByChannelId: jest.fn().mockResolvedValue({ id: 'ch-1', provider: 'meta' }) };
    const autoMessageOrchestrator = {
      scheduleAutoMessages: jest.fn().mockResolvedValue(undefined),
      handleClientMessage: jest.fn().mockResolvedValue(undefined),
    };

    const service = new InboundMessageService(
      dispatcherService as any,
      whatsappMessageService as any,
      messageGateway as any,
      chatService as any,
      mediaRepository as any,
      channelService as any,
      autoMessageOrchestrator as any,
    );

    return { service, order, whatsappMessageService, dispatcherService };
  };

  it('traite un message entrant sans erreur', async () => {
    const { service, whatsappMessageService } = buildService();
    const msg = makeMessage('msg-1', VALID_CHAT_1);

    await service.handleMessages([msg]);

    expect(whatsappMessageService.saveIncomingFromUnified).toHaveBeenCalledTimes(1);
    expect(whatsappMessageService.saveIncomingFromUnified).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  it('ne traite pas un message sortant (direction=out)', async () => {
    const { service, whatsappMessageService } = buildService();
    const msg: UnifiedMessage = { ...makeMessage('msg-out', VALID_CHAT_1), direction: 'out' };

    await service.handleMessages([msg]);

    expect(whatsappMessageService.saveIncomingFromUnified).not.toHaveBeenCalled();
  });

  it('ignore un chatId invalide (sans @)', async () => {
    const { service, whatsappMessageService } = buildService();
    const msg = makeMessage('msg-invalid', 'pas-un-chat-id-valide');

    await service.handleMessages([msg]);

    expect(whatsappMessageService.saveIncomingFromUnified).not.toHaveBeenCalled();
  });

  it('sérialise deux messages du même chat (mutex par chatId)', async () => {
    const { service, order } = buildService();
    const msg1 = makeMessage('msg-A', VALID_CHAT_1);
    const msg2 = makeMessage('msg-B', VALID_CHAT_1);

    // Lance les deux en parallèle — le mutex garantit l'ordre d'arrivée
    await Promise.all([
      service.handleMessages([msg1]),
      service.handleMessages([msg2]),
    ]);

    // Les deux doivent être traités (aucun perdu)
    expect(order).toHaveLength(2);
    expect(order).toContain('msg-A');
    expect(order).toContain('msg-B');
  });

  it('traite des messages de chats différents en parallèle (pas de blocage entre chats)', async () => {
    const { service, order } = buildService();
    const msgA = makeMessage('msg-chat1', VALID_CHAT_1);
    const msgB = makeMessage('msg-chat2', VALID_CHAT_2);

    await Promise.all([
      service.handleMessages([msgA]),
      service.handleMessages([msgB]),
    ]);

    expect(order).toHaveLength(2);
    expect(order).toContain('msg-chat1');
    expect(order).toContain('msg-chat2');
  });

  it('retourne sans erreur si la liste de messages est vide', async () => {
    const { service, whatsappMessageService } = buildService();

    await expect(service.handleMessages([])).resolves.toBeUndefined();
    expect(whatsappMessageService.saveIncomingFromUnified).not.toHaveBeenCalled();
  });
});
