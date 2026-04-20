import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CommercialSessionService } from './commercial_session.service';

@Controller('commercial-sessions')
@UseGuards(AdminGuard)
export class CommercialSessionController {
  constructor(private readonly sessionService: CommercialSessionService) {}

  /** Statistiques globales de présence par commercial */
  @Get('stats')
  getStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.sessionService.getStats(from, to);
  }

  /** Historique des sessions d'un commercial */
  @Get(':commercial_id')
  getByCommercial(
    @Param('commercial_id') commercialId: string,
    @Query('limit') limit?: string,
  ) {
    return this.sessionService.getByCommercial(commercialId, limit ? parseInt(limit) : 30);
  }
}
