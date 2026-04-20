import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientDossierService } from './client-dossier.service';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

interface JwtUser { userId: string; }

@Controller('clients')
export class ClientDossierController {
  constructor(private readonly service: ClientDossierService) {}

  /** Recherche globale de clients — accessible commercial et admin */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  search(
    @Request() req: { user: JwtUser },
    @Query('search') search?: string,
    @Query('category') client_category?: string,
    @Query('my_portfolio') my_portfolio?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const portfolio_owner_id = my_portfolio === 'true' ? req.user.userId : undefined;
    return this.service.searchClients(
      search,
      portfolio_owner_id,
      client_category,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /** Dossier complet d'un client */
  @Get(':id/dossier')
  @UseGuards(AuthGuard('jwt'))
  getDossier(@Param('id') id: string) {
    return this.service.getDossier(id);
  }

  /** Timeline chronologique des interactions d'un client */
  @Get(':id/timeline')
  @UseGuards(AuthGuard('jwt'))
  getTimeline(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getTimeline(id, limit ? Math.min(parseInt(limit, 10), 200) : 50);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  /** Recherche admin (sans restriction portefeuille) */
  @Get('admin/search')
  @UseGuards(AdminGuard)
  searchAdmin(
    @Query('search') search?: string,
    @Query('portfolio_owner_id') portfolio_owner_id?: string,
    @Query('category') client_category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.searchClients(
      search,
      portfolio_owner_id,
      client_category,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /** Dossier complet — lecture admin */
  @Get('admin/:id/dossier')
  @UseGuards(AdminGuard)
  getDossierAdmin(@Param('id') id: string) {
    return this.service.getDossier(id);
  }

  /** Timeline — lecture admin */
  @Get('admin/:id/timeline')
  @UseGuards(AdminGuard)
  getTimelineAdmin(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getTimeline(id, limit ? Math.min(parseInt(limit, 10), 200) : 50);
  }
}
