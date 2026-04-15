/**
 * Stub de compatibilité pour l'ancienne API /message-auto.
 *
 * Les tables message_auto ont été supprimées par la migration RemoveAutoMessageLegacy1744000100000.
 * Ce contrôleur retourne des réponses vides/compatibles pour éviter les erreurs 404
 * dans le panel admin jusqu'à ce que l'UI soit migrée vers FlowBot.
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';

@Controller('message-auto')
@UseGuards(AdminGuard)
export class MessageAutoCompatController {

  // ── GET list ─────────────────────────────────────────────────────────────

  @Get()
  getAll() {
    return [];
  }

  @Get('scope-config')
  getScopeConfigs() {
    return [];
  }

  @Get('scope-config/type/:type')
  getScopeConfigByType(@Param('type') _type: string) {
    return null;
  }

  @Get('business-hours')
  getBusinessHours() {
    // Retourne 7 jours par défaut (lun-ven 9h-18h, sam-dim fermé)
    return Array.from({ length: 7 }, (_, i) => ({
      id: `stub-${i}`,
      dayOfWeek: i,
      openHour: 9,
      openMinute: 0,
      closeHour: 18,
      closeMinute: 0,
      isOpen: i >= 1 && i <= 5,
    }));
  }

  @Get('by-trigger/:trigger')
  getByTrigger(@Param('trigger') _trigger: string) {
    return null;
  }

  @Get(':id')
  getOne(@Param('id') _id: string) {
    return null;
  }

  // ── POST / PATCH / DELETE ─────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: Record<string, unknown>) {
    return { id: 'stub', ...body, actif: false, position: 0, createdAt: new Date().toISOString() };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return { id, ...body };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') _id: string) {
    return { message: 'ok' };
  }

  @Post('scope-config')
  @HttpCode(HttpStatus.CREATED)
  createScopeConfig(@Body() body: Record<string, unknown>) {
    return { id: 'stub', ...body };
  }

  @Delete('scope-config/:id')
  @HttpCode(HttpStatus.OK)
  removeScopeConfig(@Param('id') _id: string) {
    return { message: 'ok' };
  }

  @Post(':messageAutoId/keywords')
  @HttpCode(HttpStatus.CREATED)
  addKeyword(@Param('messageAutoId') messageAutoId: string, @Body() body: Record<string, unknown>) {
    return { id: 'stub', messageAutoId, ...body };
  }

  @Delete(':messageAutoId/keywords/:keywordId')
  @HttpCode(HttpStatus.OK)
  removeKeyword(@Param('messageAutoId') _mid: string, @Param('keywordId') _kid: string) {
    return { message: 'ok' };
  }

  @Put('business-hours/:dayOfWeek')
  updateBusinessHours(@Param('dayOfWeek') dayOfWeek: string, @Body() body: Record<string, unknown>) {
    return { id: 'stub', dayOfWeek: Number(dayOfWeek), ...body };
  }
}
