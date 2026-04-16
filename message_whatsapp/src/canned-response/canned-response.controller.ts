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
import { CannedResponseService } from './canned-response.service';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { UpdateCannedResponseDto } from './dto/update-canned-response.dto';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

/**
 * P3.1 — Endpoints Canned Responses
 *
 * Admin   : CRUD complet sur /admin/canned-responses
 * Agent   : GET /canned-responses/suggest (autocomplétion live)
 */

@Controller('admin/canned-responses')
@UseGuards(AdminGuard)
export class CannedResponseAdminController {
  constructor(private readonly service: CannedResponseService) {}

  @Post()
  create(@Body() dto: CreateCannedResponseDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('tenant_id') tenantId: string,
    @Query('poste_id') posteId?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findAll(tenantId, posteId, search, category);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.service.update(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}

/** Endpoint agent (JWT) — lecture seule pour l'autocomplétion */
@Controller('canned-responses')
@UseGuards(AuthGuard('jwt'))
export class CannedResponseAgentController {
  constructor(private readonly service: CannedResponseService) {}

  @Get()
  findAll(
    @Query('tenant_id') tenantId: string,
    @Query('poste_id') posteId?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findAll(tenantId, posteId, search, category);
  }

  @Get('suggest')
  suggest(
    @Query('tenant_id') tenantId: string,
    @Query('prefix') prefix: string,
    @Query('poste_id') posteId?: string,
  ) {
    return this.service.suggest(tenantId, prefix ?? '', posteId);
  }
}
