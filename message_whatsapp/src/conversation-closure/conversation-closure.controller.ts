import { Controller, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationClosureService } from './conversation-closure.service';

interface JwtUser { userId: string; }

@ApiTags('Conversation Closure')
@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
export class ConversationClosureController {
  constructor(private readonly closureService: ConversationClosureService) {}

  @Get(':chatId/closure-readiness')
  @ApiOperation({ summary: 'Vérifie si la conversation peut être fermée et retourne les blocages' })
  async checkReadiness(
    @Param('chatId') chatId: string,
    @Request() req: { user: JwtUser },
  ) {
    return this.closureService.validateClosure(chatId, req.user.userId);
  }

  @Post(':chatId/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ferme définitivement la conversation après validation des conditions métier' })
  async closeConversation(
    @Param('chatId') chatId: string,
    @Request() req: { user: JwtUser },
  ) {
    return this.closureService.closeConversation(chatId, req.user.userId);
  }

  @Get('admin/closure-stats')
  @ApiOperation({ summary: 'Statistiques des tentatives de fermeture bloquées (admin)' })
  async closureStats() {
    return this.closureService.getClosureStats();
  }
}
