import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { TemplateCategory, TemplateStatus } from './entities/whatsapp-template.entity';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

/**
 * P4.2 — Endpoints HSM Templates
 *
 * Admin : CRUD complet sur /admin/templates
 * Agent : lecture sur /templates  (sélection lors de l'envoi)
 */

@Controller('admin/templates')
@UseGuards(AdminGuard)
export class WhatsappTemplateAdminController {
  constructor(private readonly service: WhatsappTemplateService) {}

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('tenant_id') tenantId: string,
    @Query('status') status?: TemplateStatus,
    @Query('category') category?: TemplateCategory,
    @Query('language') language?: string,
    @Query('channel_id') channelId?: string,
  ) {
    return this.service.findAll(tenantId, { status, category, language, channelId });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.disable(id, tenantId);
  }
}

/** Agent — lecture seule des templates APPROUVÉS */
@Controller('templates')
@UseGuards(AuthGuard('jwt'))
export class WhatsappTemplateAgentController {
  constructor(private readonly service: WhatsappTemplateService) {}

  @Get()
  findAll(
    @Query('tenant_id') tenantId: string,
    @Query('channel_id') channelId?: string,
    @Query('language') language?: string,
  ) {
    return this.service.findAll(tenantId, {
      status: TemplateStatus.APPROVED,
      channelId,
      language,
    });
  }
}
