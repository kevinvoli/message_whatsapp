import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';
import { MessageRestrictionService } from './message-restriction.service';
import { MessageRestrictionConfigDto } from './dto/message-restriction-config.dto';

@Controller('message-restrictions')
export class MessageRestrictionCommercialController {
  constructor(private readonly restrictionService: MessageRestrictionService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('config')
  async getConfig(): Promise<MessageRestrictionConfigDto> {
    return this.restrictionService.getConfig();
  }
}

@UseGuards(AdminGuard)
@Controller('admin/message-restrictions')
export class MessageRestrictionAdminController {
  constructor(private readonly restrictionService: MessageRestrictionService) {}

  @Get()
  async getConfig(): Promise<MessageRestrictionConfigDto> {
    return this.restrictionService.getConfig();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateConfig(@Body() dto: MessageRestrictionConfigDto): Promise<MessageRestrictionConfigDto> {
    return this.restrictionService.updateConfig(dto);
  }
}
