import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { SlaService, CreateSlaRuleDto, UpdateSlaRuleDto } from './sla.service';

/**
 * P5.3 — Gestion des règles SLA (admin uniquement)
 */
@Controller('admin/sla-rules')
@UseGuards(AdminGuard)
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Post()
  create(@Body() dto: CreateSlaRuleDto) {
    return this.sla.createRule(dto);
  }

  @Get()
  findAll(@Query('tenant_id') tenantId: string) {
    return this.sla.findAllRules(tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: UpdateSlaRuleDto,
  ) {
    return this.sla.updateRule(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.sla.removeRule(id, tenantId);
  }

  /** Évaluation SLA pour une conversation spécifique */
  @Get('evaluate/:chat_id')
  evaluate(
    @Param('chat_id') chatId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.sla.evaluateChat(chatId, tenantId);
  }

  /** Rapport de toutes les violations sur les conversations ouvertes */
  @Get('violations')
  violations(@Query('tenant_id') tenantId: string) {
    return this.sla.checkAllOpenChats(tenantId);
  }
}
