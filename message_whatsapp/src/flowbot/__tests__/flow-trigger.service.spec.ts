/**
 * TICKET-12-E — Tests unitaires : FlowTriggerService
 *
 * Couvre la logique d'évaluation des triggers :
 *   1. INBOUND_MESSAGE → toujours true
 *   2. CONVERSATION_OPEN → uniquement sur isNewConversation
 *   3. CONVERSATION_REOPEN → uniquement sur isReopened
 *   4. OUT_OF_HOURS → uniquement sur isOutOfHours
 *   5. KEYWORD → match si le texte contient le mot-clé (insensible à la casse)
 *   6. ON_ASSIGN → vrai si agentAssignedRef présent
 *   7. findMatchingFlow : scope provider/channelType, priorité, trigger inactif
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FlowTriggerService } from '../services/flow-trigger.service';
import { FlowBot } from '../entities/flow-bot.entity';
import { FlowTrigger, FlowTriggerType } from '../entities/flow-trigger.entity';
import { BotConversation, BotConversationStatus } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent } from '../events/bot-inbound-message.event';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<BotInboundMessageEvent> = {}): BotInboundMessageEvent {
  return {
    provider: 'whapi',
    channelType: 'whatsapp',
    conversationExternalRef: '33612345678@s.whatsapp.net',
    contactExternalId: '33612345678',
    contactName: 'Client Test',
    messageText: 'Bonjour',
    messageType: 'text',
    externalMessageRef: 'ext-msg-001',
    receivedAt: new Date(),
    isNewConversation: false,
    isReopened: false,
    isOutOfHours: false,
    ...overrides,
  } as BotInboundMessageEvent;
}

function makeConv(overrides: Partial<BotConversation> = {}): BotConversation {
  return {
    id: 'bot-conv-1',
    chatRef: '33612345678@s.whatsapp.net',
    status: BotConversationStatus.IDLE,
    activeSessionId: null,
    isKnownContact: false,
    isReopened: false,
    ...overrides,
  } as BotConversation;
}

function makeTrigger(
  type: FlowTriggerType,
  config: Record<string, unknown> = {},
  isActive = true,
): FlowTrigger {
  return {
    id: `trigger-${type}`,
    flowId: 'flow-uuid-1',
    triggerType: type,
    config,
    isActive,
  } as FlowTrigger;
}

function makeFlow(
  triggers: FlowTrigger[],
  overrides: Partial<FlowBot> = {},
): FlowBot {
  return {
    id: 'flow-uuid-1',
    name: 'Test Flow',
    isActive: true,
    priority: 10,
    scopeChannelType: null,
    scopeProviderRef: null,
    triggers,
    nodes: [],
    edges: [],
    sessions: [],
    ...overrides,
  } as unknown as FlowBot;
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const flowRepoMock = { find: jest.fn() };
const triggerRepoMock = {};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FlowTriggerService', () => {
  let service: FlowTriggerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowTriggerService,
        { provide: getRepositoryToken(FlowBot), useValue: flowRepoMock },
        { provide: getRepositoryToken(FlowTrigger), useValue: triggerRepoMock },
      ],
    }).compile();

    service = module.get(FlowTriggerService);
  });

  describe('findMatchingFlow', () => {
    it('retourne null si aucun flow actif', async () => {
      flowRepoMock.find.mockResolvedValue([]);
      const result = await service.findMatchingFlow(makeConv(), makeEvent());
      expect(result).toBeNull();
    });

    it('INBOUND_MESSAGE → match toujours', async () => {
      const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
      const flow = makeFlow([trigger]);
      flowRepoMock.find.mockResolvedValue([flow]);

      const result = await service.findMatchingFlow(makeConv(), makeEvent());
      expect(result).not.toBeNull();
      expect(result?.flow.id).toBe(flow.id);
      expect(result?.triggerType).toBe(FlowTriggerType.INBOUND_MESSAGE);
    });

    it('CONVERSATION_OPEN → match uniquement si isNewConversation=true', async () => {
      const trigger = makeTrigger(FlowTriggerType.CONVERSATION_OPEN);
      const flow = makeFlow([trigger]);
      flowRepoMock.find.mockResolvedValue([flow]);

      // Pas une nouvelle conversation → pas de match
      expect(await service.findMatchingFlow(makeConv(), makeEvent({ isNewConversation: false }))).toBeNull();
      // Nouvelle conversation → match
      expect(await service.findMatchingFlow(makeConv(), makeEvent({ isNewConversation: true }))).not.toBeNull();
    });

    it('CONVERSATION_REOPEN → match uniquement si isReopened=true', async () => {
      const trigger = makeTrigger(FlowTriggerType.CONVERSATION_REOPEN);
      const flow = makeFlow([trigger]);
      flowRepoMock.find.mockResolvedValue([flow]);

      expect(await service.findMatchingFlow(makeConv(), makeEvent({ isReopened: false }))).toBeNull();
      expect(await service.findMatchingFlow(makeConv(), makeEvent({ isReopened: true }))).not.toBeNull();
    });

    it('OUT_OF_HOURS → match uniquement si isOutOfHours=true', async () => {
      const trigger = makeTrigger(FlowTriggerType.OUT_OF_HOURS);
      const flow = makeFlow([trigger]);
      flowRepoMock.find.mockResolvedValue([flow]);

      expect(await service.findMatchingFlow(makeConv(), makeEvent({ isOutOfHours: false }))).toBeNull();
      expect(await service.findMatchingFlow(makeConv(), makeEvent({ isOutOfHours: true }))).not.toBeNull();
    });

    it('ON_ASSIGN → match uniquement si agentAssignedRef présent', async () => {
      const trigger = makeTrigger(FlowTriggerType.ON_ASSIGN);
      const flow = makeFlow([trigger]);
      flowRepoMock.find.mockResolvedValue([flow]);

      expect(await service.findMatchingFlow(makeConv(), makeEvent({ agentAssignedRef: undefined }))).toBeNull();
      expect(
        await service.findMatchingFlow(makeConv(), makeEvent({ agentAssignedRef: 'agent-1' })),
      ).not.toBeNull();
    });

    describe('KEYWORD', () => {
      it('match si le texte contient le mot-clé (insensible à la casse)', async () => {
        const trigger = makeTrigger(FlowTriggerType.KEYWORD, { keywords: ['aide', 'help'] });
        const flow = makeFlow([trigger]);
        flowRepoMock.find.mockResolvedValue([flow]);

        expect(
          await service.findMatchingFlow(makeConv(), makeEvent({ messageText: "j'ai besoin d'AIDE" })),
        ).not.toBeNull();
      });

      it('pas de match si aucun mot-clé présent', async () => {
        const trigger = makeTrigger(FlowTriggerType.KEYWORD, { keywords: ['aide', 'help'] });
        const flow = makeFlow([trigger]);
        flowRepoMock.find.mockResolvedValue([flow]);

        expect(
          await service.findMatchingFlow(makeConv(), makeEvent({ messageText: 'bonjour' })),
        ).toBeNull();
      });

      it('pas de match si messageText absent', async () => {
        const trigger = makeTrigger(FlowTriggerType.KEYWORD, { keywords: ['aide'] });
        const flow = makeFlow([trigger]);
        flowRepoMock.find.mockResolvedValue([flow]);

        expect(
          await service.findMatchingFlow(makeConv(), makeEvent({ messageText: undefined })),
        ).toBeNull();
      });
    });

    describe('scope filtering', () => {
      it('ignore le flow si scopeChannelType ne correspond pas', async () => {
        const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
        const flow = makeFlow([trigger], { scopeChannelType: 'telegram' });
        flowRepoMock.find.mockResolvedValue([flow]);

        // Event channelType='whatsapp' ne correspond pas à scopeChannelType='telegram'
        expect(await service.findMatchingFlow(makeConv(), makeEvent({ channelType: 'whatsapp' }))).toBeNull();
      });

      it('accepte le flow si scopeChannelType correspond', async () => {
        const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
        const flow = makeFlow([trigger], { scopeChannelType: 'whatsapp' });
        flowRepoMock.find.mockResolvedValue([flow]);

        expect(await service.findMatchingFlow(makeConv(), makeEvent({ channelType: 'whatsapp' }))).not.toBeNull();
      });

      it('ignore le flow si scopeProviderRef ne correspond pas', async () => {
        const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
        const flow = makeFlow([trigger], { scopeProviderRef: 'meta' });
        flowRepoMock.find.mockResolvedValue([flow]);

        expect(await service.findMatchingFlow(makeConv(), makeEvent({ provider: 'whapi' }))).toBeNull();
      });
    });

    it('ignore les triggers inactifs', async () => {
      const inactiveTrigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE, {}, false);
      const flow = makeFlow([inactiveTrigger]);
      flowRepoMock.find.mockResolvedValue([flow]);

      expect(await service.findMatchingFlow(makeConv(), makeEvent())).toBeNull();
    });

    it('prend le premier flow qui matche (ordre de priorité respecté)', async () => {
      const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
      const highPriorityFlow = makeFlow([trigger], { id: 'flow-high', priority: 100 });
      const lowPriorityFlow = makeFlow([trigger], { id: 'flow-low', priority: 10 });
      // find() retourne déjà trié par priority DESC (simulé ici)
      flowRepoMock.find.mockResolvedValue([highPriorityFlow, lowPriorityFlow]);

      const result = await service.findMatchingFlow(makeConv(), makeEvent());
      expect(result?.flow.id).toBe('flow-high');
    });

    it('QUEUE_WAIT (polling) → ne matche pas via findMatchingFlow', async () => {
      const trigger = makeTrigger(FlowTriggerType.QUEUE_WAIT);
      const flow = makeFlow([trigger]);
      flowRepoMock.find.mockResolvedValue([flow]);

      expect(await service.findMatchingFlow(makeConv(), makeEvent())).toBeNull();
    });
  });
});
