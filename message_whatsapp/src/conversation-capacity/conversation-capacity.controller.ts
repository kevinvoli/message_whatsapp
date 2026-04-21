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
    const enabled = await this.service.isWindowModeEnabled();
    return { enabled };
  }

  @Patch('window-mode')
  async setWindowMode(@Body() body: { enabled: boolean }) {
    await this.service.setWindowMode(body.enabled);
    return { enabled: body.enabled };
  }
}
