import { Test, TestingModule } from '@nestjs/testing';
import { InboundStateUpdateService } from 'src/ingress/domain/inbound-state-update.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { ContextService } from '../services/context.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { ChatContext } from '../entities/chat-context.entity';

const makeChat = (): Partial<WhatsappChat> => ({
  chat_id: 'test@c.us',
  read_only: true,
  last_client_message_at: null,
});

const makeMessage = (): Partial<WhatsappMessage> => ({
  timestamp: new Date('2026-04-15T10:00:00Z'),
});

const makeChatContext = (id: string): ChatContext =>
  ({ id, chatId: 'test@c.us', contextId: 'ctx-1' }) as ChatContext;

describe('InboundStateUpdateService', () => {
  let service: InboundStateUpdateService;
  const chatService = { update: jest.fn() };
  const contextService = { updateChatContext: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundStateUpdateService,
        { provide: WhatsappChatService, useValue: chatService },
        { provide: ContextService, useValue: contextService },
      ],
    }).compile();

    service = module.get<InboundStateUpdateService>(InboundStateUpdateService);
  });

  // ─── ISU-01 : chemin isolé (CTX-C3) ───────────────────────────────────────

  it('ISU-01 : avec chatContext → utilise contextService.updateChatContext (chemin isolé)', async () => {
    const chat = makeChat() as WhatsappChat;
    const message = makeMessage() as WhatsappMessage;
    const chatContext = makeChatContext('cc-1');

    await service.apply(chat, message, chatContext);

    expect(contextService.updateChatContext).toHaveBeenCalledWith('cc-1', {
      readOnly: false,
      lastClientMessageAt: message.timestamp,
      lastActivityAt: message.timestamp,
    });
    expect(chatService.update).not.toHaveBeenCalled();
    expect(chat.read_only).toBe(false);
  });

  // ─── ISU-02 : chemin legacy (fallback) ────────────────────────────────────

  it('ISU-02 : sans chatContext → fallback chatService.update (comportement legacy)', async () => {
    const chat = makeChat() as WhatsappChat;
    const message = makeMessage() as WhatsappMessage;

    await service.apply(chat, message, undefined);

    expect(chatService.update).toHaveBeenCalledWith('test@c.us', {
      read_only: false,
      last_client_message_at: message.timestamp,
    });
    expect(contextService.updateChatContext).not.toHaveBeenCalled();
  });

  // ─── ISU-03 : mutation mémoire ────────────────────────────────────────────

  it('ISU-03 : mute conversation en mémoire dans les deux chemins', async () => {
    const chat1 = makeChat() as WhatsappChat;
    const message = makeMessage() as WhatsappMessage;

    await service.apply(chat1, message, makeChatContext('cc-1'));

    expect(chat1.read_only).toBe(false);
    expect(chat1.last_client_message_at).toEqual(message.timestamp);

    const chat2 = makeChat() as WhatsappChat;
    await service.apply(chat2, message, undefined);

    expect(chat2.read_only).toBe(false);
    expect(chat2.last_client_message_at).toEqual(message.timestamp);
  });
});
