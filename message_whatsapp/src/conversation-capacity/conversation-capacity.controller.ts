import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { ConversationCapacityService } from './conversation-capacity.service';

@Controller('capacity')
@UseGuards(AdminGuard)
export class ConversationCapacityController {
  constructor(private readonly service: ConversationCapacityService) {}

  @Get('summary')
  getSummary() {
    return this.service.getCapacitySummary();
  }

  @Get('config')
  getConfig() {
    return this.service.getQuotas();
  }

  @Patch('config')
  setConfig(@Body() body: { quotaActive: number; quotaTotal: number }) {
    return this.service.setQuotas(body.quotaActive, body.quotaTotal);
  }

  @Patch('unlock/:chatId')
  forceUnlock(@Param('chatId') chatId: string) {
    return this.service.forceUnlock(chatId);
  }

  @Get('window-mode')
  async getWindowMode() {
    const [enabled, threshold] = await Promise.all([
      this.service.isWindowModeEnabled(),
      this.service.getValidationThreshold(),
    ]);
    return { enabled, threshold };
  }

  @Patch('window-mode')
  async setWindowMode(@Body() body: { enabled?: boolean; threshold?: number }) {
    if (body.enabled !== undefined) await this.service.setWindowMode(body.enabled);
    if (body.threshold !== undefined) await this.service.setValidationThreshold(body.threshold);
    const [enabled, threshold] = await Promise.all([
      this.service.isWindowModeEnabled(),
      this.service.getValidationThreshold(),
    ]);
    return { enabled, threshold };
  }
}
