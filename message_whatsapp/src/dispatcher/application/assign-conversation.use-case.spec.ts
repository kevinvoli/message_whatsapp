import { Test, TestingModule } from '@nestjs/testing';
import { AssignConversationUseCase } from './assign-conversation.use-case';
import { DispatchQueryService } from '../infrastructure/dispatch-query.service';
import { DispatchPolicyService } from '../domain/dispatch-policy.service';
import { SlaPolicyService } from '../domain/sla-policy.service';
import { ChannelService } from 'src/channel/channel.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { NotificationService } from 'src/notification/notification.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

describe('AssignConversationUseCase', () => {
  let useCase: AssignConversationUseCase;

  const queryService = {
    findChatByChatId: jest.fn(),
    saveChat: jest.fn(),
    createChat: jest.fn((data) => data),
    updateChat: jest.fn(),
  };
  const dispatchPolicy = {
    resolvePosteForChannel: jest.fn(),
    isEligibleForAgentReuse: jest.fn(),
  };
  const channelService = {
    getDedicatedPosteId: jest.fn(),
  };
  const conversationPublisher = {
    emitConversationAssigned: jest.fn(),
    emitConversationUpsertByChatId: jest.fn(),
  };
  const notificationService = {
    create: jest.fn(),
  };
  const slaPolicy = new SlaPolicyService();
  const gateway = {
    isAgentConnected: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    queryService.saveChat.mockImplementation(async (c) => c);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignConversationUseCase,
        { provide: DispatchQueryService, useValue: queryService },
        { provide: DispatchPolicyService, useValue: dispatchPolicy },
        { provide: ChannelService, useValue: channelService },
        { provide: ConversationPublisher, useValue: conversationPublisher },
        { provide: NotificationService, useValue: notificationService },
        { provide: SlaPolicyService, useValue: slaPolicy },
        { provide: WhatsappMessageGateway, useValue: gateway },
      ],
    }).compile();

    useCase = module.get<AssignConversationUseCase>(AssignConversationUseCase);
  });

  // ─── UC-01 : nouvelle conversation → poste actif → ACTIF ─────────────────

  it('UC-01 : nouvelle conversation → poste actif → statut ACTIF', async () => {
    queryService.findChatByChatId.mockResolvedValue(null);
    channelService.getDedicatedPosteId.mockResolvedValue(null);
    gateway.isAgentConnected.mockReturnValue(false);
    dispatchPolicy.isEligibleForAgentReuse.mockReturnValue(false);
    dispatchPolicy.resolvePosteForChannel.mockResolvedValue({
      poste: { id: 'poste-1', name: 'Poste 1', is_active: true },
      isDedicatedMode: false,
    });

    const result = await useCase.execute('client@c.us', 'Ahmed');

    expect(result?.status).toBe(WhatsappChatStatus.ACTIF);
    expect(result?.poste_id).toBe('poste-1');
    expect(conversationPublisher.emitConversationAssigned).toHaveBeenCalledWith('client@c.us');
  });

  // ─── UC-02 : nouvelle conversation → poste offline → EN_ATTENTE ──────────

  it('UC-02 : nouvelle conversation → poste offline → statut EN_ATTENTE + mode OFFLINE', async () => {
    queryService.findChatByChatId.mockResolvedValue(null);
    channelService.getDedicatedPosteId.mockResolvedValue(null);
    gateway.isAgentConnected.mockReturnValue(false);
    dispatchPolicy.isEligibleForAgentReuse.mockReturnValue(false);
    dispatchPolicy.resolvePosteForChannel.mockResolvedValue({
      poste: { id: 'poste-1', name: 'Poste 1', is_active: false },
      isDedicatedMode: false,
    });

    const result = await useCase.execute('client@c.us', 'Ahmed');

    expect(result?.status).toBe(WhatsappChatStatus.EN_ATTENTE);
    expect(result?.assigned_mode).toBe('OFFLINE');
  });

  // ─── UC-03 : aucun agent → mise en attente sans poste ────────────────────

  it('UC-03 : aucun agent disponible → conversation EN_ATTENTE sans poste', async () => {
    queryService.findChatByChatId.mockResolvedValue(null);
    channelService.getDedicatedPosteId.mockResolvedValue(null);
    gateway.isAgentConnected.mockReturnValue(false);
    dispatchPolicy.isEligibleForAgentReuse.mockReturnValue(false);
    dispatchPolicy.resolvePosteForChannel.mockResolvedValue({ poste: null, isDedicatedMode: false });

    const result = await useCase.execute('client@c.us', 'Ahmed');

    expect(result?.status).toBe(WhatsappChatStatus.EN_ATTENTE);
    expect(result?.poste_id).toBeNull();
    expect(conversationPublisher.emitConversationAssigned).not.toHaveBeenCalled();
    expect(notificationService.create).toHaveBeenCalledWith(
      'queue',
      expect.stringContaining('attente'),
      expect.any(String),
    );
  });

  // ─── UC-04 : conversation existante + agent éligible → incrément ──────────

  it('UC-04 : agent éligible → incrément unread, pas de réassignation', async () => {
    const existing: Partial<WhatsappChat> = {
      chat_id: 'client@c.us',
      read_only: false,
      unread_count: 2,
      last_activity_at: new Date(),
      first_response_deadline_at: new Date(),
      last_poste_message_at: new Date(),
      poste: { id: 'poste-1', name: 'Poste 1' } as any,
      poste_id: 'poste-1',
      status: WhatsappChatStatus.ACTIF,
    };
    queryService.findChatByChatId.mockResolvedValue(existing);
    channelService.getDedicatedPosteId.mockResolvedValue(null);
    gateway.isAgentConnected.mockReturnValue(true);
    dispatchPolicy.isEligibleForAgentReuse.mockReturnValue(true);

    await useCase.execute('client@c.us', 'Ahmed');

    expect(dispatchPolicy.resolvePosteForChannel).not.toHaveBeenCalled();
    expect(existing.unread_count).toBe(3);
    expect(conversationPublisher.emitConversationUpsertByChatId).toHaveBeenCalled();
  });

  // ─── UC-05 : canal dédié → poste dédié actif → ACTIF ────────────────────

  it('UC-05 : canal dédié actif → assignation au poste dédié, statut ACTIF', async () => {
    queryService.findChatByChatId.mockResolvedValue(null);
    channelService.getDedicatedPosteId.mockResolvedValue('poste-ded');
    gateway.isAgentConnected.mockReturnValue(false);
    dispatchPolicy.isEligibleForAgentReuse.mockReturnValue(false);
    dispatchPolicy.resolvePosteForChannel.mockResolvedValue({
      poste: { id: 'poste-ded', name: 'Poste Dédié', is_active: true },
      isDedicatedMode: true,
    });

    const result = await useCase.execute('c@c.us', 'Sara', undefined, undefined, 'channel-A');

    expect(result?.poste_id).toBe('poste-ded');
    expect(result?.status).toBe(WhatsappChatStatus.ACTIF);
    expect(dispatchPolicy.resolvePosteForChannel).toHaveBeenCalledWith('channel-A');
  });

  // ─── UC-06 : conversation read_only non fermée → ignorée ─────────────────

  it('UC-06 : conversation read_only → incrément unread seulement', async () => {
    const existing: Partial<WhatsappChat> = {
      chat_id: 'locked@c.us',
      read_only: true,
      unread_count: 1,
      last_activity_at: new Date(),
      status: WhatsappChatStatus.ACTIF,
    };
    queryService.findChatByChatId.mockResolvedValue(existing);

    const result = await useCase.execute('locked@c.us', 'Client');

    expect(result?.unread_count).toBe(2);
    expect(dispatchPolicy.resolvePosteForChannel).not.toHaveBeenCalled();
  });

  // ─── UC-07 : deadline initiale injectée via SlaPolicyService ─────────────

  it('UC-07 : deadline initiale ~ 5 min', async () => {
    queryService.findChatByChatId.mockResolvedValue(null);
    channelService.getDedicatedPosteId.mockResolvedValue(null);
    gateway.isAgentConnected.mockReturnValue(false);
    dispatchPolicy.isEligibleForAgentReuse.mockReturnValue(false);
    dispatchPolicy.resolvePosteForChannel.mockResolvedValue({
      poste: { id: 'p1', name: 'P1', is_active: true },
      isDedicatedMode: false,
    });

    const before = Date.now();
    const result = await useCase.execute('new@c.us', 'New');
    const after = Date.now();

    const deadline = result?.first_response_deadline_at?.getTime() ?? 0;
    expect(deadline).toBeGreaterThanOrEqual(before + 4 * 60_000);
    expect(deadline).toBeLessThanOrEqual(after + 6 * 60_000);
  });
});
