import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CronConfigService } from './cron-config.service';
import { UpdateCronConfigDto } from './dto/update-cron-config.dto';
import { AdminGuard } from 'src/auth/admin.guard';

@Controller('cron-configs')
@UseGuards(AdminGuard)
export class CronConfigController {
  constructor(private readonly cronConfigService: CronConfigService) {}

  /** Liste les 5 configurations CRON */
  @Get()
  findAll() {
    return this.cronConfigService.findAll();
  }

  /** Retourne la configuration d'un CRON par sa clé */
  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.cronConfigService.findByKey(key);
  }

  /** Met à jour la configuration d'un CRON et le re-schedule immédiatement */
  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateCronConfigDto) {
    return this.cronConfigService.update(key, dto);
  }

  /** Remet un CRON à ses valeurs par défaut et le re-schedule */
  @Post(':key/reset')
  @HttpCode(200)
  reset(@Param('key') key: string) {
    return this.cronConfigService.reset(key);
  }

  /** Exécute un CRON immédiatement (hors schedule) */
  @Post(':key/run')
  @HttpCode(200)
  runNow(@Param('key') key: string) {
    return this.cronConfigService.runNow(key);
  }
}
