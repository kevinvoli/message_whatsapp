import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationReportService, UpsertReportDto } from './conversation-report.service';

interface JwtUser { userId: string; posteId?: string; }

@ApiTags('GICOP Report')
@Controller('gicop-report')
@UseGuards(AuthGuard('jwt'))
export class ConversationReportController {
  constructor(private readonly service: ConversationReportService) {}

  @Get(':chatId')
  @ApiOperation({ summary: 'Récupère le rapport GICOP d\'une conversation' })
  findOne(@Param('chatId') chatId: string) {
    return this.service.findByChatId(chatId);
  }

  @Put(':chatId')
  @ApiOperation({ summary: 'Crée ou met à jour le rapport GICOP (autosave)' })
  upsert(
    @Param('chatId') chatId: string,
    @Body() dto: UpsertReportDto,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.upsert(chatId, {
      ...dto,
      commercialId: req.user.userId,
    });
  }

  @Patch(':chatId/validate')
  @ApiOperation({ summary: 'Valide le rapport GICOP (superviseur)' })
  validate(
    @Param('chatId') chatId: string,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.validate(chatId, req.user.userId);
  }
}
