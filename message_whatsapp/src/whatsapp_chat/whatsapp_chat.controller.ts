import {
  Controller,
  Get,
  Param,
  UseGuards,
  Query,
  Patch,
  Body,
  Request,
} from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';
import { CommercialActionGateGuard } from 'src/commercial-action-gate/commercial-action-gate.guard';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ConversationResult } from './entities/whatsapp_chat.entity';

class SetOutcomeDto {
  @IsEnum(ConversationResult)
  @IsNotEmpty()
  result: ConversationResult;
}

interface JwtUser { userId: string; }

@Controller('chats')
@UseGuards(AdminGuard)
export class WhatsappChatController {
  constructor(private readonly chatService: WhatsappChatService) {}

  @Get()
  async findAll(
    @Query('chat_id') chat_id?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('periode') periode?: string,
    @Query('poste_id') poste_id?: string,
    @Query('commercial_id') commercial_id?: string,
  ) {
    let dateStart: Date | undefined;
    if (periode) {
      const now = new Date();
      const joursMap: Record<string, number> = { today: 0, week: 7, month: 30, year: 365 };
      const jours = joursMap[periode];
      if (jours !== undefined) {
        dateStart = new Date(now);
        if (jours === 0) {
          dateStart.setHours(0, 0, 0, 0);
        } else {
          dateStart.setDate(dateStart.getDate() - jours);
          dateStart.setHours(0, 0, 0, 0);
        }
      }
    }
    return this.chatService.findAll(
      chat_id,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
      dateStart,
      poste_id,
      commercial_id,
    );
  }

  // ⚠️ Doit être AVANT @Get(':chat_id') pour éviter le conflit de route

  /** Messages non répondus du poste du commercial connecté */
  @Get('mine/unanswered')
  @UseGuards(AuthGuard('jwt'))
  unanswered(@Request() req: { user: JwtUser }) {
    return this.chatService.findUnansweredByCommercial(req.user.userId);
  }

  @Get('stats/by-poste')
  async statsByPoste() {
    return this.chatService.getStatsByPoste();
  }

  @Get('stats/by-commercial')
  async statsByCommercial() {
    return this.chatService.getStatsByCommercial();
  }

  @Get(':chat_id')
  async findOne(@Param('chat_id') chat_id: string) {
    return this.chatService.findBychat_id(chat_id);
  }

  @Patch(':chat_id')
  async update(@Param('chat_id') chat_id: string, @Body() data: any) {
    return this.chatService.update(chat_id, data);
  }

  // ─── P7 — Statut métier ────────────────────────────────────────────────────

  /** Enregistre le résultat métier d'une conversation (commercial JWT ou admin) */
  @Patch(':id/outcome')
  @UseGuards(AuthGuard('jwt'), CommercialActionGateGuard)
  setOutcome(
    @Param('id') id: string,
    @Body() dto: SetOutcomeDto,
    @Request() req: { user: JwtUser },
  ) {
    return this.chatService.setConversationResult(id, dto.result, req.user.userId);
  }

  /** Stats des résultats métier — admin uniquement */
  @Get('stats/outcomes')
  async outcomeStats(
    @Query('periode') periode?: string,
    @Query('poste_id') poste_id?: string,
  ) {
    let dateStart: Date | undefined;
    if (periode) {
      const now = new Date();
      const joursMap: Record<string, number> = { today: 0, week: 7, month: 30, year: 365 };
      const jours = joursMap[periode];
      if (jours !== undefined) {
        dateStart = new Date(now);
        dateStart.setDate(dateStart.getDate() - (jours || 0));
        dateStart.setHours(0, 0, 0, 0);
      }
    }
    return this.chatService.getOutcomeStats(dateStart, poste_id);
  }
}
