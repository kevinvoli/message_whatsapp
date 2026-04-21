import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { AiGovernanceService } from './ai-governance.service';
import { UpdateModuleConfigDto } from './dto/update-module-config.dto';

@Controller('ai/governance')
@UseGuards(AdminGuard)
export class AiGovernanceController {
  constructor(private readonly service: AiGovernanceService) {}

  // ── Modules ────────────────────────────────────────────────────────────────

  @Get('modules')
  getModules() {
    return this.service.getAllModules();
  }

  @Patch('modules/:name')
  updateModule(
    @Param('name') name: string,
    @Body() dto: UpdateModuleConfigDto,
  ) {
    return this.service.updateModuleConfig(name, dto);
  }

  // ── Moteurs IA (providers) ─────────────────────────────────────────────────

  @Get('providers')
  getProviders() {
    return this.service.getProviders();
  }

  @Post('providers')
  createProvider(
    @Body() body: {
      name: string;
      provider_type: string;
      model: string;
      api_key?: string | null;
      api_url?: string | null;
      timeout_ms?: number;
    },
  ) {
    return this.service.createProvider(body);
  }

  @Patch('providers/:id')
  updateProvider(
    @Param('id') id: string,
    @Body() body: Partial<{
      name: string;
      provider_type: string;
      model: string;
      api_key: string | null;
      api_url: string | null;
      timeout_ms: number;
      is_active: boolean;
    }>,
  ) {
    return this.service.updateProvider(id, body);
  }

  @Delete('providers/:id')
  deleteProvider(@Param('id') id: string) {
    return this.service.deleteProvider(id);
  }

  // ── Journaux ───────────────────────────────────────────────────────────────

  @Get('logs')
  getLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('module') module?: string,
  ) {
    return this.service.getLogs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
      module,
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.service.getDashboard(sinceDate);
  }
}
