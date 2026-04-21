import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { AiGovernanceService } from 'src/ai-governance/ai-governance.service';

export interface ReplySuggestion {
  text: string;
  rationale: string;
}

export interface ConversationSummary {
  chatId: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  keyPoints: string[];
  suggestedActions: string[];
}

export type RewriteMode = 'correct' | 'improve' | 'formal' | 'short';

export interface ConversationQualification {
  suggested_outcome: string;
  follow_up_needed: boolean;
  follow_up_date: string | null;
  interest_level: 'faible' | 'moyen' | 'fort';
  main_objection: string | null;
  products_mentioned: string[];
}

export interface FlowbotReplyOptions {
  context?: string;
  objective?: string;
  tone?: string;
  style?: string;
  maxLength?: number;
  forbiddenTopics?: string[];
  fallbackText?: string;
}

export interface ClientDossierSynthesis {
  summary: string;
  parcours_description: string;
  next_action_suggested: string;
  risk_level: 'faible' | 'moyen' | 'élevé';
  key_signals: string[];
}

export interface QualityAnalysis {
  quality_score: number;
  strengths: string[];
  improvements: string[];
  coaching_tips: string[];
}

interface AiConfig {
  provider: string;   // anthropic | openai | ollama | custom
  model: string;
  apiKey: string | null;
  apiUrl: string | null;
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(CallLog)
    private readonly callLogRepo: Repository<CallLog>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
    private readonly systemConfig: SystemConfigService,
    private readonly governance: AiGovernanceService,
  ) {}

  // ─── Config depuis la BDD ──────────────────────────────────────────────────

  /**
   * Résout la config IA à utiliser pour un module donné.
   * Priorité : provider dédié au module → provider global system_config → var d'env legacy.
   */
  private async getAiConfig(moduleName?: string): Promise<AiConfig> {
    // 1. Provider dédié au module
    if (moduleName) {
      const dedicated = await this.governance.getProviderForModule(moduleName);
      if (dedicated) {
        return {
          provider: dedicated.provider_type,
          model: dedicated.model,
          apiKey: dedicated.api_key,
          apiUrl: dedicated.api_url,
        };
      }
    }

    // 2. Provider global depuis system_config
    const [provider, model, apiKey, apiUrl] = await Promise.all([
      this.systemConfig.get('AI_PROVIDER'),
      this.systemConfig.get('AI_MODEL'),
      this.systemConfig.get('AI_API_KEY'),
      this.systemConfig.get('AI_API_URL'),
    ]);

    // Compatibilité ascendante : si AI_PROVIDER n'est pas encore défini, tenter ANTHROPIC_API_KEY
    const legacyKey = process.env.ANTHROPIC_API_KEY ?? null;
    const resolvedProvider = provider?.trim() || (legacyKey ? 'anthropic' : '');
    const resolvedKey = apiKey?.trim() || legacyKey;
    const resolvedModel = model?.trim() || 'claude-haiku-4-5-20251001';

    return {
      provider: resolvedProvider,
      model: resolvedModel,
      apiKey: resolvedKey ?? null,
      apiUrl: apiUrl?.trim() || null,
    };
  }

  async isFlowbotEnabled(): Promise<boolean> {
    return this.governance.isModuleEnabled('flowbot');
  }

  // ─── Suggestions de réponses ───────────────────────────────────────────────

  async suggestReplies(chatId: string, contextSize = 10, triggeredBy?: string): Promise<ReplySuggestion[]> {
    const enabled = await this.governance.isModuleEnabled('suggestions');
    const messages = await this.getRecentMessages(chatId, contextSize);
    const t0 = Date.now();

    if (!enabled) {
      await this.governance.log({ module_name: 'suggestions', scenario: 'suggestReplies', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return messages.length === 0 ? this.genericSuggestions() : this.fallbackSuggestions(messages);
    }

    if (messages.length === 0) return this.genericSuggestions();

    const config = await this.getAiConfig('suggestions');
    if (!config.apiKey) {
      await this.governance.log({ module_name: 'suggestions', scenario: 'suggestReplies', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return this.fallbackSuggestions(messages);
    }

    const prompt = `Tu es un assistant pour agent de service client WhatsApp.
Voici les derniers échanges de la conversation :

${this.formatConversation(messages)}

Génère exactement 3 suggestions de réponses courtes (max 2 phrases chacune) pour l'agent.
Réponds UNIQUEMENT avec un JSON valide : [{"text": "...", "rationale": "..."}, ...]`;

    try {
      const response = await this.callProvider(config, prompt);
      const parsed = JSON.parse(response) as ReplySuggestion[];
      await this.governance.log({ module_name: 'suggestions', scenario: 'suggestReplies', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: Date.now() - t0 });
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
    } catch (err) {
      this.logger.warn(`suggestReplies error: ${err} — fallback`);
      await this.governance.log({ module_name: 'suggestions', scenario: 'suggestReplies', triggered_by: triggeredBy, chat_id: chatId, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err) });
    }

    return this.fallbackSuggestions(messages);
  }

  // ─── Réécriture / correction ───────────────────────────────────────────────

  async rewriteText(text: string, mode: RewriteMode, triggeredBy?: string): Promise<{ result: string }> {
    if (!text.trim()) return { result: text };

    const enabled = await this.governance.isModuleEnabled('rewrite');
    const t0 = Date.now();

    if (!enabled) {
      await this.governance.log({ module_name: 'rewrite', scenario: `rewrite:${mode}`, triggered_by: triggeredBy, success: true, latency_ms: 0, fallback_used: true });
      return { result: text };
    }

    const config = await this.getAiConfig('rewrite');
    if (!config.apiKey) {
      await this.governance.log({ module_name: 'rewrite', scenario: `rewrite:${mode}`, triggered_by: triggeredBy, success: true, latency_ms: 0, fallback_used: true });
      return { result: text };
    }

    const PROMPTS: Record<RewriteMode, string> = {
      correct: `Corrige uniquement les fautes d'orthographe et de grammaire dans ce texte, sans modifier le sens ou le style :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte corrigé, sans guillemets ni explication.`,
      improve: `Améliore ce texte pour qu'il soit plus clair et professionnel tout en conservant le sens original :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte amélioré, sans guillemets ni explication.`,
      formal:  `Reformule ce texte en un style formel et courtois adapté à un contexte commercial :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte reformulé, sans guillemets ni explication.`,
      short:   `Résume ce texte en une version plus courte en conservant le message essentiel :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte résumé, sans guillemets ni explication.`,
    };

    try {
      const result = await this.callProvider(config, PROMPTS[mode]);
      await this.governance.log({ module_name: 'rewrite', scenario: `rewrite:${mode}`, triggered_by: triggeredBy, success: true, latency_ms: Date.now() - t0 });
      return { result: result.trim() || text };
    } catch (err) {
      this.logger.warn(`rewriteText error: ${err}`);
      await this.governance.log({ module_name: 'rewrite', scenario: `rewrite:${mode}`, triggered_by: triggeredBy, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err) });
      return { result: text };
    }
  }

  // ─── Résumé de conversation ────────────────────────────────────────────────

  async summarizeConversation(chatId: string, triggeredBy?: string): Promise<ConversationSummary> {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException(`Conversation ${chatId} introuvable`);

    const enabled = await this.governance.isModuleEnabled('summary');
    const messages = await this.getRecentMessages(chatId, 50);
    const t0 = Date.now();

    if (!enabled) {
      await this.governance.log({ module_name: 'summary', scenario: 'summarizeConversation', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return this.fallbackSummary(chatId, messages);
    }

    const config = await this.getAiConfig('summary');
    if (!config.apiKey || messages.length === 0) {
      await this.governance.log({ module_name: 'summary', scenario: 'summarizeConversation', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return this.fallbackSummary(chatId, messages);
    }

    const prompt = `Résume la conversation de support client suivante en JSON :

${this.formatConversation(messages)}

Réponds UNIQUEMENT avec un JSON valide :
{
  "summary": "résumé en 2-3 phrases",
  "sentiment": "positive|neutral|negative|mixed",
  "keyPoints": ["point 1", "point 2"],
  "suggestedActions": ["action 1", "action 2"]
}`;

    try {
      const response = await this.callProvider(config, prompt);
      const parsed = JSON.parse(response) as Partial<ConversationSummary>;
      await this.governance.log({ module_name: 'summary', scenario: 'summarizeConversation', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: Date.now() - t0 });
      return {
        chatId,
        summary:          parsed.summary          ?? 'Résumé non disponible',
        sentiment:        parsed.sentiment         ?? 'neutral',
        keyPoints:        parsed.keyPoints         ?? [],
        suggestedActions: parsed.suggestedActions  ?? [],
      };
    } catch (err) {
      this.logger.warn(`summarizeConversation error: ${err} — fallback`);
      await this.governance.log({ module_name: 'summary', scenario: 'summarizeConversation', triggered_by: triggeredBy, chat_id: chatId, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err) });
      return this.fallbackSummary(chatId, messages);
    }
  }

  // ─── Qualification assistée ───────────────────────────────────────────────

  async qualifyConversation(chatId: string, triggeredBy?: string): Promise<ConversationQualification> {
    const enabled = await this.governance.isModuleEnabled('qualification');
    const messages = await this.getRecentMessages(chatId, 30);
    const t0 = Date.now();

    const fallback: ConversationQualification = {
      suggested_outcome: 'a_relancer',
      follow_up_needed: true,
      follow_up_date: null,
      interest_level: 'moyen',
      main_objection: null,
      products_mentioned: [],
    };

    if (!enabled) {
      await this.governance.log({ module_name: 'qualification', scenario: 'qualifyConversation', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return fallback;
    }

    const config = await this.getAiConfig('qualification');
    if (!config.apiKey || messages.length === 0) {
      await this.governance.log({ module_name: 'qualification', scenario: 'qualifyConversation', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return fallback;
    }

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Tu analyses une conversation commerciale WhatsApp pour aider un agent à la qualifier.

${this.formatConversation(messages)}

Date du jour : ${today}

Réponds UNIQUEMENT avec un JSON valide :
{
  "suggested_outcome": "commande_confirmee|commande_a_saisir|a_relancer|rappel_programme|pas_interesse|sans_reponse|infos_incompletes|deja_client|annule",
  "follow_up_needed": true|false,
  "follow_up_date": "YYYY-MM-DD ou null",
  "interest_level": "faible|moyen|fort",
  "main_objection": "description courte de l'objection principale ou null",
  "products_mentioned": ["produit 1", "produit 2"]
}`;

    try {
      const response = await this.callProvider(config, prompt);
      const parsed = JSON.parse(response) as ConversationQualification;
      await this.governance.log({ module_name: 'qualification', scenario: 'qualifyConversation', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: Date.now() - t0 });
      return {
        suggested_outcome: parsed.suggested_outcome ?? fallback.suggested_outcome,
        follow_up_needed: parsed.follow_up_needed ?? fallback.follow_up_needed,
        follow_up_date: parsed.follow_up_date ?? null,
        interest_level: parsed.interest_level ?? fallback.interest_level,
        main_objection: parsed.main_objection ?? null,
        products_mentioned: Array.isArray(parsed.products_mentioned) ? parsed.products_mentioned : [],
      };
    } catch (err) {
      this.logger.warn(`qualifyConversation error: ${err}`);
      await this.governance.log({ module_name: 'qualification', scenario: 'qualifyConversation', triggered_by: triggeredBy, chat_id: chatId, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err) });
      return fallback;
    }
  }

  // ─── Relance assistée ──────────────────────────────────────────────────────

  async generateFollowUpMessage(
    opts: { contactName?: string; followUpType: string; context?: string; productsMentioned?: string[] },
    triggeredBy?: string,
  ): Promise<{ message: string }> {
    const enabled = await this.governance.isModuleEnabled('followup');
    const t0 = Date.now();

    if (!enabled) {
      await this.governance.log({ module_name: 'followup', scenario: 'generateFollowUpMessage', triggered_by: triggeredBy, success: true, latency_ms: 0, fallback_used: true });
      return { message: '' };
    }

    const config = await this.getAiConfig('followup');
    if (!config.apiKey) {
      await this.governance.log({ module_name: 'followup', scenario: 'generateFollowUpMessage', triggered_by: triggeredBy, success: true, latency_ms: 0, fallback_used: true });
      return { message: '' };
    }

    const typeLabels: Record<string, string> = {
      rappel: 'un rappel programmé',
      relance_post_conversation: 'une relance post-conversation',
      relance_sans_commande: 'une relance sans commande passée',
      relance_post_annulation: 'une relance après annulation de commande',
      relance_fidelisation: 'une relance de fidélisation',
      relance_sans_reponse: 'une relance sans réponse',
    };

    const typeLabel = typeLabels[opts.followUpType] ?? opts.followUpType;
    const productsLine = opts.productsMentioned?.length
      ? `Produits mentionnés lors du dernier échange : ${opts.productsMentioned.join(', ')}.`
      : '';
    const contextLine = opts.context ? `Contexte supplémentaire : ${opts.context}.` : '';

    const prompt = `Tu es un assistant commercial. Rédige un message WhatsApp court et professionnel pour ${typeLabel}.
Client : ${opts.contactName ?? 'le client'}.
${productsLine}
${contextLine}
Le message doit être chaleureux, naturel, max 3 phrases.
Réponds UNIQUEMENT avec le texte du message, sans guillemets ni explication.`;

    try {
      const result = await this.callProvider(config, prompt);
      await this.governance.log({ module_name: 'followup', scenario: 'generateFollowUpMessage', triggered_by: triggeredBy, success: true, latency_ms: Date.now() - t0 });
      return { message: result.trim() };
    } catch (err) {
      this.logger.warn(`generateFollowUpMessage error: ${err}`);
      await this.governance.log({ module_name: 'followup', scenario: 'generateFollowUpMessage', triggered_by: triggeredBy, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err) });
      return { message: '' };
    }
  }

  // ─── FlowBot reply avec contexte enrichi ──────────────────────────────────

  async generateFlowbotReply(chatId: string, opts: FlowbotReplyOptions): Promise<string> {
    const messages = await this.getRecentMessages(chatId, 10);
    const config = await this.getAiConfig('flowbot');
    const t0 = Date.now();

    if (!config.apiKey) {
      await this.governance.log({ module_name: 'flowbot', scenario: 'generateFlowbotReply', chat_id: chatId, success: true, latency_ms: 0, fallback_used: true, triggered_by: 'flowbot' });
      return opts.fallbackText ?? '';
    }

    const lines: string[] = [
      'Tu es un agent de service client automatique.',
      opts.context    ? `Contexte : ${opts.context}` : '',
      opts.objective  ? `Objectif de ta réponse : ${opts.objective}` : '',
      opts.tone       ? `Ton attendu : ${opts.tone}` : '',
      opts.style      ? `Style : ${opts.style}` : '',
      opts.maxLength  ? `Longueur maximum : ${opts.maxLength} caractères` : '',
      opts.forbiddenTopics?.length ? `Sujets à ne JAMAIS aborder : ${opts.forbiddenTopics.join(', ')}` : '',
      '',
      'Voici les derniers échanges :',
      this.formatConversation(messages),
      '',
      'Génère une seule réponse adaptée. Réponds UNIQUEMENT avec le texte du message, sans guillemets ni explication.',
    ].filter(l => l !== undefined);

    const prompt = lines.join('\n');

    try {
      const result = await this.callProvider(config, prompt);
      const text = result.trim();
      if (opts.maxLength && text.length > opts.maxLength) {
        const trimmed = text.slice(0, opts.maxLength).trimEnd() + '…';
        await this.governance.log({ module_name: 'flowbot', scenario: 'generateFlowbotReply', chat_id: chatId, success: true, latency_ms: Date.now() - t0, triggered_by: 'flowbot' });
        return trimmed;
      }
      await this.governance.log({ module_name: 'flowbot', scenario: 'generateFlowbotReply', chat_id: chatId, success: true, latency_ms: Date.now() - t0, triggered_by: 'flowbot' });
      return text || (opts.fallbackText ?? '');
    } catch (err) {
      this.logger.warn(`generateFlowbotReply error: ${err}`);
      await this.governance.log({ module_name: 'flowbot', scenario: 'generateFlowbotReply', chat_id: chatId, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err), triggered_by: 'flowbot' });
      return opts.fallbackText ?? '';
    }
  }

  // ─── Synthèse dossier client ──────────────────────────────────────────────

  async synthesizeDossier(contactId: string, triggeredBy?: string): Promise<ClientDossierSynthesis> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Contact ${contactId} introuvable`);

    const enabled = await this.governance.isModuleEnabled('dossier');
    const t0 = Date.now();

    const fallback: ClientDossierSynthesis = {
      summary: 'Synthèse IA non disponible.',
      parcours_description: '',
      next_action_suggested: 'Contacter le client',
      risk_level: 'moyen',
      key_signals: [],
    };

    if (!enabled) {
      await this.governance.log({ module_name: 'dossier', scenario: 'synthesizeDossier', triggered_by: triggeredBy, success: true, latency_ms: 0, fallback_used: true });
      return fallback;
    }

    const config = await this.getAiConfig('dossier');
    if (!config.apiKey) {
      await this.governance.log({ module_name: 'dossier', scenario: 'synthesizeDossier', triggered_by: triggeredBy, success: true, latency_ms: 0, fallback_used: true });
      return fallback;
    }

    const [callLogs, followUps, recentMessages] = await Promise.all([
      this.callLogRepo.find({ where: { contact_id: contactId }, order: { called_at: 'DESC' }, take: 10 }),
      this.followUpRepo.find({ where: { contact_id: contactId }, order: { scheduled_at: 'DESC' }, take: 10 }),
      contact.chat_id ? this.getRecentMessages(contact.chat_id, 20) : Promise.resolve([]),
    ]);

    const callSummary = callLogs.length
      ? callLogs.map((c) => `- ${new Date(c.called_at).toLocaleDateString('fr-FR')} : ${c.call_status}${c.outcome ? ` (${c.outcome})` : ''}`).join('\n')
      : 'Aucun appel enregistré';

    const followUpSummary = followUps.length
      ? followUps.map((f) => `- ${new Date(f.scheduled_at).toLocaleDateString('fr-FR')} : ${f.type} — ${f.status}`).join('\n')
      : 'Aucune relance enregistrée';

    const msgSummary = recentMessages.length
      ? this.formatConversation(recentMessages.slice(-10))
      : 'Aucun échange récent';

    const prompt = `Tu analyses le dossier d'un client pour fournir une synthèse à un commercial.

Client : ${contact.name} (${contact.phone})
Statut : ${contact.conversion_status ?? 'inconnu'} | Priorité : ${contact.priority ?? 'standard'} | Catégorie : ${contact.client_category ?? 'inconnue'}
Appels (${callLogs.length}) :
${callSummary}
Relances (${followUps.length}) :
${followUpSummary}
Derniers échanges WhatsApp :
${msgSummary}

Réponds UNIQUEMENT avec un JSON valide :
{
  "summary": "synthèse concise en 2-3 phrases",
  "parcours_description": "description du parcours client en 1-2 phrases",
  "next_action_suggested": "action concrète recommandée",
  "risk_level": "faible|moyen|élevé",
  "key_signals": ["signal 1", "signal 2", "signal 3"]
}`;

    try {
      const response = await this.callProvider(config, prompt);
      const parsed = JSON.parse(response) as Partial<ClientDossierSynthesis>;
      await this.governance.log({ module_name: 'dossier', scenario: 'synthesizeDossier', triggered_by: triggeredBy, success: true, latency_ms: Date.now() - t0 });
      return {
        summary:               parsed.summary               ?? fallback.summary,
        parcours_description:  parsed.parcours_description  ?? fallback.parcours_description,
        next_action_suggested: parsed.next_action_suggested ?? fallback.next_action_suggested,
        risk_level:            parsed.risk_level            ?? fallback.risk_level,
        key_signals:           Array.isArray(parsed.key_signals) ? parsed.key_signals : [],
      };
    } catch (err) {
      this.logger.warn(`synthesizeDossier error: ${err}`);
      await this.governance.log({ module_name: 'dossier', scenario: 'synthesizeDossier', triggered_by: triggeredBy, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err) });
      return fallback;
    }
  }

  // ─── Coaching qualité agent ───────────────────────────────────────────────

  async analyzeQuality(chatId: string, triggeredBy?: string): Promise<QualityAnalysis> {
    const enabled = await this.governance.isModuleEnabled('quality');
    const messages = await this.getRecentMessages(chatId, 40);
    const t0 = Date.now();

    const fallback: QualityAnalysis = {
      quality_score: 0,
      strengths: [],
      improvements: [],
      coaching_tips: [],
    };

    if (!enabled) {
      await this.governance.log({ module_name: 'quality', scenario: 'analyzeQuality', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return fallback;
    }

    const config = await this.getAiConfig('quality');
    if (!config.apiKey || messages.length === 0) {
      await this.governance.log({ module_name: 'quality', scenario: 'analyzeQuality', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: 0, fallback_used: true });
      return fallback;
    }

    const agentMessages = messages.filter((m) => m.direction === 'OUT');
    if (agentMessages.length === 0) return fallback;

    const prompt = `Tu analyses la qualité des réponses d'un agent commercial dans une conversation WhatsApp.
Évalue uniquement les messages de l'agent (marqués "Agent:").

${this.formatConversation(messages)}

Critères d'évaluation : clarté, empathie, professionnalisme, réactivité (si plusieurs échanges), résolution du besoin.

Réponds UNIQUEMENT avec un JSON valide :
{
  "quality_score": 0-100,
  "strengths": ["point fort 1", "point fort 2"],
  "improvements": ["axe d'amélioration 1", "axe d'amélioration 2"],
  "coaching_tips": ["conseil concret 1", "conseil concret 2"]
}`;

    try {
      const response = await this.callProvider(config, prompt);
      const parsed = JSON.parse(response) as Partial<QualityAnalysis>;
      await this.governance.log({ module_name: 'quality', scenario: 'analyzeQuality', triggered_by: triggeredBy, chat_id: chatId, success: true, latency_ms: Date.now() - t0 });
      return {
        quality_score: typeof parsed.quality_score === 'number' ? Math.min(100, Math.max(0, parsed.quality_score)) : 0,
        strengths:      Array.isArray(parsed.strengths)      ? parsed.strengths      : [],
        improvements:   Array.isArray(parsed.improvements)   ? parsed.improvements   : [],
        coaching_tips:  Array.isArray(parsed.coaching_tips)  ? parsed.coaching_tips  : [],
      };
    } catch (err) {
      this.logger.warn(`analyzeQuality error: ${err}`);
      await this.governance.log({ module_name: 'quality', scenario: 'analyzeQuality', triggered_by: triggeredBy, chat_id: chatId, success: false, latency_ms: Date.now() - t0, fallback_used: true, error_message: String(err) });
      return fallback;
    }
  }

  // ─── Appel générique au provider configuré ────────────────────────────────

  private async callProvider(config: AiConfig, prompt: string): Promise<string> {
    switch (config.provider) {
      case 'anthropic':
        return this.callAnthropic(config, prompt);
      case 'openai':
      case 'ollama':
      case 'custom':
        return this.callOpenAiCompat(config, prompt);
      default:
        // Tentative OpenAI-compat par défaut si une URL est fournie
        if (config.apiUrl) return this.callOpenAiCompat(config, prompt);
        return this.callAnthropic(config, prompt);
    }
  }

  private async callAnthropic(config: AiConfig, prompt: string): Promise<string> {
    const url = config.apiUrl || 'https://api.anthropic.com/v1/messages';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    return data.content.find((c) => c.type === 'text')?.text ?? '';
  }

  private async callOpenAiCompat(config: AiConfig, prompt: string): Promise<string> {
    const baseUrl = config.apiUrl || 'https://api.openai.com';
    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI-compat API ${res.status}: ${await res.text()}`);

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getRecentMessages(chatId: string, limit: number): Promise<WhatsappMessage[]> {
    return this.messageRepo.find({
      where: { chat_id: chatId },
      order: { createdAt: 'DESC' },
      take: limit,
    }).then((msgs) => msgs.reverse());
  }

  private formatConversation(messages: WhatsappMessage[]): string {
    return messages
      .map((m) => `${m.direction === 'IN' ? 'Client' : 'Agent'}: ${m.text ?? '[média]'}`)
      .join('\n');
  }

  private genericSuggestions(): ReplySuggestion[] {
    return [
      { text: 'Bonjour, comment puis-je vous aider ?', rationale: 'Salutation d\'accueil' },
      { text: 'Je comprends votre préoccupation, je vais vérifier cela pour vous.', rationale: 'Empathie et prise en charge' },
      { text: 'Avez-vous d\'autres questions ?', rationale: 'Clôture de la conversation' },
    ];
  }

  private fallbackSuggestions(messages: WhatsappMessage[]): ReplySuggestion[] {
    const lastInbound = messages.filter((m) => m.direction === 'IN').slice(-1)[0];
    const text = lastInbound?.text?.toLowerCase() ?? '';

    if (text.includes('problème') || text.includes('erreur') || text.includes('bug')) {
      return [
        { text: 'Je comprends votre problème et je vais y remédier rapidement.', rationale: 'Réponse à un problème signalé' },
        { text: 'Pouvez-vous me donner plus de détails sur l\'erreur rencontrée ?', rationale: 'Collecte d\'informations' },
        { text: 'Je transmets votre demande à notre équipe technique.', rationale: 'Escalade technique' },
      ];
    }

    if (text.includes('merci') || text.includes('super') || text.includes('parfait')) {
      return [
        { text: 'C\'est avec plaisir ! N\'hésitez pas si vous avez d\'autres questions.', rationale: 'Réponse positive' },
        { text: 'Merci pour votre retour, bonne journée !', rationale: 'Clôture amicale' },
        { text: 'Ravi d\'avoir pu vous aider !', rationale: 'Satisfaction confirmée' },
      ];
    }

    return this.genericSuggestions();
  }

  private fallbackSummary(chatId: string, messages: WhatsappMessage[]): ConversationSummary {
    const inbound = messages.filter((m) => m.direction === 'IN').length;
    const outbound = messages.filter((m) => m.direction === 'OUT').length;
    return {
      chatId,
      summary: `Conversation avec ${inbound} messages client et ${outbound} réponses agent.`,
      sentiment: 'neutral',
      keyPoints: [`${messages.length} messages échangés`],
      suggestedActions: ['Vérifier si le problème est résolu'],
    };
  }
}
