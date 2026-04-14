/**
 * TICKET-12-E — Tests unitaires : FlowEngineService
 *
 * Couvre les chemins principaux du moteur FlowBot :
 *   1. handleInbound — aucun flow ne matche
 *   2. handleInbound — session WAITING_REPLY existante → reprise
 *   3. handleInbound — nouveau flow, pas de nœud d'entrée → session annulée
 *   4. handleInbound — nouveau flow avec nœud MESSAGE → envoi + arête always
 *   5. handleInbound — nouveau flow avec nœud QUESTION → WAITING_REPLY
 *   6. handleInbound — nouveau flow avec nœud WAIT → WAITING_DELAY
 *   7. handleInbound — nouveau flow avec nœud END → session COMPLETED
 *   8. handleInbound — nouveau flow avec nœud ESCALATE → session ESCALATED
 *   9. resumeSession — session introuvable
 *  10. resumeSession — session dans un statut non-attendu (COMPLETED)
 *  11. resumeSession — WAITING_DELAY, reconstruit execCtx depuis variables
 *  12. resumeSession — aucune arête → termine la session
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FlowEngineService } from '../services/flow-engine.service';
import { BotProviderAdapterRegistry } from '../services/bot-provider-adapter-registry.service';
import { BotConversationService } from '../services/bot-conversation.service';
import { BotMessageService } from '../services/bot-message.service';
import { FlowSessionService } from '../services/flow-session.service';
import { FlowTriggerService } from '../services/flow-trigger.service';
import { FlowAnalyticsService } from '../services/flow-analytics.service';
import { FlowVariableService } from '../services/flow-variable.service';
import { FlowNode, FlowNodeType } from '../entities/flow-node.entity';
import { FlowEdge } from '../entities/flow-edge.entity';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowSessionLog } from '../entities/flow-session-log.entity';
import { BotConversation, BotConversationStatus } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent } from '../events/bot-inbound-message.event';
import { FlowTriggerType } from '../entities/flow-trigger.entity';
import { BOT_ESCALATE_EVENT } from '../events/bot-outbound.events';

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

function makeBotConv(overrides: Partial<BotConversation> = {}): BotConversation {
  return {
    id: 'bot-conv-uuid-1',
    chatRef: '33612345678@s.whatsapp.net',
    status: BotConversationStatus.IDLE,
    activeSessionId: null,
    isKnownContact: false,
    isReopened: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as BotConversation;
}

function makeSession(overrides: Partial<FlowSession> = {}): FlowSession {
  return {
    id: 'session-uuid-1',
    conversationId: 'bot-conv-uuid-1',
    flowId: 'flow-uuid-1',
    currentNodeId: 'node-uuid-1',
    status: FlowSessionStatus.ACTIVE,
    variables: {},
    stepsCount: 0,
    triggerType: null,
    startedAt: new Date(),
    lastActivityAt: null,
    completedAt: null,
    escalatedAt: null,
    conversation: makeBotConv(),
    logs: [],
    ...overrides,
  } as unknown as FlowSession;
}

function makeNode(type: FlowNodeType, overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-uuid-1',
    flowId: 'flow-uuid-1',
    type,
    label: `Node ${type}`,
    positionX: 0,
    positionY: 0,
    config: {},
    timeoutSeconds: null,
    isEntryPoint: true,
    ...overrides,
  } as FlowNode;
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id: 'edge-uuid-1',
    flowId: 'flow-uuid-1',
    sourceNodeId: 'node-uuid-1',
    targetNodeId: 'node-uuid-2',
    conditionType: 'always',
    conditionValue: null,
    conditionNegate: false,
    sortOrder: 0,
    ...overrides,
  } as FlowEdge;
}

function makeFlow() {
  return {
    id: 'flow-uuid-1',
    name: 'Test Flow',
    isActive: true,
    priority: 10,
    triggers: [],
    nodes: [],
    edges: [],
  };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const adapterRegistryMock = { getSafe: jest.fn(), register: jest.fn() };
const botConvServiceMock = { upsert: jest.fn(), save: jest.fn(), findById: jest.fn() };
const botMsgServiceMock = { saveOutbound: jest.fn() };
const sessionServiceMock = {
  getActiveSession: jest.fn(),
  createSession: jest.fn(),
  save: jest.fn(),
  findById: jest.fn(),
};
const triggerServiceMock = { findMatchingFlow: jest.fn() };
const analyticsServiceMock = {
  recordSessionStart: jest.fn(),
  recordCompletion: jest.fn(),
  recordEscalation: jest.fn(),
  recordExpiration: jest.fn(),
};
const variableServiceMock = { resolve: jest.fn((t: string) => t) };
const eventEmitterMock = { emit: jest.fn() };

const nodeRepoMock = { findOne: jest.fn(), find: jest.fn() };
const edgeRepoMock = { findOne: jest.fn(), find: jest.fn() };
const sessionRepoMock = {};
const logRepoMock = { create: jest.fn(), save: jest.fn() };

// Adapter factice (capabilities sans typing ni markAsRead)
const fakeAdapter = {
  provider: 'whapi',
  channelType: 'whatsapp',
  capabilities: jest.fn(() => ({ typing: false, markAsRead: false, media: true, templates: false, replyTo: false })),
  sendMessage: jest.fn().mockResolvedValue({ externalMessageRef: 'sent-msg-1', sentAt: new Date() }),
  sendTyping: jest.fn(),
  stopTyping: jest.fn(),
  markAsRead: jest.fn(),
  assignToAgent: jest.fn(),
  closeConversation: jest.fn(),
  emitConversationUpdated: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FlowEngineService', () => {
  let service: FlowEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    variableServiceMock.resolve.mockImplementation((t: string) => t);
    logRepoMock.create.mockImplementation((data: unknown) => data);
    logRepoMock.save.mockResolvedValue({});
    adapterRegistryMock.getSafe.mockReturnValue(fakeAdapter);
    botConvServiceMock.upsert.mockResolvedValue(makeBotConv());
    botConvServiceMock.save.mockResolvedValue(undefined);
    sessionServiceMock.save.mockResolvedValue(undefined);
    analyticsServiceMock.recordSessionStart.mockResolvedValue(undefined);
    analyticsServiceMock.recordCompletion.mockResolvedValue(undefined);
    analyticsServiceMock.recordEscalation.mockResolvedValue(undefined);
    botMsgServiceMock.saveOutbound.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowEngineService,
        { provide: BotProviderAdapterRegistry, useValue: adapterRegistryMock },
        { provide: BotConversationService, useValue: botConvServiceMock },
        { provide: BotMessageService, useValue: botMsgServiceMock },
        { provide: FlowSessionService, useValue: sessionServiceMock },
        { provide: FlowTriggerService, useValue: triggerServiceMock },
        { provide: FlowAnalyticsService, useValue: analyticsServiceMock },
        { provide: FlowVariableService, useValue: variableServiceMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: getRepositoryToken(FlowNode), useValue: nodeRepoMock },
        { provide: getRepositoryToken(FlowEdge), useValue: edgeRepoMock },
        { provide: getRepositoryToken(FlowSession), useValue: sessionRepoMock },
        { provide: getRepositoryToken(FlowSessionLog), useValue: logRepoMock },
      ],
    }).compile();

    service = module.get(FlowEngineService);
  });

  // ─── handleInbound ────────────────────────────────────────────────────────

  describe('handleInbound', () => {
    it('ne fait rien si aucun flow ne matche et pas de session active', async () => {
      sessionServiceMock.getActiveSession.mockResolvedValue(null);
      triggerServiceMock.findMatchingFlow.mockResolvedValue(null);

      await service.handleInbound(makeEvent());

      expect(sessionServiceMock.createSession).not.toHaveBeenCalled();
      expect(nodeRepoMock.findOne).not.toHaveBeenCalled();
    });

    it('reprend une session WAITING_REPLY existante sans chercher un nouveau flow', async () => {
      const waitingSession = makeSession({ status: FlowSessionStatus.WAITING_REPLY });
      sessionServiceMock.getActiveSession.mockResolvedValue(waitingSession);
      sessionServiceMock.findById.mockResolvedValue(
        makeSession({ status: FlowSessionStatus.WAITING_REPLY }),
      );
      edgeRepoMock.find.mockResolvedValue([]);

      await service.handleInbound(makeEvent({ messageText: 'oui' }));

      // Le texte entrant est stocké dans variables
      expect(sessionServiceMock.save).toHaveBeenCalled();
      // findMatchingFlow ne doit PAS être appelé
      expect(triggerServiceMock.findMatchingFlow).not.toHaveBeenCalled();
    });

    it('annule la session si le flow n\'a pas de nœud d\'entrée', async () => {
      sessionServiceMock.getActiveSession.mockResolvedValue(null);
      triggerServiceMock.findMatchingFlow.mockResolvedValue({
        flow: makeFlow(),
        triggerType: FlowTriggerType.INBOUND_MESSAGE,
      });
      const session = makeSession();
      sessionServiceMock.createSession.mockResolvedValue(session);
      nodeRepoMock.findOne.mockResolvedValue(null); // Pas de nœud d'entrée

      await service.handleInbound(makeEvent());

      const lastSaveCall = sessionServiceMock.save.mock.calls.at(-1)?.[0] as FlowSession;
      expect(lastSaveCall?.status).toBe(FlowSessionStatus.CANCELLED);
    });

    it('exécute le nœud MESSAGE et suit l\'arête always', async () => {
      sessionServiceMock.getActiveSession.mockResolvedValue(null);
      triggerServiceMock.findMatchingFlow.mockResolvedValue({
        flow: makeFlow(),
        triggerType: FlowTriggerType.INBOUND_MESSAGE,
      });
      const session = makeSession();
      sessionServiceMock.createSession.mockResolvedValue(session);

      const messageNode = makeNode(FlowNodeType.MESSAGE, {
        config: { body: 'Bonjour {contact_name}' },
        isEntryPoint: true,
      });
      const endNode = makeNode(FlowNodeType.END, { id: 'node-uuid-2', isEntryPoint: false });
      const alwaysEdge = makeEdge({ sourceNodeId: messageNode.id, targetNodeId: endNode.id });

      // Premier findOne → nœud d'entrée ; second → nœud END après arête
      nodeRepoMock.findOne
        .mockResolvedValueOnce(messageNode)  // entry node lookup
        .mockResolvedValueOnce(endNode);     // after always edge

      edgeRepoMock.findOne.mockResolvedValue(alwaysEdge);
      // Pour le nœud END, pas d'arête always
      edgeRepoMock.find.mockResolvedValue([]);

      await service.handleInbound(makeEvent());

      expect(fakeAdapter.sendMessage).toHaveBeenCalledTimes(1);
      expect(botMsgServiceMock.saveOutbound).toHaveBeenCalledTimes(1);
      // La session doit être COMPLETED après le nœud END
      const lastSave = sessionServiceMock.save.mock.calls.at(-1)?.[0] as FlowSession;
      expect(lastSave?.status).toBe(FlowSessionStatus.COMPLETED);
    });

    it('passe la session en WAITING_REPLY après un nœud QUESTION', async () => {
      sessionServiceMock.getActiveSession.mockResolvedValue(null);
      triggerServiceMock.findMatchingFlow.mockResolvedValue({
        flow: makeFlow(),
        triggerType: FlowTriggerType.INBOUND_MESSAGE,
      });
      const session = makeSession();
      sessionServiceMock.createSession.mockResolvedValue(session);

      const questionNode = makeNode(FlowNodeType.QUESTION, {
        config: { body: 'Quel est votre problème ?' },
        isEntryPoint: true,
      });
      nodeRepoMock.findOne.mockResolvedValue(questionNode);
      edgeRepoMock.findOne.mockResolvedValue(null);

      await service.handleInbound(makeEvent());

      const saveWithWaiting = sessionServiceMock.save.mock.calls.find(
        ([s]: [FlowSession]) => s.status === FlowSessionStatus.WAITING_REPLY,
      );
      expect(saveWithWaiting).toBeDefined();
    });

    it('passe la session en WAITING_DELAY après un nœud WAIT', async () => {
      sessionServiceMock.getActiveSession.mockResolvedValue(null);
      triggerServiceMock.findMatchingFlow.mockResolvedValue({
        flow: makeFlow(),
        triggerType: FlowTriggerType.INBOUND_MESSAGE,
      });
      const session = makeSession();
      sessionServiceMock.createSession.mockResolvedValue(session);

      const waitNode = makeNode(FlowNodeType.WAIT, {
        config: { delaySeconds: 30 },
        isEntryPoint: true,
      });
      nodeRepoMock.findOne.mockResolvedValue(waitNode);

      await service.handleInbound(makeEvent());

      const saveWithDelay = sessionServiceMock.save.mock.calls.find(
        ([s]: [FlowSession]) => s.status === FlowSessionStatus.WAITING_DELAY,
      );
      expect(saveWithDelay).toBeDefined();
    });

    it('escalade la session après un nœud ESCALATE', async () => {
      sessionServiceMock.getActiveSession.mockResolvedValue(null);
      triggerServiceMock.findMatchingFlow.mockResolvedValue({
        flow: makeFlow(),
        triggerType: FlowTriggerType.INBOUND_MESSAGE,
      });
      const session = makeSession();
      sessionServiceMock.createSession.mockResolvedValue(session);

      const escalateNode = makeNode(FlowNodeType.ESCALATE, {
        config: { agentRef: 'agent-uuid-99' },
        isEntryPoint: true,
      });
      nodeRepoMock.findOne.mockResolvedValue(escalateNode);

      await service.handleInbound(makeEvent());

      const saveWithEscalated = sessionServiceMock.save.mock.calls.find(
        ([s]: [FlowSession]) => s.status === FlowSessionStatus.ESCALATED,
      );
      expect(saveWithEscalated).toBeDefined();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        BOT_ESCALATE_EVENT,
        expect.objectContaining({ provider: 'whapi' }),
      );
    });
  });

  // ─── resumeSession ────────────────────────────────────────────────────────

  describe('resumeSession', () => {
    it('ne fait rien si la session est introuvable', async () => {
      sessionServiceMock.findById.mockResolvedValue(null);
      await service.resumeSession('non-existent-id', 'delay_expired');
      expect(sessionServiceMock.save).not.toHaveBeenCalled();
    });

    it('ne fait rien si la session est dans un statut non-attendu', async () => {
      sessionServiceMock.findById.mockResolvedValue(
        makeSession({ status: FlowSessionStatus.COMPLETED }),
      );
      await service.resumeSession('session-uuid-1', 'delay_expired');
      // save ne doit pas être appelé (on return immédiatement)
      expect(sessionServiceMock.save).not.toHaveBeenCalled();
    });

    it('reconstruit execCtx depuis session.variables si non fourni (WAITING_DELAY)', async () => {
      const session = makeSession({
        status: FlowSessionStatus.WAITING_DELAY,
        currentNodeId: 'node-uuid-1',
        variables: {
          __provider: 'meta',
          __channelType: 'whatsapp',
          __externalRef: '33699999999@s.whatsapp.net',
          __contactName: 'Alice',
          __contactRef: '33699999999',
        },
      });
      sessionServiceMock.findById.mockResolvedValue(session);
      sessionServiceMock.save.mockResolvedValue(undefined);

      const nextNode = makeNode(FlowNodeType.END, { id: 'node-uuid-2', isEntryPoint: false });
      const edge = makeEdge({ sourceNodeId: 'node-uuid-1', targetNodeId: 'node-uuid-2' });

      edgeRepoMock.find.mockResolvedValue([edge]);
      nodeRepoMock.findOne.mockResolvedValue(nextNode);

      await service.resumeSession('session-uuid-1', 'delay_expired');

      // La session est passée en ACTIVE puis traitée
      expect(sessionServiceMock.save).toHaveBeenCalled();
      // L'adapter doit être récupéré avec le provider 'meta' extrait des variables
      expect(adapterRegistryMock.getSafe).toHaveBeenCalledWith('meta');
    });

    it('termine la session si aucune arête n\'est disponible', async () => {
      const session = makeSession({
        status: FlowSessionStatus.WAITING_DELAY,
        currentNodeId: 'node-uuid-1',
        variables: {
          __provider: 'whapi',
          __channelType: 'whatsapp',
          __externalRef: '33612345678@s.whatsapp.net',
          __contactName: 'Test',
          __contactRef: '33612345678',
        },
      });
      sessionServiceMock.findById.mockResolvedValue(session);
      edgeRepoMock.find.mockResolvedValue([]); // Aucune arête

      await service.resumeSession('session-uuid-1', 'delay_expired');

      const lastSave = sessionServiceMock.save.mock.calls.at(-1)?.[0] as FlowSession;
      expect(lastSave?.status).toBe(FlowSessionStatus.COMPLETED);
    });

    it('utilise execCtx fourni explicitement si présent (WAITING_REPLY + inbound_reply)', async () => {
      const session = makeSession({
        status: FlowSessionStatus.WAITING_REPLY,
        currentNodeId: 'node-uuid-1',
        variables: { __provider: 'meta' }, // serait méta si reconstruit auto
      });
      sessionServiceMock.findById.mockResolvedValue(session);

      const endNode = makeNode(FlowNodeType.END, { id: 'node-uuid-2' });
      const edge = makeEdge({ sourceNodeId: 'node-uuid-1', targetNodeId: 'node-uuid-2' });
      edgeRepoMock.find.mockResolvedValue([edge]);
      nodeRepoMock.findOne.mockResolvedValue(endNode);

      const explicitCtx = {
        provider: 'whapi', // différent de ce qui est dans variables
        channelType: 'whatsapp',
        externalRef: '33612345678@s.whatsapp.net',
        contactName: 'Client',
        contactRef: '33612345678',
      };

      await service.resumeSession('session-uuid-1', 'inbound_reply', explicitCtx);

      // Doit utiliser le provider fourni ('whapi'), pas celui des variables ('meta')
      expect(adapterRegistryMock.getSafe).toHaveBeenCalledWith('whapi');
    });
  });
});
