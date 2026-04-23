/**
 * TICKET-10-C — Tests d'intégration : pipeline BOT_INBOUND_EVENT
 *
 * Teste le fil complet :
 *   EventEmitter2.emit(BOT_INBOUND_EVENT) →
 *   BotInboundListener.handle() →
 *   FlowEngineService.handleInbound() →
 *   FlowTriggerService.findMatchingFlow() →
 *   FlowVariableService.resolve() →
 *   adapter.sendMessage()
 *
 * Niveau : intégration avec vrais services NestJS (Listener + Engine + TriggerService + VariableService),
 * mocks uniquement sur les couches externes (TypeORM repos, BotConvService, SessionService,
 * AnalyticsService, BotMsgService, AdapterRegistry).
 *
 * Scénarios couverts :
 *   1. Golden path MESSAGE → END : adapter.sendMessage() appelé, session COMPLETED
 *   2. Nœud QUESTION → session passe en WAITING_REPLY
 *   3. Reprise WAITING_REPLY → deuxième event reprend la session → COMPLETED
 *   4. KEYWORD trigger : pas de match → aucune session créée
 *   5. Flow inactif → aucune session créée
 *   6. Nœud WAIT → session passe en WAITING_DELAY
 *   7. Nœud ESCALATE → session ESCALATED + événement BOT_ESCALATE_EVENT émis
 *   8. Pas de nœud d'entrée → session CANCELLED
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BotInboundListener } from '../listeners/bot-inbound.listener';
import { FlowEngineService } from '../services/flow-engine.service';
import { FlowTriggerService } from '../services/flow-trigger.service';
import { FlowVariableService } from '../services/flow-variable.service';
import { BotProviderAdapterRegistry } from '../services/bot-provider-adapter-registry.service';
import { BotConversationService } from '../services/bot-conversation.service';
import { BotMessageService } from '../services/bot-message.service';
import { FlowSessionService } from '../services/flow-session.service';
import { FlowAnalyticsService } from '../services/flow-analytics.service';
import { FlowNode, FlowNodeType } from '../entities/flow-node.entity';
import { FlowEdge } from '../entities/flow-edge.entity';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowSessionLog } from '../entities/flow-session-log.entity';
import { FlowBot } from '../entities/flow-bot.entity';
import { FlowTrigger, FlowTriggerType } from '../entities/flow-trigger.entity';
import { BotConversation, BotConversationStatus } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent, BOT_INBOUND_EVENT } from '../events/bot-inbound-message.event';
import { BOT_ESCALATE_EVENT } from '../events/bot-outbound.events';
import { AiAssistantService } from 'src/ai-assistant/ai-assistant.service';

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
    currentNodeId: 'node-entry',
    status: FlowSessionStatus.ACTIVE,
    variables: {},
    stepsCount: 0,
    triggerType: 'INBOUND_MESSAGE',
    startedAt: new Date(),
    lastActivityAt: new Date(),
    completedAt: null,
    escalatedAt: null,
    conversation: makeBotConv(),
    logs: [],
    ...overrides,
  } as unknown as FlowSession;
}

function makeFlow(triggers: FlowTrigger[]): FlowBot {
  return {
    id: 'flow-uuid-1',
    name: 'Flow intégration',
    isActive: true,
    priority: 10,
    scopeChannelType: null,
    scopeProviderRef: null,
    triggers,
    nodes: [],
    edges: [],
    sessions: [],
  } as unknown as FlowBot;
}

function makeTrigger(type: FlowTriggerType, config: Record<string, unknown> = {}): FlowTrigger {
  return {
    id: `trigger-${type}`,
    flowId: 'flow-uuid-1',
    triggerType: type,
    config,
    isActive: true,
  } as FlowTrigger;
}

function makeNode(type: FlowNodeType, overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-entry',
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

function makeEdge(sourceId: string, targetId: string): FlowEdge {
  return {
    id: 'edge-always',
    flowId: 'flow-uuid-1',
    sourceNodeId: sourceId,
    targetNodeId: targetId,
    conditionType: 'always',
    conditionValue: null,
    conditionNegate: false,
    sortOrder: 0,
  } as FlowEdge;
}

// ─── Mocks externes ───────────────────────────────────────────────────────────

// Adapter factice — capability typing=false pour simplifier
const fakeAdapter = {
  provider: 'whapi',
  channelType: 'whatsapp',
  capabilities: jest.fn(() => ({ typing: false, markAsRead: false, media: true, templates: false, replyTo: false })),
  sendMessage: jest.fn().mockResolvedValue({ externalMessageRef: 'sent-001', sentAt: new Date() }),
  sendTyping: jest.fn(),
  stopTyping: jest.fn(),
  markAsRead: jest.fn(),
  assignToAgent: jest.fn(),
  closeConversation: jest.fn(),
  emitConversationUpdated: jest.fn(),
};

const adapterRegistryMock = { getSafe: jest.fn(() => fakeAdapter), register: jest.fn() };
const botConvServiceMock = {
  upsert: jest.fn(),
  save: jest.fn(),
  findById: jest.fn(),
  findByChatRef: jest.fn(),
};
const botMsgServiceMock = { saveOutbound: jest.fn().mockResolvedValue(undefined) };
const sessionServiceMock = {
  getActiveSession: jest.fn(),
  createSession: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn(),
  findExpiredWaitingDelay: jest.fn(),
  findExpiredWaitingReply: jest.fn(),
};
const analyticsServiceMock = {
  recordSessionStart: jest.fn().mockResolvedValue(undefined),
  recordCompletion: jest.fn().mockResolvedValue(undefined),
  recordEscalation: jest.fn().mockResolvedValue(undefined),
  recordExpiration: jest.fn().mockResolvedValue(undefined),
};

// TypeORM repos
const nodeRepoMock = { findOne: jest.fn(), find: jest.fn() };
const edgeRepoMock = { findOne: jest.fn(), find: jest.fn() };
const sessionRepoMock = {};
const logRepoMock = { create: jest.fn((d: unknown) => d), save: jest.fn().mockResolvedValue({}) };
// Pour FlowTriggerService (utilisé réellement, pas mocké)
const flowRepoMock = { find: jest.fn() };
const triggerRepoMock = {};

// ─── Setup module ─────────────────────────────────────────────────────────────

describe('BotInbound Pipeline (intégration)', () => {
  let module: TestingModule;
  let eventEmitter: EventEmitter2;
  let sessionSaveCalls: FlowSession[];

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionSaveCalls = [];

    // Intercepter les appels à sessionService.save pour extraire les statuts
    sessionServiceMock.save.mockImplementation((s: FlowSession) => {
      sessionSaveCalls.push({ ...s });
      return Promise.resolve(s);
    });
    botConvServiceMock.save.mockResolvedValue(undefined);

    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        // Services réels (intégration)
        BotInboundListener,
        FlowEngineService,
        FlowTriggerService,
        FlowVariableService,
        // Services mockés
        { provide: BotProviderAdapterRegistry, useValue: adapterRegistryMock },
        { provide: BotConversationService, useValue: botConvServiceMock },
        { provide: BotMessageService, useValue: botMsgServiceMock },
        { provide: FlowSessionService, useValue: sessionServiceMock },
        { provide: FlowAnalyticsService, useValue: analyticsServiceMock },
        { provide: AiAssistantService, useValue: { generateReply: jest.fn() } },
        // TypeORM repos
        { provide: getRepositoryToken(FlowNode), useValue: nodeRepoMock },
        { provide: getRepositoryToken(FlowEdge), useValue: edgeRepoMock },
        { provide: getRepositoryToken(FlowSession), useValue: sessionRepoMock },
        { provide: getRepositoryToken(FlowSessionLog), useValue: logRepoMock },
        { provide: getRepositoryToken(FlowBot), useValue: flowRepoMock },
        { provide: getRepositoryToken(FlowTrigger), useValue: triggerRepoMock },
      ],
    }).compile();

    eventEmitter = module.get(EventEmitter2);
    await module.init();
  });

  afterEach(async () => {
    await module.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 1 — Golden path : MESSAGE → END
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 1 : MESSAGE → END — adapter.sendMessage appelé, session COMPLETED', async () => {
    const conv = makeBotConv();
    const session = makeSession();
    const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
    const flow = makeFlow([trigger]);
    const messageNode = makeNode(FlowNodeType.MESSAGE, {
      id: 'node-entry',
      config: { body: 'Bonjour {contact_name} !' },
      isEntryPoint: true,
    });
    const endNode = makeNode(FlowNodeType.END, { id: 'node-end', isEntryPoint: false });
    const alwaysEdge = makeEdge('node-entry', 'node-end');

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);
    sessionServiceMock.createSession.mockResolvedValue(session);
    nodeRepoMock.findOne
      .mockResolvedValueOnce(messageNode)  // entry point
      .mockResolvedValueOnce(endNode);     // after always edge → END
    edgeRepoMock.findOne.mockResolvedValue(alwaysEdge);
    edgeRepoMock.find.mockResolvedValue([]); // END node n'a pas d'arête sortante

    // Émettre l'événement — le listener est déclenché de façon async
    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent());
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(fakeAdapter.sendMessage).toHaveBeenCalledTimes(1);
    // FlowVariableService réel résout {contact_name} → 'Client Test' (depuis event.contactName)
    expect(fakeAdapter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Bonjour Client Test !' }),
    );

    const completedSave = sessionSaveCalls.find((s) => s.status === FlowSessionStatus.COMPLETED);
    expect(completedSave).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 2 — Nœud QUESTION → WAITING_REPLY
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 2 : QUESTION → session passe en WAITING_REPLY et stop', async () => {
    const conv = makeBotConv();
    const session = makeSession();
    const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
    const flow = makeFlow([trigger]);
    const questionNode = makeNode(FlowNodeType.QUESTION, {
      id: 'node-entry',
      config: { body: 'Quel est votre problème ?' },
    });

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);
    sessionServiceMock.createSession.mockResolvedValue(session);
    nodeRepoMock.findOne.mockResolvedValue(questionNode);
    edgeRepoMock.findOne.mockResolvedValue(null); // pas d'arête always

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent());
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(fakeAdapter.sendMessage).toHaveBeenCalledTimes(1);
    const waitingSave = sessionSaveCalls.find((s) => s.status === FlowSessionStatus.WAITING_REPLY);
    expect(waitingSave).toBeDefined();
    // La session ne doit PAS être COMPLETED
    const completedSave = sessionSaveCalls.find((s) => s.status === FlowSessionStatus.COMPLETED);
    expect(completedSave).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 3 — Reprise WAITING_REPLY
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 3 : deuxième event reprend la session WAITING_REPLY → COMPLETED', async () => {
    const conv = makeBotConv({ activeSessionId: 'session-uuid-1' });
    const waitingSession = makeSession({
      status: FlowSessionStatus.WAITING_REPLY,
      currentNodeId: 'node-question',
      variables: {
        __provider: 'whapi', __channelType: 'whatsapp',
        __externalRef: '33612345678@s.whatsapp.net',
        __contactName: 'Client Test', __contactRef: '33612345678',
      },
    });
    const endNode = makeNode(FlowNodeType.END, { id: 'node-end', isEntryPoint: false });
    const edge = makeEdge('node-question', 'node-end');

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(waitingSession);
    // findById pour resumeSession
    sessionServiceMock.findById.mockResolvedValue(
      makeSession({ status: FlowSessionStatus.WAITING_REPLY, currentNodeId: 'node-question',
        conversation: conv }),
    );
    edgeRepoMock.find.mockResolvedValue([edge]);
    nodeRepoMock.findOne.mockResolvedValue(endNode);

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent({ messageText: 'Mon problème est X' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // flowRepoMock.find ne doit PAS être appelé (pas de nouveau flow cherché)
    expect(flowRepoMock.find).not.toHaveBeenCalled();

    const completedSave = sessionSaveCalls.find((s) => s.status === FlowSessionStatus.COMPLETED);
    expect(completedSave).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 4 — KEYWORD trigger sans match
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 4 : trigger KEYWORD sans match → aucune session créée', async () => {
    const conv = makeBotConv();
    const trigger = makeTrigger(FlowTriggerType.KEYWORD, { keywords: ['aide', 'help'] });
    const flow = makeFlow([trigger]);

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);

    // Texte qui ne contient pas les mots-clés
    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent({ messageText: 'Bonjour comment ça va' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(sessionServiceMock.createSession).not.toHaveBeenCalled();
    expect(fakeAdapter.sendMessage).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 5 — KEYWORD trigger avec match
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 5 : trigger KEYWORD avec match (insensible à la casse) → session créée', async () => {
    const conv = makeBotConv();
    const session = makeSession();
    const trigger = makeTrigger(FlowTriggerType.KEYWORD, { keywords: ['aide'] });
    const flow = makeFlow([trigger]);
    const messageNode = makeNode(FlowNodeType.MESSAGE, { config: { body: 'Je peux vous aider !' } });
    const endNode = makeNode(FlowNodeType.END, { id: 'node-end', isEntryPoint: false });

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);
    sessionServiceMock.createSession.mockResolvedValue(session);
    nodeRepoMock.findOne
      .mockResolvedValueOnce(messageNode)
      .mockResolvedValueOnce(endNode);
    edgeRepoMock.findOne.mockResolvedValue(makeEdge('node-entry', 'node-end'));
    edgeRepoMock.find.mockResolvedValue([]);

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent({ messageText: "J'ai besoin d'AIDE svp" }));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(sessionServiceMock.createSession).toHaveBeenCalledTimes(1);
    expect(fakeAdapter.sendMessage).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 6 — Flow inactif
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 6 : aucun flow actif en DB → aucune session créée', async () => {
    // FlowTriggerService.findMatchingFlow appelle flowRepo.find({ where: { isActive: true } }).
    // TypeORM filtre les flows inactifs en DB. On simule ce comportement en retournant []
    // (comme si tous les flows existants étaient inactifs).
    const conv = makeBotConv();

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([]); // Aucun flow actif retourné

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent());
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(sessionServiceMock.createSession).not.toHaveBeenCalled();
    expect(fakeAdapter.sendMessage).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 7 — Nœud WAIT → WAITING_DELAY
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 7 : nœud WAIT → session passe en WAITING_DELAY', async () => {
    const conv = makeBotConv();
    const session = makeSession();
    const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
    const flow = makeFlow([trigger]);
    const waitNode = makeNode(FlowNodeType.WAIT, { config: { delaySeconds: 60 } });

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);
    sessionServiceMock.createSession.mockResolvedValue(session);
    nodeRepoMock.findOne.mockResolvedValue(waitNode);

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent());
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const waitDelaySave = sessionSaveCalls.find((s) => s.status === FlowSessionStatus.WAITING_DELAY);
    expect(waitDelaySave).toBeDefined();
    expect(fakeAdapter.sendMessage).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 8 — Nœud ESCALATE → session ESCALATED + BOT_ESCALATE_EVENT
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 8 : nœud ESCALATE → session ESCALATED et BOT_ESCALATE_EVENT émis', async () => {
    const conv = makeBotConv();
    const session = makeSession();
    const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
    const flow = makeFlow([trigger]);
    const escalateNode = makeNode(FlowNodeType.ESCALATE, { config: { agentRef: 'agent-123' } });

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);
    sessionServiceMock.createSession.mockResolvedValue(session);
    nodeRepoMock.findOne.mockResolvedValue(escalateNode);

    const escalateEvents: unknown[] = [];
    eventEmitter.on(BOT_ESCALATE_EVENT, (e: unknown) => escalateEvents.push(e));

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent());
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const escalatedSave = sessionSaveCalls.find((s) => s.status === FlowSessionStatus.ESCALATED);
    expect(escalatedSave).toBeDefined();
    expect(escalateEvents.length).toBeGreaterThanOrEqual(1);
    expect(escalateEvents[0]).toMatchObject({ provider: 'whapi' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 9 — Pas de nœud d'entrée → session CANCELLED
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 9 : flow sans nœud d\'entrée → session CANCELLED', async () => {
    const conv = makeBotConv();
    const session = makeSession();
    const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
    const flow = makeFlow([trigger]);

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);
    sessionServiceMock.createSession.mockResolvedValue(session);
    nodeRepoMock.findOne.mockResolvedValue(null); // Pas de nœud d'entrée

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent());
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const cancelledSave = sessionSaveCalls.find((s) => s.status === FlowSessionStatus.CANCELLED);
    expect(cancelledSave).toBeDefined();
    expect(fakeAdapter.sendMessage).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scénario 10 — Variables résolues dans le texte du message
  // ──────────────────────────────────────────────────────────────────────────

  it('Scénario 10 : variables {contact_name} résolues dans le texte via FlowVariableService réel', async () => {
    const conv = makeBotConv();
    const session = makeSession();
    const trigger = makeTrigger(FlowTriggerType.INBOUND_MESSAGE);
    const flow = makeFlow([trigger]);
    const messageNode = makeNode(FlowNodeType.MESSAGE, {
      config: { body: 'Bonjour {contact_name}, comment puis-je vous aider ?' },
    });
    const endNode = makeNode(FlowNodeType.END, { id: 'node-end', isEntryPoint: false });

    botConvServiceMock.upsert.mockResolvedValue(conv);
    sessionServiceMock.getActiveSession.mockResolvedValue(null);
    flowRepoMock.find.mockResolvedValue([flow]);
    sessionServiceMock.createSession.mockResolvedValue(session);
    nodeRepoMock.findOne
      .mockResolvedValueOnce(messageNode)
      .mockResolvedValueOnce(endNode);
    edgeRepoMock.findOne.mockResolvedValue(makeEdge('node-entry', 'node-end'));
    edgeRepoMock.find.mockResolvedValue([]);

    eventEmitter.emit(BOT_INBOUND_EVENT, makeEvent({ contactName: 'Alice Dupont' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(fakeAdapter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Bonjour Alice Dupont, comment puis-je vous aider ?',
      }),
    );
  });
});
