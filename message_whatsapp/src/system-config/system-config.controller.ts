import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { SystemConfigService } from './system-config.service';
import { BulkUpdateConfigDto, UpdateConfigDto } from './dto/update-config.dto';

@UseGuards(AdminGuard)
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly svc: SystemConfigService) {}

  /** Retourne toutes les clés de config (valeurs masquées pour isSecret). */
  @Get()
  async getAll() {
    const all = await this.svc.getAll();
    return all.map((c) => ({
      ...c,
      configValue: c.isSecret && c.configValue ? '••••••••' : c.configValue,
    }));
  }

  /** Catalogue des clés gérées (métadonnées, sans valeurs). */
  @Get('catalogue')
  getCatalogue() {
    return this.svc.getCatalogue();
  }

  /** Clés d'une catégorie donnée. */
  @Get('category/:category')
  async getByCategory(@Param('category') category: string) {
    const all = await this.svc.getByCategory(category);
    return all.map((c) => ({
      ...c,
      configValue: c.isSecret && c.configValue ? '••••••••' : c.configValue,
    }));
  }

  /** Met à jour une clé. */
  @Patch(':key')
  async update(@Param('key') key: string, @Body() dto: UpdateConfigDto) {
    return this.svc.set(key, dto.value);
  }

  /** Met à jour plusieurs clés d'un coup. */
  @Post('bulk')
  async bulk(@Body() dto: BulkUpdateConfigDto) {
    await this.svc.setBulk(dto.entries);
    return { updated: dto.entries.length };
  }
}
