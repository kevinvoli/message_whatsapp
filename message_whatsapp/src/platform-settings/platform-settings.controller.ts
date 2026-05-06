import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { PlatformSettingsService } from './platform-settings.service';
import { IsBoolean } from 'class-validator';

class UpdateAutoRelanceDto {
  @IsBoolean()
  enabled: boolean;
}

@Controller('admin/settings')
@UseGuards(AdminGuard)
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Get('auto-relance')
  async getAutoRelance(): Promise<{ enabled: boolean }> {
    const enabled = await this.service.isEnabled('auto_relance_enabled');
    return { enabled };
  }

  @Put('auto-relance')
  async updateAutoRelance(
    @Body() dto: UpdateAutoRelanceDto,
  ): Promise<{ enabled: boolean }> {
    await this.service.set('auto_relance_enabled', dto.enabled ? 'true' : 'false');
    return { enabled: dto.enabled };
  }
}
