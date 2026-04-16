import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LabelService } from './label.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

/**
 * P3.3 — Endpoints Labels
 *
 * Admin   : CRUD sur /admin/labels  +  assignation via /admin/conversations/:chat_id/labels
 * Agent   : lecture + assignation via /conversations/:chat_id/labels  (JWT)
 */

// ── Définition des labels (admin seulement) ──────────────────────────────────

@Controller('admin/labels')
@UseGuards(AdminGuard)
export class LabelAdminController {
  constructor(private readonly service: LabelService) {}

  @Post()
  create(@Body() dto: CreateLabelDto) {
    return this.service.createLabel(dto);
  }

  @Get()
  findAll(
    @Query('tenant_id') tenantId: string,
    @Query('all') all?: string,
  ) {
    return this.service.findAllLabels(tenantId, all !== 'true');
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.service.updateLabel(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.removeLabel(id, tenantId);
  }
}

// ── Assignation admin ────────────────────────────────────────────────────────

@Controller('admin/conversations/:chat_id/labels')
@UseGuards(AdminGuard)
export class ChatLabelAdminController {
  constructor(private readonly service: LabelService) {}

  @Get()
  getLabels(@Param('chat_id') chatId: string) {
    return this.service.getLabelsForChat(chatId);
  }

  /** Remplace tous les labels d'un coup (idempotent) */
  @Put()
  setLabels(
    @Param('chat_id') chatId: string,
    @Body() body: { label_ids: string[]; tenant_id: string },
  ) {
    return this.service.setLabelsForChat(chatId, body.label_ids, body.tenant_id);
  }

  @Post(':label_id')
  assign(
    @Param('chat_id') chatId: string,
    @Param('label_id') labelId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.assignLabel(chatId, labelId, tenantId);
  }

  @Delete(':label_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(
    @Param('chat_id') chatId: string,
    @Param('label_id') labelId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.removeAssignment(chatId, labelId, tenantId);
  }
}

// ── Lecture + assignation agent (JWT) ────────────────────────────────────────

@Controller('labels')
@UseGuards(AuthGuard('jwt'))
export class LabelAgentController {
  constructor(private readonly service: LabelService) {}

  @Get()
  findAll(
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.findAllLabels(tenantId, true);
  }
}

@Controller('conversations/:chat_id/labels')
@UseGuards(AuthGuard('jwt'))
export class ChatLabelAgentController {
  constructor(private readonly service: LabelService) {}

  @Get()
  getLabels(@Param('chat_id') chatId: string) {
    return this.service.getLabelsForChat(chatId);
  }

  @Put()
  setLabels(
    @Param('chat_id') chatId: string,
    @Body() body: { label_ids: string[]; tenant_id: string },
  ) {
    return this.service.setLabelsForChat(chatId, body.label_ids, body.tenant_id);
  }

  @Post(':label_id')
  assign(
    @Param('chat_id') chatId: string,
    @Param('label_id') labelId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.assignLabel(chatId, labelId, tenantId);
  }

  @Delete(':label_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(
    @Param('chat_id') chatId: string,
    @Param('label_id') labelId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.removeAssignment(chatId, labelId, tenantId);
  }
}
