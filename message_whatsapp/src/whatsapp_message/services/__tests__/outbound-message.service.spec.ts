import { NotFoundException } from '@nestjs/common';
import { OutboundMessageService } from '../outbound-message.service';
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

// ── Factories ───────────────────────────────────────────────────────────────

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return {
    id: 'chat-uuid-1',
    chat_id: '33612345678@c.us',
    name: 'Client Test',
    status: WhatsappChatStatus.ACTIF,
    unread_count: 0,
    contact_client: '33612345678',
    ...overrides,
  } as WhatsappChat;
}

function makeInboundMessage(hoursAgo: number, chatId = '33612345678@c.us'): Partial<WhatsappMessage> {
  const ts = new Date();
  ts.setHours(ts.getHours() - hoursAgo);
  return {
    id: `inbound-${hoursAgo}h`,
    chat_id: chatId,
    direction: MessageDirection.IN,
    from_me: false,
    status: WhatsappMessageStatus.DELIVERED,
    timestamp: ts,
  };
}

// ── Collaborateurs mockés ────────────────────────────────────────────────────

const fakeChannel = { channel_id: 'chan-1', provider: 'whapi' } as any;

const chatService = {
  findBychat_id: jest.fn(),
};
const communicationWhapiService = {
  sendTyping: jest.fn(),
};
const outboundRouter = {
  sendTextMessage: jest.fn(),
  sendMediaMessage: jest.fn(),
};
const channelService = {
  findOne: jest.fn().mockResolvedValue(fakeChannel),
};
const configService = {
  get: jest.fn().mockReturnValue('24'),
};
const commercialRepo = {
  findById: jest.fn().mockResolvedValue(null),
};
const mediaRepo = {
  build: jest.fn().mockImplementation((d: any) => d),
  save: jest.fn().mockImplementation(async (d: any) => d),
};

// ── Suite de tests ───────────────────────────────────────────────────────────

describe('OutboundMessageService', () => {
  let service: OutboundMessageService;
  let messageRepo: InMemoryMessageRepository;
  let chatRepo: InMemoryConversationRepository;

  beforeEach(() => {
    messageRepo = new InMemoryMessageRepository();
    chatRepo = new InMemoryConversationRepository();
    jest.clearAllMocks();
    channelService.findOne.mockResolvedValue(fakeChannel);
    configService.get.mockReturnValue('24');

    service = new OutboundMessageService(
      messageRepo,
      chatRepo,
      commercialRepo as any,
      mediaRepo as any,
      chatService as any,
      communicationWhapiService as any,
      outboundRouter as any,
      channelService as any,
      configService as any,
    );
  });

  describe('createAgentMessage', () => {
    const baseData = {
      chat_id: '33612345678@c.us',
      text: 'Bonjour, comment puis-je vous aider ?',
      poste_id: 'poste-1',
      timestamp: new Date(),
      channel_id: 'chan-1',
    };

    it('crée et persiste le message après envoi réussi', async () => {
      chatService.findBychat_id.mockResolvedValue(makeChat());
      outboundRouter.sendTextMessage.mockResolvedValue({
        provider: 'whapi',
        providerMessageId: 'wamid.out-1',
      });

      const result = await service.createAgentMessage(baseData);

      expect(result.direction).toBe(MessageDirection.OUT);
      expect(result.from_me).toBe(true);
      expect(result.provider_message_id).toBe('wamid.out-1');
      expect(messageRepo.all()).toHaveLength(1);
    });

    it('met à jour le chat (unread_count=0, read_only=true) après envoi', async () => {
      const chat = makeChat();
      chatRepo.seed(chat);
      chatService.findBychat_id.mockResolvedValue(chat);
      outboundRouter.sendTextMessage.mockResolvedValue({
        provider: 'whapi',
        providerMessageId: 'wamid.out-2',
      });

      await service.createAgentMessage(baseData);

      const updated = chatRepo.all().find(c => c.chat_id === chat.chat_id);
      expect(updated?.unread_count).toBe(0);
      expect(updated?.read_only).toBe(true);
    });

    it('lève une erreur si la fenêtre de réponse (24h) est dépassée', async () => {
      chatService.findBychat_id.mockResolvedValue(makeChat());
      // Message reçu il y a 25h
      messageRepo.seed(makeInboundMessage(25));

      await expect(service.createAgentMessage(baseData)).rejects.toThrow(
        'RESPONSE_TIMEOUT_EXCEEDED',
      );
    });

    it("n'est pas bloqué si la fenetre est encore ouverte (< 24h)", async () => {
      chatService.findBychat_id.mockResolvedValue(makeChat());
      messageRepo.seed(makeInboundMessage(2));
      outboundRouter.sendTextMessage.mockResolvedValue({
        provider: 'whapi',
        providerMessageId: 'wamid.out-3',
      });

      await expect(service.createAgentMessage(baseData)).resolves.not.toThrow();
    });

    it('lève une erreur si le chat est introuvable', async () => {
      chatService.findBychat_id.mockResolvedValue(null);

      await expect(service.createAgentMessage(baseData)).rejects.toThrow('Chat not found');
    });

    it('lève NotFoundException si le channel est introuvable', async () => {
      chatService.findBychat_id.mockResolvedValue(makeChat());
      channelService.findOne.mockResolvedValue(null);
      outboundRouter.sendTextMessage.mockResolvedValue({
        provider: 'whapi',
        providerMessageId: 'wamid.x',
      });

      await expect(service.createAgentMessage(baseData)).rejects.toThrow(NotFoundException);
    });

    it('inclut le message quoté si quotedMessageId est fourni', async () => {
      const quoted: Partial<WhatsappMessage> = {
        id: 'quoted-msg-1',
        provider_message_id: 'prov-quoted',
        message_id: 'prov-quoted',
        timestamp: new Date(),
      };
      messageRepo.seed(quoted);
      chatService.findBychat_id.mockResolvedValue(makeChat());
      outboundRouter.sendTextMessage.mockResolvedValue({
        provider: 'whapi',
        providerMessageId: 'wamid.reply',
      });

      const result = await service.createAgentMessage({
        ...baseData,
        quotedMessageId: 'quoted-msg-1',
      });

      expect(result.quotedMessage?.id).toBe('quoted-msg-1');
      // Vérifie que le routeur reçoit bien le providerMessageId du message cité
      expect(outboundRouter.sendTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({ quotedProviderMessageId: 'prov-quoted' }),
      );
    });
  });

  describe('typingStart / typingStop', () => {
    it('appelle sendTyping(true) pour typingStart', async () => {
      await service.typingStart('33612345678@c.us');
      expect(communicationWhapiService.sendTyping).toHaveBeenCalledWith(
        '33612345678@c.us',
        true,
      );
    });

    it('appelle sendTyping(false) pour typingStop', async () => {
      await service.typingStop('33612345678@c.us');
      expect(communicationWhapiService.sendTyping).toHaveBeenCalledWith(
        '33612345678@c.us',
        false,
      );
    });
  });
});
