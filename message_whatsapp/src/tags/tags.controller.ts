import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { AdminGuard } from 'src/auth/admin.guard';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /** Accessible aux agents commerciaux (lecture seule) */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.tagsService.findAll();
  }

  /** Création réservée aux admins */
  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto);
  }

  /** Suppression réservée aux admins */
  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.tagsService.remove(id);
  }
}
