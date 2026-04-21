import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { AiGovernanceService } from './ai-governance.service';
import { UpdateModuleConfigDto } from './dto/update-module-config.dto';

@Controller('ai/governance')
@UseGuards(AdminGuard)
export class AiGovernanceController {
  constructor(private readonly service: AiGovernanceService) {}

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

  @Get('dashboard')
  getDashboard(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.service.getDashboard(sinceDate);
  }
}
