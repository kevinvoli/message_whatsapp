import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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
  rewrite(@Body() body: { text: string; mode?: RewriteMode }) {
    return this.service.rewriteText(body.text ?? '', body.mode ?? 'correct');
  }
}
