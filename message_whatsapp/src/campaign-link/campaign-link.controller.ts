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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';
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

  @Post('repair-urls')
  repairUrls() {
    return this.service.repairTrackedUrls();
  }

  @Get('debug/config')
  debugConfig() {
    return {
      APP_URL: process.env.APP_URL ?? '(non defini)',
      trackedUrlSample: `${process.env.APP_URL ?? ''}/campaign/t/EXAMPLE`,
      isAbsolute: (process.env.APP_URL ?? '').startsWith('http'),
    };
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

  @Post(':id/media-asset/:assetId')
  attachAsset(@Param('id') id: string, @Param('assetId') assetId: string) {
    return this.service.attachAsset(id, assetId);
  }

  @Delete(':id/media-asset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async detachAsset(@Param('id') id: string): Promise<void> {
    await this.service.detachAsset(id);
  }

  @Post(':id/media-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/media-assets',
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 16 * 1024 * 1024 },
    }),
  )
  async uploadMediaToLink(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadAndAttachMedia(id, file);
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