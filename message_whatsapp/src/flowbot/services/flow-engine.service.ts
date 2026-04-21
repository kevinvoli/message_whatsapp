import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlowNode, FlowNodeType } from '../entities/flow-node.entity';
import { FlowEdge } from '../entities/flow-edge.entity';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowSessionLog } from '../entities/flow-session-log.entity';
import { BotConversation, BotConversationStatus } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent } from '../events/bot-inbound-message.event';
import { BOT_ESCALATE_EVENT, BOT_CLOSE_EVENT, BotEscalateRequestEvent, BotCloseRequestEvent } from '../events/bot-outbound.events';
import { FLOWBOT_OUTBOUND_SENT, FlowbotOutboundSentEvent } from '../events/flowbot-outbound-sent.event';
import { BotProviderAdapterRegistry } from './bot-provider-adapter-registry.service';
import { BotConversationService } from './bot-conversation.service';
import { BotMessageService } from './bot-message.service';
import { FlowSessionService } from './flow-session.service';
import { FlowTriggerService } from './flow-trigger.service';
import { FlowAnalyticsService } from './flow-analytics.service';
import { FlowVariableService, BotExecutionContext } from './flow-variable.service';
import {
  BotConversationContext,
  BotProviderAdapter,
} from '../interfaces/provider-adapter.interface';
import { AiAssistantService } from 'src/ai-assistant/ai-assistant.service';

const MAX_STEPS = 50;
const MAX_LOOP_DETECTION = 3;

@Injectable()
export class FlowEngineService {
  private readonly logger = new Logger(FlowEngineService.name);

  constructor(
    private readonly adapterRegistry: BotProviderAdapterRegistry,
    private readonly botConvService: BotConversationService,
    private readonly botMsgService: BotMessageService,
    private readonly sessionService: FlowSessionService,
    private readonly triggerService: FlowTriggerService,
    private readonly analyticsService: FlowAnalyticsService,
    private readonly variableService: FlowVariableService,
    private readonly eventEmitter: EventEmitter2,
    private readonly aiAssistant: AiAssistantService,
    @InjectRepository(FlowNode)
    private readonly nodeRepo: Repository<FlowNode>,
    @InjectRepository(FlowEdge)
    private readonly edgeRepo: Repository<FlowEdge>,
    @InjectRepository(FlowSession)
    private readonly sessionRepo: Repository<FlowSession>,
    @InjectRepository(FlowSessionLog)
    private readonly logRepo: Repository<FlowSessionLog>,
  ) {}

  // ─── Point d'entrée principal ─────────────────────────────────────────────

  /** Appelé par BotInboundListener pour chaque message entrant */
  async handleInbound(event: BotInboundMessageEvent): Promise<void> {
    const conv = await this.botConvService.upsert(event);

    const execCtx: BotExecutionContext = {
      provider: event.provider,
      channelType: event.channelType,
      externalRef: event.conversationExternalRef,
      providerChannelRef: event.providerChannelRef,
      contactName: event.contactName,
      contactRef: event.contactExternalId,
      agentRef: event.agentAssignedRef,
      lastInboundAt: event.receivedAt,
    };

    // Si une session est en attente de réponse → continuer le flow
    const activeSession = await this.sessionService.getActiveSession(conv);
    if (activeSession?.status === FlowSessionStatus.WAITING_REPLY) {
      activeSession.variables = {
        ...activeSession.variables,
        last_message_text: event.messageText ?? '',
        last_message_type: event.messageType,
      };
      activeSession.lastActivityAt = new Date();
      await this.sessionService.save(activeSession);
      await this.resumeSession(activeSession.id, 'inbound_reply', execCtx);
      return;
    }

    // Chercher un flow dont un trigger correspond
    const match = await this.triggerService.findMatchingFlow(conv, event);
    if (!match) {
      this.logger.debug(
        `No matching flow for chatRef=${conv.chatRef} provider=${event.provider}`,
      );
      return;
    }

    const session = await this.sessionService.createSession({
      conversation: conv,
      flow: match.flow,
      triggerType: match.triggerType,
    });

    // Stocker le contexte de routage dans les variables pour que le polling job
    // puisse reconstituer l'adapter lors de la reprise (WAIT / NO_RESPONSE)
    session.variables = {
      ...session.variables,
      __provider: execCtx.provider,
      __channelType: execCtx.channelType,
      __externalRef: execCtx.externalRef,
      __providerChannelRef: execCtx.providerChannelRef ?? null,
      __contactName: execCtx.contactName ?? '',
      __contactRef: execCtx.contactRef ?? execCtx.externalRef,
      __lastInboundAt: execCtx.lastInboundAt?.getTime() ?? Date.now(),
    };
    await this.sessionService.save(session);

    // Lier la session à la conversation
    conv.activeSessionId = session.id;
    conv.status = BotConversationStatus.BOT_ACTIVE;
    await this.botConvService.save(conv);

    await this.analyticsService.recordSessionStart(match.flow.id);

    // Trouver le nœud d'entrée
    const entryNode = await this.nodeRepo.findOne({
      where: { flowId: match.flow.id, isEntryPoint: true },
    });

    if (!entryNode) {
      this.logger.warn(`Flow ${match.flow.id} n'a pas de nœud d'entrée — session annulée`);
      session.status = FlowSessionStatus.CANCELLED;
      await this.sessionService.save(session);
      return;
    }

    await this.executeNode(session, entryNode, conv, execCtx);
  }

  /** Reprend une session en attente (après délai WAIT ou timeout QUESTION) */
  async resumeSession(
    sessionId: string,
    triggerReason: string,
    execCtx?: BotExecutionContext,
  ): Promise<void> {
    const session = await this.sessionService.findById(sessionId);
    if (!session) {
      this.logger.warn(`resumeSession: session ${sessionId} introuvable`);
      return;
    }

    if (
      session.status !== FlowSessionStatus.WAITING_REPLY &&
      session.status !== FlowSessionStatus.WAITING_DELAY
    ) {
      this.logger.debug(
        `resumeSession: session ${sessionId} n'est pas en attente (status=${session.status})`,
      );
      return;
    }

    session.status = FlowSessionStatus.ACTIVE;
    await this.sessionService.save(session);

    if (!session.currentNodeId) {
      this.logger.warn(`resumeSession: session ${sessionId} sans currentNodeId`);
      return;
    }

    // Trouver la prochaine arête à partir du nœud courant
    const edges = await this.edgeRepo.find({
      where: { sourceNodeId: session.currentNodeId },
      order: { sortOrder: 'ASC' },
    });

    if (!execCtx) {
      // Reconstruire le contexte depuis les variables stockées à la création de session
      const v = session.variables ?? {};
      execCtx = {
        provider: (v['__provider'] as string) ?? 'unknown',
        channelType: (v['__channelType'] as string) ?? 'whatsapp',
        externalRef: (v['__externalRef'] as string) ?? session.conversation?.chatRef ?? '',
        providerChannelRef: (v['__providerChannelRef'] as string) || undefined,
        contactName: (v['__contactName'] as string) ?? '',
        contactRef: (v['__contactRef'] as string) ?? session.conversation?.chatRef ?? '',
      };
    }

    for (const edge of edges) {
      const nextNode = await this.nodeRepo.findOne({
        where: { id: edge.targetNodeId },
      });
      if (nextNode && execCtx) {
        await this.executeNode(session, nextNode, session.conversation, execCtx);
        return;
      }
    }

    // Aucune arête → fin
    await this.terminateSession(session, FlowSessionStatus.COMPLETED, session.conversation, execCtx);
  }

  // ─── Moteur d'exécution des nœuds ────────────────────────────────────────

  private async executeNode(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
  ): Promise<void> {
    // Anti-boucle et limite de pas
    if (session.stepsCount >= MAX_STEPS) {
      this.logger.warn(
        `Session ${session.id} a dépassé MAX_STEPS=${MAX_STEPS} — escalade automatique`,
      );
      await this.escalateSession(session, conv, execCtx, 'max_steps');
      return;
    }

    const loopCount = session.logs
      ? 0 // logs not loaded here — boucle vérifiée à l'écriture du log
      : 0;

    session.stepsCount += 1;
    session.currentNodeId = node.id;
    session.lastActivityAt = new Date();
    await this.sessionService.save(session);

    await this.writeLog(session, node, null, 'execute', null);

    const adapter = this.adapterRegistry.getSafe(execCtx.provider);
    const ctx: BotConversationContext = {
      externalRef: execCtx.externalRef,
      provider: execCtx.provider,
      channelType: execCtx.channelType,
      providerChannelRef: execCtx.providerChannelRef,
    };

    try {
      switch (node.type) {
        case FlowNodeType.MESSAGE:
          await this.executeMessage(session, node, conv, execCtx, adapter, ctx);
          break;

        case FlowNodeType.QUESTION:
          await this.executeQuestion(session, node, conv, execCtx, adapter, ctx);
          return; // STOP — session passe en waiting_reply

        case FlowNodeType.CONDITION:
          await this.executeCondition(session, node, conv, execCtx);
          return; // l'arête choisie est suivie en interne

        case FlowNodeType.WAIT:
          await this.executeWait(session, node);
          return; // STOP — session passe en waiting_delay

        case FlowNodeType.ESCALATE:
          await this.escalateSession(session, conv, execCtx, 'user_request', node.config.agentRef as string | undefined);
          return;

        case FlowNodeType.END:
          await this.terminateSession(session, FlowSessionStatus.COMPLETED, conv, execCtx);
          return;

        case FlowNodeType.ACTION:
          await this.executeAction(session, node, conv, execCtx, adapter, ctx);
          break;

        case FlowNodeType.AB_TEST:
          await this.executeAbTest(session, node, conv, execCtx);
          return;

        // P6.2 — Nouveaux types de nœuds
        case FlowNodeType.DELAY:
          await this.executeDelay(session, node);
          return; // STOP — session passe en waiting_delay

        case FlowNodeType.HTTP_REQUEST:
          await this.executeHttpRequest(session, node, execCtx);
          break;

        case FlowNodeType.SEND_TEMPLATE:
          await this.executeSendTemplate(session, node, execCtx);
          break;

        case FlowNodeType.ASSIGN_LABEL:
          await this.executeAssignLabel(session, node, conv);
          break;

        case FlowNodeType.AI_REPLY:
          await this.executeAiReply(session, node, conv, execCtx, adapter, ctx);
          break;

        default:
          this.logger.warn(`Type de nœud inconnu: ${(node as any).type}`);
      }
    } catch (err) {
      this.logger.error(
        `executeNode: erreur sur nœud type=${node.type} id=${node.id} session=${session.id} — ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.writeLog(session, node, null, 'node_error', (err as Error).message.slice(0, 200));
      // Terminer proprement la session pour éviter qu'elle reste bloquée en ACTIVE
      session.status = FlowSessionStatus.CANCELLED;
      session.completedAt = new Date();
      await this.sessionService.save(session);
      conv.status = BotConversationStatus.IDLE;
      conv.activeSessionId = null;
      await this.botConvService.save(conv);
      return;
    }

    // Suivre l'arête "always" pour les nœuds non-terminaux
    await this.followAlwaysEdge(session, node, conv, execCtx);
  }

  // ─── Implémentation des nœuds ────────────────────────────────────────────

  private async executeMessage(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
    adapter: BotProviderAdapter | null,
    ctx: BotConversationContext,
  ): Promise<void> {
    if (!adapter) {
      this.logger.warn(`executeMessage: pas d'adapter pour provider=${execCtx.provider}`);
      return;
    }

    // Fenêtre 23h WhatsApp — refuser l'envoi si le dernier message entrant est trop ancien
    const lastInboundTs = execCtx.lastInboundAt?.getTime()
      ?? (session.variables?.['__lastInboundAt'] as number | undefined);
    if (lastInboundTs && Date.now() - lastInboundTs > 23 * 60 * 60 * 1000) {
      this.logger.warn(
        `executeMessage: fenêtre 23h expirée pour session=${session.id} chatRef=${conv.chatRef} — message ignoré`,
      );
      await this.terminateSession(session, FlowSessionStatus.COMPLETED, conv, execCtx);
      return;
    }

    const config = node.config as {
      body?: string;
      typingDelaySeconds?: number;
      mediaUrl?: string;
    };

    const resolvedText = config.body
      ? this.variableService.resolve(config.body, session, execCtx)
      : '';

    const caps = adapter.capabilities();

    // Indicateur de frappe si supporté
    if (caps.typing && (config.typingDelaySeconds ?? 0) > 0) {
      await adapter.sendTyping(ctx);
      await sleep((config.typingDelaySeconds ?? 1) * 1000);
      await adapter.stopTyping(ctx);
    }

    const result = await adapter.sendMessage({
      context: ctx,
      text: resolvedText,
      mediaUrl: config.mediaUrl,
    });

    // Persister le message dans whatsapp_message (affiché dans l'UI conversation)
    const outboundEvent = new FlowbotOutboundSentEvent();
    outboundEvent.chatRef = execCtx.externalRef;
    outboundEvent.text = resolvedText;
    outboundEvent.providerMessageId = result.externalMessageRef ?? `bot_${Date.now()}`;
    outboundEvent.provider = execCtx.provider;
    outboundEvent.sentAt = result.sentAt ?? new Date();
    this.eventEmitter.emit(FLOWBOT_OUTBOUND_SENT, outboundEvent);

    await this.botMsgService.saveOutbound({
      sessionId: session.id,
      flowNodeId: node.id,
      content: resolvedText,
      sendResult: result,
    });

    const logResult = result.channelLabel
      ? `[${result.channelLabel}] ${resolvedText.slice(0, 80)}`
      : resolvedText.slice(0, 100);
    await this.writeLog(session, node, null, 'message_sent', logResult);
  }

  private async executeQuestion(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
    adapter: BotProviderAdapter | null,
    ctx: BotConversationContext,
  ): Promise<void> {
    // Envoyer le message de la question (même logique que MESSAGE)
    await this.executeMessage(session, node, conv, execCtx, adapter, ctx);

    // Passer en attente de réponse
    session.status = FlowSessionStatus.WAITING_REPLY;
    await this.sessionService.save(session);
    await this.writeLog(session, node, null, 'waiting_reply', null);
  }

  private async executeCondition(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
  ): Promise<void> {
    const edges = await this.edgeRepo.find({
      where: { sourceNodeId: node.id },
      order: { sortOrder: 'ASC' },
    });

    const lastText = String(session.variables?.['last_message_text'] ?? '').toLowerCase();

    for (const edge of edges) {
      const matched = this.evaluateEdgeCondition(edge, session, conv, lastText, execCtx);
      if (matched) {
        await this.writeLog(session, node, edge.id, 'condition_match', edge.conditionType);
        const nextNode = await this.nodeRepo.findOne({ where: { id: edge.targetNodeId } });
        if (nextNode) {
          await this.executeNode(session, nextNode, conv, execCtx);
        }
        return;
      }
    }

    // Aucune condition matchée
    await this.writeLog(session, node, null, 'condition_no_match', null);
    await this.escalateSession(session, conv, execCtx, 'no_flow_match');
  }

  private evaluateEdgeCondition(
    edge: FlowEdge,
    session: FlowSession,
    conv: BotConversation,
    lastText: string,
    execCtx: BotExecutionContext,
  ): boolean {
    let result: boolean;

    switch (edge.conditionType) {
      case 'always':
        result = true;
        break;

      case 'message_contains':
        result = lastText.includes((edge.conditionValue ?? '').toLowerCase());
        break;

      case 'message_equals':
        result = lastText === (edge.conditionValue ?? '').toLowerCase();
        break;

      case 'message_matches_regex':
        try {
          result = new RegExp(edge.conditionValue ?? '', 'i').test(lastText);
        } catch {
          result = false;
        }
        break;

      case 'contact_is_new':
        result = !conv.isKnownContact;
        break;

      case 'channel_type':
        result = execCtx.channelType === edge.conditionValue;
        break;

      case 'agent_assigned':
        result = !!execCtx.agentRef;
        break;

      case 'variable_equals': {
        const [varKey, varVal] = (edge.conditionValue ?? '').split('=');
        result = String(session.variables?.[varKey] ?? '') === varVal;
        break;
      }

      default:
        result = false;
    }

    return edge.conditionNegate ? !result : result;
  }

  private async executeWait(session: FlowSession, node: FlowNode): Promise<void> {
    // Le polling job se chargera de reprendre la session après le délai
    session.status = FlowSessionStatus.WAITING_DELAY;
    await this.sessionService.save(session);
    await this.writeLog(session, node, null, 'waiting_delay', String(node.config.delaySeconds ?? 0));
  }

  private async executeAction(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
    adapter: BotProviderAdapter | null,
    ctx: BotConversationContext,
  ): Promise<void> {
    const config = node.config as { actionType?: string; key?: string; value?: unknown };

    switch (config.actionType) {
      case 'send_typing':
        if (adapter?.capabilities().typing) await adapter.sendTyping(ctx);
        break;

      case 'mark_as_read':
        if (adapter?.capabilities().markAsRead) await adapter?.markAsRead(ctx);
        break;

      case 'set_contact_known':
        conv.isKnownContact = true;
        await this.botConvService.save(conv);
        break;

      case 'set_variable':
        if (config.key) {
          session.variables = { ...session.variables, [config.key]: config.value };
          await this.sessionService.save(session);
        }
        break;

      case 'close_conversation':
        await adapter?.closeConversation(ctx);
        this.eventEmitter.emit(BOT_CLOSE_EVENT, {
          conversationExternalRef: conv.chatRef,
          provider: execCtx.provider,
        } satisfies BotCloseRequestEvent);
        break;

      default:
        this.logger.warn(`Action inconnue: ${config.actionType}`);
    }

    await this.writeLog(session, node, null, `action_${config.actionType ?? 'unknown'}`, null);
  }

  // ─── P6.2 — Nouveaux handlers de nœuds ──────────────────────────────────

  /**
   * DELAY — Pause configurable (secondes ou millisecondes).
   * Identique à WAIT mais avec config.delayMs pour granularité fine.
   * Le polling job reprendra la session après l'écoulement du délai.
   */
  private async executeDelay(session: FlowSession, node: FlowNode): Promise<void> {
    const config = node.config as { delaySeconds?: number; delayMs?: number };
    const delayMs = config.delayMs ?? (config.delaySeconds ?? 1) * 1000;
    session.status = FlowSessionStatus.WAITING_DELAY;
    // Stocker le délai réel pour que le polling job sache quand reprendre
    session.variables = { ...session.variables, __delay_until: Date.now() + delayMs };
    await this.sessionService.save(session);
    await this.writeLog(session, node, null, 'delay_start', String(delayMs));
  }

  /**
   * HTTP_REQUEST — Appel HTTP sortant, stocke la réponse dans une variable.
   * config: { url, method, headers, body, responseVariable }
   */
  private async executeHttpRequest(
    session: FlowSession,
    node: FlowNode,
    execCtx: BotExecutionContext,
  ): Promise<void> {
    const config = node.config as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      responseVariable?: string;
      timeoutMs?: number;
    };

    if (!config.url) {
      await this.writeLog(session, node, null, 'http_request_error', 'url manquante');
      return;
    }

    const resolvedUrl = this.variableService.resolve(config.url, session, execCtx);
    const resolvedBody = config.body
      ? this.variableService.resolve(config.body, session, execCtx)
      : undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);

      const res = await fetch(resolvedUrl, {
        method: config.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
        body: resolvedBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let responseData: unknown;
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        responseData = await res.json();
      } else {
        responseData = await res.text();
      }

      if (config.responseVariable) {
        session.variables = { ...session.variables, [config.responseVariable]: responseData };
        await this.sessionService.save(session);
      }

      await this.writeLog(session, node, null, 'http_request_ok', String(res.status));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.writeLog(session, node, null, 'http_request_error', msg.slice(0, 200));
      if (config.responseVariable) {
        session.variables = { ...session.variables, [config.responseVariable]: null };
        await this.sessionService.save(session);
      }
    }
  }

  /**
   * SEND_TEMPLATE — Envoie un template HSM Meta.
   * config: { templateName, language, variables[] }
   * Utilise CommunicationMetaService via EventEmitter2 pour rester découplé.
   */
  private async executeSendTemplate(
    session: FlowSession,
    node: FlowNode,
    execCtx: BotExecutionContext,
  ): Promise<void> {
    const config = node.config as {
      templateName?: string;
      language?: string;
      variables?: string[];
    };

    if (!config.templateName) {
      await this.writeLog(session, node, null, 'send_template_error', 'templateName manquant');
      return;
    }

    // Émettre l'événement — le WhatsappTemplateModule l'écoute si configuré
    this.eventEmitter.emit('flowbot.send_template', {
      sessionId: session.id,
      to: execCtx.externalRef,
      providerChannelRef: execCtx.providerChannelRef,
      templateName: config.templateName,
      language: config.language ?? 'fr',
      variables: (config.variables ?? []).map((v) =>
        this.variableService.resolve(v, session, execCtx),
      ),
    });

    await this.writeLog(session, node, null, 'send_template_queued', config.templateName);
  }

  /**
   * ASSIGN_LABEL — Assigne un ou plusieurs labels à la conversation.
   * config: { labelIds: string[] }
   * Utilise EventEmitter2 pour rester découplé du LabelModule.
   */
  private async executeAssignLabel(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
  ): Promise<void> {
    const config = node.config as { labelIds?: string[] };
    const labelIds = config.labelIds ?? [];

    if (labelIds.length === 0) {
      await this.writeLog(session, node, null, 'assign_label_skipped', 'aucun labelId');
      return;
    }

    this.eventEmitter.emit('flowbot.assign_labels', {
      chatId: conv.chatRef,
      labelIds,
    });

    await this.writeLog(session, node, null, 'assign_label_queued', labelIds.join(','));
  }

  /**
   * AI_REPLY — Génère une réponse via le fournisseur IA configuré en BDD et l'envoie.
   * config: { fallbackText?: string; variableName?: string }
   * - fallbackText : message envoyé si l'IA est désactivée ou indisponible
   * - variableName : si défini, stocke la réponse dans une variable de session
   */
  private async executeAiReply(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
    adapter: BotProviderAdapter | null,
    ctx: BotConversationContext,
  ): Promise<void> {
    const config = (node.config as { fallbackText?: string; variableName?: string } | null) ?? {};
    const fallbackText = config.fallbackText ?? '';

    const sendText = async (text: string) => {
      if (!adapter || !text) return;
      const result = await adapter.sendMessage({ context: ctx, text });
      const evt = new FlowbotOutboundSentEvent();
      evt.chatRef = execCtx.externalRef;
      evt.text = text;
      evt.providerMessageId = result.externalMessageRef ?? `bot_${Date.now()}`;
      evt.provider = execCtx.provider;
      evt.sentAt = result.sentAt ?? new Date();
      this.eventEmitter.emit(FLOWBOT_OUTBOUND_SENT, evt);
    };

    const enabled = await this.aiAssistant.isFlowbotEnabled();
    if (!enabled) {
      if (fallbackText) {
        await sendText(fallbackText);
        await this.writeLog(session, node, null, 'ai_reply_fallback', 'AI_FLOWBOT_ENABLED=false');
      } else {
        await this.writeLog(session, node, null, 'ai_reply_skipped', 'AI_FLOWBOT_ENABLED=false, no fallback');
      }
      return;
    }

    try {
      const suggestions = await this.aiAssistant.suggestReplies(conv.chatRef, 10);
      const replyText = suggestions[0]?.text ?? fallbackText;

      if (!replyText) {
        await this.writeLog(session, node, null, 'ai_reply_empty', 'no suggestion and no fallback');
        return;
      }

      if (config.variableName) {
        session.variables = { ...session.variables, [config.variableName]: replyText };
      }

      await sendText(replyText);
      await this.writeLog(session, node, null, 'ai_reply_sent', replyText.slice(0, 100));
    } catch (err) {
      this.logger.warn(`executeAiReply error: ${err}`);
      if (fallbackText) {
        await sendText(fallbackText);
        await this.writeLog(session, node, null, 'ai_reply_fallback', String(err));
      }
    }
  }

  private async executeAbTest(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
  ): Promise<void> {
    const edges = await this.edgeRepo.find({
      where: { sourceNodeId: node.id },
      order: { sortOrder: 'ASC' },
    });

    if (edges.length === 0) return;

    // Sélectionner une branche par poids (conditionValue = poids relatif)
    const weights = edges.map((e) => Math.max(1, parseInt(e.conditionValue ?? '1', 10)));
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    let chosen = edges[edges.length - 1];
    for (let i = 0; i < edges.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        chosen = edges[i];
        break;
      }
    }

    await this.writeLog(session, node, chosen.id, 'ab_test_branch', chosen.conditionValue);
    const nextNode = await this.nodeRepo.findOne({ where: { id: chosen.targetNodeId } });
    if (nextNode) {
      await this.executeNode(session, nextNode, conv, execCtx);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async followAlwaysEdge(
    session: FlowSession,
    node: FlowNode,
    conv: BotConversation,
    execCtx: BotExecutionContext,
  ): Promise<void> {
    const edge = await this.edgeRepo.findOne({
      where: { sourceNodeId: node.id, conditionType: 'always' },
    });

    if (!edge) return;

    const nextNode = await this.nodeRepo.findOne({ where: { id: edge.targetNodeId } });
    if (nextNode) {
      await this.executeNode(session, nextNode, conv, execCtx);
    }
  }

  private async escalateSession(
    session: FlowSession,
    conv: BotConversation,
    execCtx: BotExecutionContext | undefined,
    reason: BotEscalateRequestEvent['reason'],
    agentRef?: string,
  ): Promise<void> {
    session.status = FlowSessionStatus.ESCALATED;
    session.escalatedAt = new Date();
    await this.sessionService.save(session);

    conv.status = BotConversationStatus.ESCALATED;
    conv.activeSessionId = null;
    await this.botConvService.save(conv);

    await this.analyticsService.recordEscalation(session);

    this.eventEmitter.emit(BOT_ESCALATE_EVENT, {
      conversationExternalRef: conv.chatRef,
      provider: execCtx?.provider ?? 'unknown',
      agentRef,
      reason,
    } satisfies BotEscalateRequestEvent);

    this.logger.log(
      `Session ${session.id} escalatée — raison: ${reason} chatRef=${conv.chatRef}`,
    );
  }

  private async terminateSession(
    session: FlowSession,
    status: FlowSessionStatus,
    conv: BotConversation,
    execCtx: BotExecutionContext | undefined,
  ): Promise<void> {
    session.status = status;
    session.completedAt = new Date();
    await this.sessionService.save(session);

    conv.status = BotConversationStatus.COMPLETED;
    conv.activeSessionId = null;
    conv.isKnownContact = true;
    await this.botConvService.save(conv);

    await this.analyticsService.recordCompletion(session);

    this.logger.log(
      `Session ${session.id} terminée status=${status} chatRef=${conv.chatRef}`,
    );
  }

  private async writeLog(
    session: FlowSession,
    node: FlowNode,
    edgeTakenId: string | null,
    action: string,
    result: string | null,
  ): Promise<void> {
    const log = this.logRepo.create({
      sessionId: session.id,
      nodeId: node.id,
      nodeType: node.type,
      edgeTakenId,
      action,
      result,
      executedAt: new Date(),
    });
    await this.logRepo.save(log);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
