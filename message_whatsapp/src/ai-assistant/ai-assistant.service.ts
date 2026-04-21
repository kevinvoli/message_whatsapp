import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';

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
    private readonly systemConfig: SystemConfigService,
  ) {}

  // ─── Config depuis la BDD ──────────────────────────────────────────────────

  private async getAiConfig(): Promise<AiConfig> {
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
    const val = await this.systemConfig.get('AI_FLOWBOT_ENABLED');
    return val?.toLowerCase() === 'true';
  }

  // ─── Suggestions de réponses ───────────────────────────────────────────────

  async suggestReplies(chatId: string, contextSize = 10): Promise<ReplySuggestion[]> {
    const messages = await this.getRecentMessages(chatId, contextSize);
    if (messages.length === 0) return this.genericSuggestions();

    const config = await this.getAiConfig();
    if (!config.apiKey) return this.fallbackSuggestions(messages);

    const prompt = `Tu es un assistant pour agent de service client WhatsApp.
Voici les derniers échanges de la conversation :

${this.formatConversation(messages)}

Génère exactement 3 suggestions de réponses courtes (max 2 phrases chacune) pour l'agent.
Réponds UNIQUEMENT avec un JSON valide : [{"text": "...", "rationale": "..."}, ...]`;

    try {
      const response = await this.callProvider(config, prompt);
      const parsed = JSON.parse(response) as ReplySuggestion[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
    } catch (err) {
      this.logger.warn(`suggestReplies error: ${err} — fallback`);
    }

    return this.fallbackSuggestions(messages);
  }

  // ─── Réécriture / correction ───────────────────────────────────────────────

  async rewriteText(text: string, mode: RewriteMode): Promise<{ result: string }> {
    if (!text.trim()) return { result: text };

    const config = await this.getAiConfig();
    if (!config.apiKey) return { result: text };

    const PROMPTS: Record<RewriteMode, string> = {
      correct: `Corrige uniquement les fautes d'orthographe et de grammaire dans ce texte, sans modifier le sens ou le style :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte corrigé, sans guillemets ni explication.`,
      improve: `Améliore ce texte pour qu'il soit plus clair et professionnel tout en conservant le sens original :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte amélioré, sans guillemets ni explication.`,
      formal:  `Reformule ce texte en un style formel et courtois adapté à un contexte commercial :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte reformulé, sans guillemets ni explication.`,
      short:   `Résume ce texte en une version plus courte en conservant le message essentiel :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte résumé, sans guillemets ni explication.`,
    };

    try {
      const result = await this.callProvider(config, PROMPTS[mode]);
      return { result: result.trim() || text };
    } catch (err) {
      this.logger.warn(`rewriteText error: ${err}`);
      return { result: text };
    }
  }

  // ─── Résumé de conversation ────────────────────────────────────────────────

  async summarizeConversation(chatId: string): Promise<ConversationSummary> {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException(`Conversation ${chatId} introuvable`);

    const messages = await this.getRecentMessages(chatId, 50);
    const config = await this.getAiConfig();

    if (!config.apiKey || messages.length === 0) return this.fallbackSummary(chatId, messages);

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
      return {
        chatId,
        summary:          parsed.summary          ?? 'Résumé non disponible',
        sentiment:        parsed.sentiment         ?? 'neutral',
        keyPoints:        parsed.keyPoints         ?? [],
        suggestedActions: parsed.suggestedActions  ?? [],
      };
    } catch (err) {
      this.logger.warn(`summarizeConversation error: ${err} — fallback`);
      return this.fallbackSummary(chatId, messages);
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
