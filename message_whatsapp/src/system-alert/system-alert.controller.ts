import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AlertConfig, SystemAlertService } from './system-alert.service';
import { AdminGuard } from 'src/auth/admin.guard';

@Controller('admin/alert-config')
@UseGuards(AdminGuard)
export class SystemAlertController {
  constructor(private readonly alertService: SystemAlertService) {}

  @Get()
  getConfig(): AlertConfig {
    return this.alertService.getConfig();
  }

  @Patch()
  async updateConfig(@Body() body: Partial<AlertConfig>): Promise<AlertConfig> {
    return this.alertService.updateConfig(body);
  }

  @Get('status')
  getStatus() {
    return this.alertService.getStatus();
  }

  @Get('default-template')
  getDefaultTemplate(): { template: string } {
    return { template: this.alertService.getDefaultMessageTemplate() };
  }
}
