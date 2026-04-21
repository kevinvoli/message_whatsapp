import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiAssistantService, RewriteMode } from './ai-assistant.service';

/**
 * P6.4 — Suggestions de réponses et résumé IA
 * Accessible aux agents (JWT) pour les suggestions dans l'interface de chat.
 */
@Controller('ai')
@UseGuards(AuthGuard('jwt'))
export class AiAssistantController {
  constructor(private readonly service: AiAssistantService) {}

  /**
   * GET /ai/suggestions/:chat_id
   * Retourne 3 suggestions de réponses contextuelles.
   */
  @Get('suggestions/:chat_id')
  getSuggestions(
    @Param('chat_id') chatId: string,
    @Query('context_size') contextSize?: string,
  ) {
    return this.service.suggestReplies(chatId, contextSize ? parseInt(contextSize) : 10);
  }

  /**
   * GET /ai/summary/:chat_id
   * Retourne un résumé de la conversation avec points clés et actions suggérées.
   */
  @Get('summary/:chat_id')
  getSummary(@Param('chat_id') chatId: string) {
    return this.service.summarizeConversation(chatId);
  }

  /**
   * POST /ai/rewrite
   * Corrige / améliore / formate le texte passé en corps.
   * mode: 'correct' | 'improve' | 'formal' | 'short'
   */
  @Post('rewrite')
  rewrite(@Body() body: { text: string; mode?: RewriteMode }, @Request() req: { user?: { userId?: string } }) {
    return this.service.rewriteText(body.text ?? '', body.mode ?? 'correct', req.user?.userId);
  }

  /**
   * POST /ai/qualify/:chat_id
   * Analyse la conversation et suggère une qualification (outcome, relance, intérêt, objection).
   */
  @Post('qualify/:chat_id')
  qualifyConversation(
    @Param('chat_id') chatId: string,
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.service.qualifyConversation(chatId, req.user?.userId);
  }

  /**
   * POST /ai/followup-message
   * Génère un message de relance adapté au contexte du contact.
   */
  @Post('followup-message')
  generateFollowUpMessage(
    @Body() body: {
      contactName?: string;
      followUpType: string;
      context?: string;
      productsMentioned?: string[];
    },
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.service.generateFollowUpMessage(body, req.user?.userId);
  }

  /**
   * GET /ai/dossier/:contact_id
   * Génère une synthèse IA du dossier client (parcours, signaux, prochaine action).
   */
  @Get('dossier/:contact_id')
  synthesizeDossier(
    @Param('contact_id') contactId: string,
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.service.synthesizeDossier(contactId, req.user?.userId);
  }

  /**
   * POST /ai/quality/:chat_id
   * Analyse la qualité des réponses agent dans une conversation et retourne des conseils de coaching.
   */
  @Post('quality/:chat_id')
  analyzeQuality(
    @Param('chat_id') chatId: string,
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.service.analyzeQuality(chatId, req.user?.userId);
  }
}
