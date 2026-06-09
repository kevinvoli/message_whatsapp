import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { GalerieMediaService } from './galerie-media.service';
import { GalleryQueryDto } from './dto/gallery-query.dto';

@Controller('media-storage')
@UseGuards(AdminGuard)
export class GalerieMediaController {
  constructor(private readonly galerieService: GalerieMediaService) {}

  @Get('gallery')
  async getGallery(@Query() dto: GalleryQueryDto) {
    return this.galerieService.findGallery(dto);
  }

  @Get('gallery/filters')
  async getFilterOptions() {
    return this.galerieService.getFilterOptions();
  }
}
