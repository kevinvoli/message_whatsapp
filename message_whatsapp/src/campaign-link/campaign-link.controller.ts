import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AdminGuard } from 'src/auth/admin.guard';
import { CampaignLinkService } from './campaign-link.service';
import { CreateCampaignLinkDto } from './dto/create-campaign-link.dto';
import { UpdateCampaignLinkDto } from './dto/update-campaign-link.dto';

@UseGuards(AdminGuard)
@Controller('campaign-links')
export class CampaignLinkController {
  constructor(private readonly service: CampaignLinkService) {}

  @Post()
  create(@Body() dto: CreateCampaignLinkDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignLinkDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }

  @Get(':id/analytics')
  async getStats(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.service.getStats(id, fromDate, toDate);
  }

  @Get(':id/clicks')
  getClickHistory(
    @Param('id') id: string,
    @Query('page') page?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    return this.service.getClickHistory(id, pageNum);
  }
}

@Controller('campaign')
export class CampaignTrackingController {
  constructor(private readonly service: CampaignLinkService) {}

  @Get('t/:code')
  async track(
    @Param('code') code: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string,
    @Res() res: Response,
  ): Promise<void> {
    const rawIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ??
      req.ip ??
      '0.0.0.0';

    const directUrl = await this.service.track(code, rawIp, userAgent ?? null);
    res.redirect(302, directUrl);
  }
}
