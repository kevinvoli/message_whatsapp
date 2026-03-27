import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappMessageGateway protocol events', () => {
  const chatService = {
    findBychat_id: jest.fn(),
  };

  const makeGateway = () => {
    return new WhatsappMessageGateway(
      {} as any,
      chatService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any, // channelService
      { allow: () => true, removeClient: () => {} } as any, // throttle
      {} as any, // callLogService
      { create: jest.fn().mockResolvedValue({}) } as any, // notificationService
      { register: jest.fn(), unregister: jest.fn(), isConnected: jest.fn() } as any, // agentStateService
      { emit: jest.fn() } as any, // eventEmitter
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits CONTACT_UPSERT on contact:event', async () => {
    const gateway = makeGateway();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to } as any;

    chatService.findBychat_id.mockResolvedValue({ poste_id: 'poste-1' });

    await gateway.emitContactUpsert({
      id: 'contact-1',
      chat_id: 'chat-1',
    } as any);

    expect(to).toHaveBeenCalledWith('poste:poste-1');
    expect(emit).toHaveBeenCalledWith('contact:event', {
      type: 'CONTACT_UPSERT',
      payload: expect.objectContaining({
        id: 'contact-1',
        chat_id: 'chat-1',
      }),
    });
  });

  it('emits CONTACT_REMOVED on contact:event', async () => {
    const gateway = makeGateway();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to } as any;

    chatService.findBychat_id.mockResolvedValue({ poste_id: 'poste-2' });

    await gateway.emitContactRemoved({
      id: 'contact-2',
      chat_id: 'chat-2',
    } as any);

    expect(to).toHaveBeenCalledWith('poste:poste-2');
    expect(emit).toHaveBeenCalledWith('contact:event', {
      type: 'CONTACT_REMOVED',
      payload: {
        contact_id: 'contact-2',
        chat_id: 'chat-2',
      },
    });
  });

  it('emits CONTACT_CALL_STATUS_UPDATED on contact:event', async () => {
    const gateway = makeGateway();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to } as any;

    chatService.findBychat_id.mockResolvedValue({ poste_id: 'poste-3' });

    await gateway.emitContactCallStatusUpdated({
      id: 'contact-3',
      chat_id: 'chat-3',
      call_status: 'appelÃ©',
    } as any);

    expect(to).toHaveBeenCalledWith('poste:poste-3');
    expect(emit).toHaveBeenCalledWith('contact:event', {
      type: 'CONTACT_CALL_STATUS_UPDATED',
      payload: expect.objectContaining({
        id: 'contact-3',
        chat_id: 'chat-3',
      }),
    });
  });

  it('broadcasts TYPING_START via chat:event', () => {
    const gateway = makeGateway();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const client = { id: 'client-1', to } as any;

    const connectedAgents = (gateway as any).connectedAgents as Map<
      string,
      { commercialId: string; posteId: string }
    >;
    connectedAgents.set('client-1', {
      commercialId: 'commercial-1',
      posteId: 'poste-9',
    });

    gateway.handleChatEvent(client, {
      type: 'TYPING_START',
      payload: { chat_id: 'chat-9' },
    });

    expect(to).toHaveBeenCalledWith('poste:poste-9');
    expect(emit).toHaveBeenCalledWith('chat:event', {
      type: 'TYPING_START',
      payload: {
        chat_id: 'chat-9',
        commercial_id: 'commercial-1',
      },
    });
  });
});
