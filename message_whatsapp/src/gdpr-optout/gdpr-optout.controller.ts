import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GdprOptoutService } from './gdpr-optout.service';
import { RegisterOptOutDto } from './dto/register-optout.dto';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

/**
 * P3.5 — Endpoints Opt-out RGPD
 *
 * POST   /admin/gdpr/optout              — enregistrer un opt-out (admin)
 * GET    /admin/gdpr/optout              — lister les opt-outs (admin)
 * DELETE /admin/gdpr/optout/:phone       — révoquer un opt-out (admin)
 * DELETE /admin/gdpr/optout/:phone/anonymize — droit à l'oubli (admin)
 * POST   /gdpr/optout                   — opt-out self-service (agent JWT)
 */

@Controller('admin/gdpr/optout')
@UseGuards(AdminGuard)
export class GdprOptoutAdminController {
  constructor(private readonly service: GdprOptoutService) {}

  @Post()
  register(@Body() dto: RegisterOptOutDto) {
    return this.service.register(dto);
  }

  @Get()
  findAll(
    @Query('tenant_id') tenantId: string,
    @Query('include_revoked') includeRevoked?: string,
  ) {
    return this.service.findAll(tenantId, includeRevoked === 'true');
  }

  @Delete(':phone/revoke')
  revoke(
    @Param('phone') phone: string,
    @Query('tenant_id') tenantId: string,
    @Query('revoked_by') revokedBy: string,
  ) {
    return this.service.revoke(tenantId, phone, revokedBy ?? 'admin');
  }

  @Delete(':phone/anonymize')
  @HttpCode(HttpStatus.NO_CONTENT)
  anonymize(
    @Param('phone') phone: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.anonymize(tenantId, phone);
  }
}

/** Agent peut signaler l'opt-out d'un client (depuis l'interface) */
@Controller('gdpr/optout')
@UseGuards(AuthGuard('jwt'))
export class GdprOptoutAgentController {
  constructor(private readonly service: GdprOptoutService) {}

  @Post()
  register(@Body() dto: RegisterOptOutDto) {
    return this.service.register(dto);
  }
}
