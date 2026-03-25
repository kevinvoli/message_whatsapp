import { InboundPersistenceService } from '../inbound-persistence.service';
import { InMemoryMessageRepository } from 'src/test-utils/repositories/in-memory-message.repository';
import { InMemoryConversationRepository } from 'src/test-utils/repositories/in-memory-conversation.repository';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from '../../entities/whatsapp_message.entity';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

// ── Faux objets collaborateurs ──────────────────────────────────────────────

const fakeChannel = { channel_id: 'chan-1', provider: 'whapi' } as any;
const fakeContact = { id: 'contact-1' } as any;

const channelService = {
  findOne: jest.fn().mockResolvedValue(fakeChannel),
};
const contactService = {
  findOrCreate: jest.fn().mockResolvedValue(fakeContact),
};

// ── Factories ───────────────────────────────────────────────────────────────

function makeWhapiMessage(overrides: Record<string, any> = {}): any {
  return {
    id: 'wamid.abc123',
    chat_id: '33612345678@c.us',
    channel_id: 'chan-1',
    from: '33612345678',
    from_name: 'Client Test',
    from_me: false,
    type: 'text',
    text: { body: 'Bonjour' },
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return {
    id: 'chat-uuid-1',
    chat_id: '33612345678@c.us',
    status: WhatsappChatStatus.ACTIF,
    unread_count: 0,
    ...overrides,
  } as WhatsappChat;
}

function makeUnifiedMessage(overrides: Record<string, any> = {}): any {
  return {
    provider: 'meta',
    providerMessageId: 'meta-msg-1',
    chatId: '33612345678@c.us',
    channelId: 'chan-1',
    from: '33612345678',
    fromName: 'Client Test',
    direction: 'in',
    type: 'text',
    text: 'Bonjour',
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// ── Suite de tests ───────────────────────────────────────────────────────────

describe('InboundPersistenceService', () => {
  let service: InboundPersistenceService;
  let messageRepo: InMemoryMessageRepository;
  let chatRepo: InMemoryConversationRepository;

  // Faux commercial repository (minimal)
  const commercialRepo = { findById: jest.fn().mockResolvedValue({ id: 'commercial-1' }) };

  beforeEach(() => {
    messageRepo = new InMemoryMessageRepository();
    chatRepo = new InMemoryConversationRepository();
    jest.clearAllMocks();
    channelService.findOne.mockResolvedValue(fakeChannel);
    contactService.findOrCreate.mockResolvedValue(fakeContact);

    service = new InboundPersistenceService(
      messageRepo,
      chatRepo,
      commercialRepo as any,
      channelService as any,
      contactService as any,
    );
  });

  // ── saveIncomingFromWhapi ──────────────────────────────────────────────────

  describe('saveIncomingFromWhapi', () => {
    it('persiste un nouveau message entrant', async () => {
      const chat = makeChat();
      const msg = makeWhapiMessage();

      const result = await service.saveIncomingFromWhapi(msg, chat);

      expect(result).toBeDefined();
      expect(result.message_id).toBe('wamid.abc123');
      expect(result.direction).toBe(MessageDirection.IN);
      expect(result.status).toBe(WhatsappMessageStatus.SENT);
      expect(messageRepo.all()).toHaveLength(1);
    });

    it('retourne le message existant si déjà en base (déduplication)', async () => {
      const existing: Partial<WhatsappMessage> = {
        id: 'existing-1',
        message_id: 'wamid.abc123',
        direction: MessageDirection.IN,
        status: WhatsappMessageStatus.SENT,
        timestamp: new Date(),
      };
      messageRepo.seed(existing);

      const chat = makeChat();
      const msg = makeWhapiMessage();

      const result = await service.saveIncomingFromWhapi(msg, chat);

      expect(result.id).toBe('existing-1');
      // Aucun nouveau message créé
      expect(messageRepo.all()).toHaveLength(1);
    });

    it('lève une erreur si le channel est introuvable', async () => {
      channelService.findOne.mockResolvedValue(null);
      const chat = makeChat();
      const msg = makeWhapiMessage();

      await expect(service.saveIncomingFromWhapi(msg, chat)).rejects.toThrow(
        'Impossible de sauvegarder le message',
      );
    });

    it('extrait le texte de la propriété image.caption pour les images', async () => {
      const chat = makeChat();
      const msg = makeWhapiMessage({
        type: 'image',
        text: undefined,
        image: { caption: 'Ma photo' },
      });

      const result = await service.saveIncomingFromWhapi(msg, chat);
      expect(result.text).toBe('Ma photo');
    });

    it('utilise le texte par défaut pour les types non supportés', async () => {
      const chat = makeChat();
      const msg = makeWhapiMessage({ type: 'unknown_type', text: undefined });

      const result = await service.saveIncomingFromWhapi(msg, chat);
      expect(result.text).toBe('[Message client]');
    });
  });

  // ── saveIncomingFromUnified ────────────────────────────────────────────────

  describe('saveIncomingFromUnified', () => {
    it('persiste un nouveau message meta/unified', async () => {
      const chat = makeChat();
      chatRepo.seed(chat);
      const msg = makeUnifiedMessage();

      const result = await service.saveIncomingFromUnified(msg, chat);

      expect(result).toBeDefined();
      expect(result.provider).toBe('meta');
      expect(result.provider_message_id).toBe('meta-msg-1');
      expect(result.direction).toBe(MessageDirection.IN);
      expect(messageRepo.all()).toHaveLength(1);
    });

    it('déduplique par provider_message_id', async () => {
      const existing: Partial<WhatsappMessage> = {
        id: 'existing-2',
        provider_message_id: 'meta-msg-1',
        direction: MessageDirection.IN,
        status: WhatsappMessageStatus.SENT,
        timestamp: new Date(),
      };
      messageRepo.seed(existing);

      const chat = makeChat();
      const msg = makeUnifiedMessage();

      const result = await service.saveIncomingFromUnified(msg, chat);
      expect(result.id).toBe('existing-2');
      expect(messageRepo.all()).toHaveLength(1);
    });

    it('lie le message quoté si quotedProviderMessageId est fourni', async () => {
      const quoted: Partial<WhatsappMessage> = {
        id: 'quoted-1',
        provider_message_id: 'orig-msg',
        direction: MessageDirection.IN,
        timestamp: new Date(),
      };
      messageRepo.seed(quoted);

      const chat = makeChat();
      chatRepo.seed(chat);
      const msg = makeUnifiedMessage({ quotedProviderMessageId: 'orig-msg' });

      const result = await service.saveIncomingFromUnified(msg, chat);
      expect(result.quotedMessage?.id).toBe('quoted-1');
    });
  });

  // ── createInternalMessage ─────────────────────────────────────────────────

  describe('createInternalMessage', () => {
    it('retourne null si commercialId est absent', async () => {
      const result = await service.createInternalMessage({ id: 'x', chat_id: 'y@c.us' });
      expect(result).toBeNull();
    });

    it('retourne null si le commercial est introuvable', async () => {
      chatRepo.seed(makeChat({ chat_id: '33612345678@c.us' }));
      commercialRepo.findById.mockResolvedValueOnce(null);

      const result = await service.createInternalMessage(
        { id: 'x', chat_id: '33612345678@c.us' },
        'commercial-99',
      );
      expect(result).toBeNull();
    });

    it('crée le message si le commercial est trouvé', async () => {
      chatRepo.seed(makeChat({ chat_id: '33612345678@c.us' }));
      commercialRepo.findById.mockResolvedValueOnce({ id: 'commercial-1' });

      const internalMsg = {
        id: 'int-msg-1',
        chat_id: '33612345678@c.us',
        from_me: true,
        from: '33612345678',
        from_name: 'Agent',
        timestamp: Math.floor(Date.now() / 1000),
        source: 'internal',
      };

      const result = await service.createInternalMessage(internalMsg, 'commercial-1');

      expect(result).not.toBeNull();
      expect(result?.message_id).toBe('int-msg-1');
      expect(result?.direction).toBe(MessageDirection.OUT);
    });
  });
});
