import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { MessageAuto } from 'src/message-auto/entities/message-auto.entity';
import { MessageTemplateStatus } from 'src/message-auto/entities/message-template-status.entity';
import { AppLogger } from 'src/logging/app-logger.service';

const buildTemplate = (
  overrides: Partial<MessageAuto> = {},
): MessageAuto => ({
  id: 'tpl-1',
  body: 'Bonjour #name# !',
  templateName: 'hello_world',
  templateLanguage: 'fr',
  position: 1,
  actif: true,
  delai: 10,
  canal: null,
  conditions: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildService = (
  templateStatus: MessageTemplateStatus | null,
  template: MessageAuto | null,
) => {
  const autoMessageRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn().mockResolvedValue(template ? [template] : []),
    findOne: jest.fn().mockResolvedValue(template),
    delete: jest.fn(),
  };

  const templateStatusRepo = {
    findOne: jest.fn().mockResolvedValue(templateStatus),
  };

  const chatService = {
    findBychat_id: jest.fn().mockResolvedValue({
      chat_id: 'chat-test@s.whatsapp.net',
      name: 'Test Client',
      contact_client: '213612345678',
      last_client_message_at: new Date(),
      last_msg_client_channel_id: 'ch-1',
      auto_message_step: 0,
    }),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const messageService = {
    createAgentMessage: jest.fn().mockResolvedValue({ id: 'msg-1', text: 'Bonjour Test !' }),
    typingStart: jest.fn().mockResolvedValue(undefined),
    typingStop: jest.fn().mockResolvedValue(undefined),
  };

  const eventEmitter = {
    emit: jest.fn(),
  };

  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as AppLogger;

  const contactRepo = {
    findOne: jest.fn().mockResolvedValue(null), // pas de contact opt-out par défaut
  };

  const service = new MessageAutoService(
    autoMessageRepo as any,
    templateStatusRepo as any,
    contactRepo as any,
    chatService as any,
    messageService as any,
    eventEmitter as any,
    logger,
  );

  return {
    service,
    autoMessageRepo,
    templateStatusRepo,
    chatService,
    messageService,
    eventEmitter,
    logger,
  };
};

describe('MessageAutoService — guard template HSM', () => {
  const CHAT_ID = 'chat-test@s.whatsapp.net';
  const POSITION = 1;

  it('retourne sans envoyer si le statut du template est PAUSED', async () => {
    const template = buildTemplate();
    const templateStatus: Partial<MessageTemplateStatus> = {
      templateName: 'hello_world',
      language: 'fr',
      status: 'PAUSED',
    };

    const { service, messageService, logger } = buildService(
      templateStatus as MessageTemplateStatus,
      template,
    );

    await service.sendAutoMessage(CHAT_ID, POSITION);

    expect(messageService.createAgentMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TEMPLATE_SKIPPED'),
      expect.any(String),
    );
  });

  it('envoie le message si le statut du template est APPROVED', async () => {
    const template = buildTemplate();
    const templateStatus: Partial<MessageTemplateStatus> = {
      templateName: 'hello_world',
      language: 'fr',
      status: 'APPROVED',
    };

    const { service, messageService } = buildService(
      templateStatus as MessageTemplateStatus,
      template,
    );

    await service.sendAutoMessage(CHAT_ID, POSITION);

    expect(messageService.createAgentMessage).toHaveBeenCalled();
  });

  it('envoie le message si aucun enregistrement de statut n\'existe (pas de blocage par défaut)', async () => {
    const template = buildTemplate();

    const { service, messageService } = buildService(null, template);

    await service.sendAutoMessage(CHAT_ID, POSITION);

    expect(messageService.createAgentMessage).toHaveBeenCalled();
  });

  it('retourne sans envoyer si le statut du template est REJECTED', async () => {
    const template = buildTemplate();
    const templateStatus: Partial<MessageTemplateStatus> = {
      templateName: 'hello_world',
      language: 'fr',
      status: 'REJECTED',
    };

    const { service, messageService } = buildService(
      templateStatus as MessageTemplateStatus,
      template,
    );

    await service.sendAutoMessage(CHAT_ID, POSITION);

    expect(messageService.createAgentMessage).not.toHaveBeenCalled();
  });

  it('envoie le message si le template n\'a pas de templateName (message texte libre)', async () => {
    const template = buildTemplate({ templateName: null, templateLanguage: null });

    const { service, messageService, templateStatusRepo } = buildService(null, template);

    await service.sendAutoMessage(CHAT_ID, POSITION);

    // Le guard n'est pas appelé si pas de templateName
    expect(templateStatusRepo.findOne).not.toHaveBeenCalled();
    expect(messageService.createAgentMessage).toHaveBeenCalled();
  });
});
