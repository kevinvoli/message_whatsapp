import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';
import { WorkScheduleService, CreateScheduleDto } from './work-schedule.service';

@Controller('work-schedule')
export class WorkScheduleController {
  constructor(private readonly service: WorkScheduleService) {}

  // ── Commercial endpoints ──────────────────────────────────────────────────

  /** Planning complet (semaine) du commercial connecté. */
  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  getMySchedule(@Request() req) {
    return this.service.findForCommercial(req.user.userId as string);
  }

  /** Créneau du jour pour le commercial connecté. */
  @Get('today')
  @UseGuards(AuthGuard('jwt'))
  getTodaySchedule(@Request() req) {
    return this.service.getTodayForCommercial(req.user.userId as string);
  }

  // ── Admin endpoints ───────────────────────────────────────────────────────

  /** Liste complète des plannings. */
  @Get()
  @UseGuards(AdminGuard)
  findAll() {
    return this.service.findAll();
  }

  /** Plannings par commercial. */
  @Get('commercial/:commercialId')
  @UseGuards(AdminGuard)
  findByCommercial(@Param('commercialId') commercialId: string) {
    return this.service.findByCommercial(commercialId);
  }

  /** Plannings par groupe (posteId). */
  @Get('group/:groupId')
  @UseGuards(AdminGuard)
  findByGroup(@Param('groupId') groupId: string) {
    return this.service.findByGroup(groupId);
  }

  /** Planning effectif d'un commercial (vue admin). */
  @Get('effective/:commercialId')
  @UseGuards(AdminGuard)
  getEffectiveForCommercial(@Param('commercialId') commercialId: string) {
    return this.service.findForCommercial(commercialId);
  }

  /** Créer un créneau. */
  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateScheduleDto) {
    return this.service.create(dto);
  }

  /** Modifier un créneau. */
  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: Partial<CreateScheduleDto>) {
    return this.service.update(id, dto);
  }

  /** Supprimer un créneau. */
  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
