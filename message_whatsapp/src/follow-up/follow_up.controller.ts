import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FollowUpService } from './follow_up.service';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';
import { CancelFollowUpDto } from './dto/cancel-follow-up.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-follow-up.dto';
import { FollowUpStatus } from './entities/follow_up.entity';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';

interface JwtUser { userId: string; name?: string; }

@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly service: FollowUpService) {}

  // ── Commercial (JWT) ─────────────────────────────────────────────────────────

  /** Créer une relance */
  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(
    @Body() dto: CreateFollowUpDto,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.create(dto, req.user.userId, req.user.name ?? 'Commercial');
  }

  /** Mes relances (toutes ou filtrées par statut) */
  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  findMine(
    @Request() req: { user: JwtUser },
    @Query('status') status?: FollowUpStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findByCommercial(
      req.user.userId,
      status,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /** Relances dues aujourd'hui pour le commercial connecté */
  @Get('due-today')
  @UseGuards(AuthGuard('jwt'))
  dueToday(@Request() req: { user: JwtUser }) {
    return this.service.findDueToday(req.user.userId);
  }

  /** Compléter une relance */
  @Patch(':id/complete')
  @UseGuards(AuthGuard('jwt'))
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteFollowUpDto,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.complete(id, req.user.userId, dto);
  }

  /** Annuler une relance */
  @Patch(':id/cancel')
  @UseGuards(AuthGuard('jwt'))
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelFollowUpDto,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.cancel(id, req.user.userId, req.user.name ?? 'Commercial', dto.reason);
  }

  /** Reprogrammer une relance */
  @Patch(':id/reschedule')
  @UseGuards(AuthGuard('jwt'))
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleFollowUpDto,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.reschedule(id, req.user.userId, new Date(dto.scheduled_at));
  }

  /** Relances d'un contact spécifique */
  @Get('by-contact/:contactId')
  @UseGuards(AuthGuard('jwt'))
  byContact(@Param('contactId') contactId: string) {
    return this.service.findByContact(contactId);
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  /** Vue admin : toutes les relances avec filtres */
  @Get('admin')
  @UseGuards(AdminGuard)
  findAdmin(
    @Query('contact_id') contact_id?: string,
    @Query('commercial_id') commercial_id?: string,
    @Query('status') status?: FollowUpStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAllAdmin(
      contact_id,
      commercial_id,
      status,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
      from,
      to,
    );
  }

  /** Relances en retard globales (admin) */
  @Get('admin/due-today')
  @UseGuards(AdminGuard)
  dueTodayAdmin() {
    return this.service.findDueToday();
  }
}
