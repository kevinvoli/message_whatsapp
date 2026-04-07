import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AlertConfig, AlertSendResult, SystemAlertService } from './system-alert.service';
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

  /**
   * Déclenche un test d'alerte immédiat sans attendre le timer.
   * Retourne le détail de chaque tentative d'envoi.
   */
  @Post('test')
  async sendTestAlert(): Promise<{ results: AlertSendResult[]; message: string }> {
    return this.alertService.sendTestAlert();
  }
}
