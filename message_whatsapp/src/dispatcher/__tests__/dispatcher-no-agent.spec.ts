import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { IConversationRepository } from 'src/domain/repositories/i-conversation.repository';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { AgentStateService } from 'src/agent-state/agent-state.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { NotificationService } from 'src/notification/notification.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

const buildDispatcher = (overrides?: {
  existingConversation?: WhatsappChat | null;
}) => {
  const savedChats: WhatsappChat[] = [];

  const chatRepository = {
    findByChatId: jest.fn().mockResolvedValue(overrides?.existingConversation ?? null),
    save: jest.fn().mockImplementation((chat: WhatsappChat) => {
      savedChats.push(chat);
      return Promise.resolve(chat);
    }),
    build: jest.fn().mockImplementation((data: Partial<WhatsappChat>) => data as WhatsappChat),
    update: jest.fn().mockResolvedValue(undefined),
    findRecentWaiting: jest.fn().mockResolvedValue([]),
    findExpiredSla: jest.fn().mockResolvedValue([]),
    findByChatIdShallow: jest.fn().mockResolvedValue(null),
    findByPosteId: jest.fn().mockResolvedValue([]),
    findByStatuses: jest.fn().mockResolvedValue([]),
    countQueuedPostesExcluding: jest.fn().mockResolvedValue(0),
  } as unknown as IConversationRepository;

  const queueService = {
    getNextInQueue: jest.fn().mockResolvedValue(null), // Aucun agent disponible
    getQueuePositions: jest.fn().mockResolvedValue([]),
    countQueuedPostesExcluding: jest.fn().mockResolvedValue(0),
  } as unknown as QueueService;

  const agentStateService = {
    isConnected: jest.fn().mockReturnValue(false),
  } as unknown as AgentStateService;

  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as EventEmitter2;

  const whatsappCommercialService = {} as unknown as WhatsappCommercialService;

  const notificationService = {
    create: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;

  const service = new DispatcherService(
    chatRepository,
    queueService,
    agentStateService,
    eventEmitter,
    whatsappCommercialService,
    notificationService,
  );

  return { service, chatRepository, queueService, agentStateService, eventEmitter, savedChats, notificationService };
};

describe('DispatcherService — aucun agent disponible', () => {
  it('crée une conversation EN_ATTENTE si aucun agent et pas de conversation existante', async () => {
    const { service, savedChats } = buildDispatcher({ existingConversation: null });

    const result = await service.assignConversation(
      '213612345678@s.whatsapp.net',
      'Client Test',
    );

    expect(result).not.toBeNull();
    expect(result?.status).toBe(WhatsappChatStatus.EN_ATTENTE);
    expect(savedChats.length).toBeGreaterThan(0);
    const saved = savedChats[0];
    expect(saved.status).toBe(WhatsappChatStatus.EN_ATTENTE);
    expect(saved.poste).toBeNull();
    expect(saved.poste_id).toBeNull();
  });

  it('n\'assigne pas de poste quand la queue est vide', async () => {
    const { service, queueService } = buildDispatcher({ existingConversation: null });

    await service.assignConversation('213612345678@s.whatsapp.net', 'Client Test');

    expect(queueService.getNextInQueue).toHaveBeenCalled();
  });

  it('met la conversation existante EN_ATTENTE si l\'agent est déconnecté', async () => {
    const existingConversation: Partial<WhatsappChat> = {
      id: 'chat-1',
      chat_id: '213612345678@s.whatsapp.net',
      status: WhatsappChatStatus.ACTIF,
      poste: { id: 'poste-1' } as any,
      poste_id: 'poste-1',
      unread_count: 0,
      read_only: false,
    };

    const { service, savedChats } = buildDispatcher({
      existingConversation: existingConversation as WhatsappChat,
    });

    await service.assignConversation(
      '213612345678@s.whatsapp.net',
      'Client Test',
    );

    // Quand l'agent est déconnecté et la queue est vide, la conversation passe EN_ATTENTE
    const saved = savedChats.find((c) => c.chat_id === '213612345678@s.whatsapp.net');
    expect(saved).toBeDefined();
    expect(saved?.status).toBe(WhatsappChatStatus.EN_ATTENTE);
    expect(saved?.poste).toBeNull();
    expect(saved?.poste_id).toBeNull();
  });

  it('crée une notification "queue" quand aucun agent n\'est disponible', async () => {
    const { service, notificationService } = buildDispatcher({ existingConversation: null });

    await service.assignConversation('213612345678@s.whatsapp.net', 'Client Test');

    expect(notificationService.create).toHaveBeenCalledWith(
      'queue',
      expect.stringContaining('attente'),
      expect.any(String),
    );
  });

  it('n\'émet pas d\'événement CONVERSATION_ASSIGNED si aucun agent', async () => {
    const { service, eventEmitter } = buildDispatcher({ existingConversation: null });

    await service.assignConversation('213612345678@s.whatsapp.net', 'Client Test');

    const emittedEvents = (eventEmitter.emit as jest.Mock).mock.calls.map((c) => c[0]);
    expect(emittedEvents).not.toContain('conversation.assigned');
  });
});
