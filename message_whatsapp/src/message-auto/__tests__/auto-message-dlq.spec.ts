import { AutoMessageOrchestrator } from 'src/message-auto/auto-message-orchestrator.service';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { AppLogger } from 'src/logging/app-logger.service';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { AutoMessageScopeConfigService } from 'src/message-auto/auto-message-scope-config.service';
import { NotificationService } from 'src/notification/notification.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from 'src/events/events.constants';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

/**
 * Expose handleAutoMessageFailure (méthode privée) via un cast any.
 */
type OrchestratorWithPrivate = {
  handleAutoMessageFailure(chatId: string): Promise<void>;
};

const buildOrchestrator = (chatStatusOverride?: string) => {
  const updates: Record<string, any>[] = [];

  const chatService = {
    findBychat_id: jest.fn().mockImplementation((_chatId: string) => {
      const chat: Partial<WhatsappChat> = {
        chat_id: _chatId,
        auto_message_status: chatStatusOverride ?? null,
        name: 'Client Test',
      };
      return Promise.resolve(chat as WhatsappChat);
    }),
    update: jest.fn().mockImplementation((_chatId: string, fields: any) => {
      updates.push(fields);
      // Mettre à jour le retour du mock pour simuler les changements d'état successifs
      chatService.findBychat_id.mockImplementationOnce((_id: string) => {
        return Promise.resolve({
          chat_id: _id,
          auto_message_status: fields.auto_message_status ?? chatStatusOverride ?? null,
          name: 'Client Test',
        } as WhatsappChat);
      });
      return Promise.resolve(undefined);
    }),
  };

  const messageAutoService = {} as unknown as MessageAutoService;

  const cronConfigService = {
    findByKey: jest.fn().mockResolvedValue({ enabled: true, maxSteps: 3 }),
  } as unknown as CronConfigService;

  const scopeConfigService = {
    isEnabledFor: jest.fn().mockResolvedValue(true),
  } as unknown as AutoMessageScopeConfigService;

  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as EventEmitter2;

  const notificationService = {
    create: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;

  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as AppLogger;

  const orchestrator = new AutoMessageOrchestrator(
    messageAutoService,
    chatService as any,
    cronConfigService,
    scopeConfigService,
    logger,
    eventEmitter,
    notificationService,
  ) as unknown as OrchestratorWithPrivate;

  return { orchestrator, chatService, eventEmitter, updates };
};

describe('AutoMessageOrchestrator — logique DLQ (handleAutoMessageFailure)', () => {
  const CHAT_ID = '213612345678@s.whatsapp.net';

  it('premier échec → auto_message_status = retrying:1', async () => {
    const { orchestrator, chatService } = buildOrchestrator(undefined);

    await orchestrator.handleAutoMessageFailure(CHAT_ID);

    expect(chatService.update).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ auto_message_status: 'retrying:1' }),
    );
  });

  it('deuxième échec (déjà retrying:1) → auto_message_status = retrying:2', async () => {
    const { orchestrator, chatService } = buildOrchestrator('retrying:1');

    await orchestrator.handleAutoMessageFailure(CHAT_ID);

    expect(chatService.update).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ auto_message_status: 'retrying:2' }),
    );
  });

  it('troisième échec (déjà retrying:2) → auto_message_status = failed + event AUTO_MESSAGE_FAILED émis', async () => {
    const { orchestrator, chatService, eventEmitter } = buildOrchestrator('retrying:2');

    await orchestrator.handleAutoMessageFailure(CHAT_ID);

    expect(chatService.update).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ auto_message_status: 'failed', read_only: false }),
    );

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EVENTS.AUTO_MESSAGE_FAILED,
      expect.objectContaining({ chat: expect.objectContaining({ chat_id: CHAT_ID }) }),
    );
  });

  it('ne traite pas si le chat est introuvable', async () => {
    const { orchestrator, chatService, eventEmitter } = buildOrchestrator();
    (chatService.findBychat_id as jest.Mock).mockResolvedValue(null);

    await orchestrator.handleAutoMessageFailure(CHAT_ID);

    expect(chatService.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
