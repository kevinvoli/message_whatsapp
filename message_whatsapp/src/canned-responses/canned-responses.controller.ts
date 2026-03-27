import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CannedResponsesService } from './canned-responses.service';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('canned-responses')
export class CannedResponsesController {
  constructor(private readonly service: CannedResponsesService) {}

  /** Accessible aux commerciaux — lecture + recherche par préfixe de raccourci */
  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findAll(search, category);
  }

  /** Autocomplete par préfixe — ex: ?prefix=/bon  */
  @UseGuards(AuthGuard('jwt'))
  @Get('suggest')
  suggest(@Query('prefix') prefix?: string) {
    return this.service.findByShortcutPrefix(prefix ?? '');
  }

  // ─── Routes d'administration (AdminGuard) ────────────────────────────────

  @UseGuards(AdminGuard)
  @Post()
  create(@Body() dto: CreateCannedResponseDto) {
    return this.service.create(dto);
  }

  @UseGuards(AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateCannedResponseDto>) {
    return this.service.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
