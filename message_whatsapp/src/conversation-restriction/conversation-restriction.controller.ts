import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { ConversationRestrictionService } from './conversation-restriction.service';
import { RestrictionConfigDto } from './dto/restriction-config.dto';

/** Endpoint commercial — lecture seule de la config restriction */
@Controller('system-config/restriction')
export class ConversationRestrictionCommercialController {
  constructor(
    private readonly restrictionService: ConversationRestrictionService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  async getConfig(): Promise<RestrictionConfigDto> {
    return this.restrictionService.getRestrictionConfig();
  }
}

/** Endpoints admin — lecture + écriture de la config restriction */
@UseGuards(AdminGuard)
@Controller('admin/system-config/restriction')
export class ConversationRestrictionAdminController {
  constructor(
    private readonly restrictionService: ConversationRestrictionService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  @Get()
  async getConfig(): Promise<RestrictionConfigDto> {
    return this.restrictionService.getRestrictionConfig();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateConfig(@Body() dto: RestrictionConfigDto): Promise<RestrictionConfigDto> {
    await this.systemConfigService.setBulk([
      { key: 'RESTRICTION_ENABLED', value: String(dto.enabled) },
      {
        key: 'RESTRICTION_MAX_UNRESPONDED_CONVS',
        value: String(dto.maxUnrespondedConvs),
      },
      {
        key: 'RESTRICTION_MIN_RESPONSE_CHARS',
        value: String(dto.minResponseChars),
      },
      {
        key: 'RESTRICTION_REQUIRE_LAST_MESSAGE_MINE',
        value: String(dto.requireLastMessageMine),
      },
    ]);
    return this.restrictionService.getRestrictionConfig();
  }
}
