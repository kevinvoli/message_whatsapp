import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

export interface ReplySuggestion {
  text: string;
  rationale: string; // pourquoi cette suggestion
}

export interface ConversationSummary {
  chatId: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  keyPoints: string[];
  suggestedActions: string[];
}

export type RewriteMode = 'correct' | 'improve' | 'formal' | 'short';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private readonly anthropicApiKey: string | null;

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly config: ConfigService,
  ) {
    this.anthropicApiKey = config.get<string>('ANTHROPIC_API_KEY') ?? null;
  }

  // ─── Suggestions de réponses ──────────────────────────────────────────────

  /**
   * Génère 3 suggestions de réponses contextuelles pour une conversation.
   * Si ANTHROPIC_API_KEY n'est pas configuré, retourne des suggestions génériques.
   */
  async suggestReplies(chatId: string, contextSize = 10): Promise<ReplySuggestion[]> {
    const messages = await this.getRecentMessages(chatId, contextSize);
    if (messages.length === 0) {
      return this.genericSuggestions();
    }

    const conversationText = this.formatConversation(messages);

    if (!this.anthropicApiKey) {
      return this.fallbackSuggestions(messages);
    }

    try {
      const response = await this.callClaude(
        `Tu es un assistant pour agent de service client WhatsApp.
Voici les derniers échanges de la conversation :

${conversationText}

Génère exactement 3 suggestions de réponses courtes (max 2 phrases chacune) pour l'agent.
Réponds UNIQUEMENT avec un JSON valide : [{"text": "...", "rationale": "..."}, ...]`,
      );

      const parsed = JSON.parse(response);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 3);
      }
    } catch (err) {
      this.logger.warn(`suggestReplies API error: ${err} — fallback`);
    }

    return this.fallbackSuggestions(messages);
  }

  // ─── Réécriture / correction de texte ────────────────────────────────────

  async rewriteText(text: string, mode: RewriteMode): Promise<{ result: string }> {
    if (!text.trim()) return { result: text };

    const PROMPTS: Record<RewriteMode, string> = {
      correct: `Corrige uniquement les fautes d'orthographe et de grammaire dans ce texte, sans modifier le sens ou le style :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte corrigé, sans guillemets ni explication.`,
      improve: `Améliore ce texte pour qu'il soit plus clair et professionnel tout en conservant le sens original :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte amélioré, sans guillemets ni explication.`,
      formal:  `Reformule ce texte en un style formel et courtois adapté à un contexte commercial :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte reformulé, sans guillemets ni explication.`,
      short:   `Résume ce texte en une version plus courte en conservant le message essentiel :\n\n"${text}"\n\nRéponds UNIQUEMENT avec le texte résumé, sans guillemets ni explication.`,
    };

    if (!this.anthropicApiKey) return { result: text };

    try {
      const result = await this.callClaude(PROMPTS[mode]);
      return { result: result.trim() || text };
    } catch (err) {
      this.logger.warn(`rewriteText error: ${err}`);
      return { result: text };
    }
  }

  // ─── Résumé de conversation ───────────────────────────────────────────────

  async summarizeConversation(chatId: string): Promise<ConversationSummary> {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException(`Conversation ${chatId} introuvable`);

    const messages = await this.getRecentMessages(chatId, 50);
    const conversationText = this.formatConversation(messages);

    if (!this.anthropicApiKey || messages.length === 0) {
      return this.fallbackSummary(chatId, messages);
    }

    try {
      const response = await this.callClaude(
        `Résume la conversation de support client suivante en JSON :

${conversationText}

Réponds UNIQUEMENT avec un JSON valide :
{
  "summary": "résumé en 2-3 phrases",
  "sentiment": "positive|neutral|negative|mixed",
  "keyPoints": ["point 1", "point 2"],
  "suggestedActions": ["action 1", "action 2"]
}`,
      );

      const parsed = JSON.parse(response);
      return {
        chatId,
        summary:          parsed.summary          ?? 'Résumé non disponible',
        sentiment:        parsed.sentiment         ?? 'neutral',
        keyPoints:        parsed.keyPoints         ?? [],
        suggestedActions: parsed.suggestedActions  ?? [],
      };
    } catch (err) {
      this.logger.warn(`summarizeConversation API error: ${err} — fallback`);
      return this.fallbackSummary(chatId, messages);
    }
  }

  // ─── Helpers privés ───────────────────────────────────────────────────────

  private async getRecentMessages(chatId: string, limit: number): Promise<WhatsappMessage[]> {
    return this.messageRepo.find({
      where: { chat_id: chatId },
      order: { createdAt: 'DESC' },
      take: limit,
    }).then((msgs) => msgs.reverse()); // chronologique
  }

  private formatConversation(messages: WhatsappMessage[]): string {
    return messages
      .map((m) => {
        const role = m.direction === 'IN' ? 'Client' : 'Agent';
        const text = m.text ?? '[média]';
        return `${role}: ${text}`;
      })
      .join('\n');
  }

  private async callClaude(prompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    return data.content.find((c) => c.type === 'text')?.text ?? '';
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
