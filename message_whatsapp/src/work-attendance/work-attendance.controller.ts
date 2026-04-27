import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';
import { WorkAttendanceService } from './work-attendance.service';
import { AttendanceEventType } from './entities/work-attendance.entity';

@Controller('work-attendance')
export class WorkAttendanceController {
  constructor(private readonly service: WorkAttendanceService) {}

  // ── Commercial endpoints ──────────────────────────────────────────────────

  /** Pointage du jour. */
  @Get('today')
  @UseGuards(AuthGuard('jwt'))
  getToday(@Request() req) {
    return this.service.getToday(req.user.userId as string);
  }

  /** Enregistrer un événement (arrivée, départ pause, etc.). */
  @Post('event')
  @UseGuards(AuthGuard('jwt'))
  logEvent(
    @Request() req,
    @Body() body: { eventType: AttendanceEventType; note?: string },
  ) {
    return this.service.logEvent({
      commercialId: req.user.userId as string,
      eventType:    body.eventType,
      note:         body.note,
      createdById:  req.user.userId as string,
    });
  }

  /** Historique mensuel. */
  @Get('history')
  @UseGuards(AuthGuard('jwt'))
  getHistory(
    @Request() req,
    @Query('year')  year:  string,
    @Query('month') month: string,
  ) {
    return this.service.getMonthHistory(
      req.user.userId as string,
      parseInt(year,  10) || new Date().getFullYear(),
      parseInt(month, 10) || new Date().getMonth() + 1,
    );
  }

  // ── Admin endpoints ───────────────────────────────────────────────────────

  /** Pointages du jour pour tous les commerciaux. */
  @Get('admin/today')
  @UseGuards(AdminGuard)
  getTodayForAll() {
    return this.service.getTodayForAll();
  }

  /** Historique d'un commercial (admin). */
  @Get('admin/:commercialId/history')
  @UseGuards(AdminGuard)
  getHistoryForCommercial(
    @Param('commercialId') commercialId: string,
    @Query('year')  year:  string,
    @Query('month') month: string,
  ) {
    return this.service.getMonthHistory(
      commercialId,
      parseInt(year,  10) || new Date().getFullYear(),
      parseInt(month, 10) || new Date().getMonth() + 1,
    );
  }

  /** Exception superviseur : enregistrer un événement pour un commercial. */
  @Post('admin/:commercialId/event')
  @UseGuards(AdminGuard)
  logEventForCommercial(
    @Request() req,
    @Param('commercialId') commercialId: string,
    @Body() body: { eventType: AttendanceEventType; note?: string; eventAt?: string },
  ) {
    return this.service.logEvent({
      commercialId,
      eventType:   body.eventType,
      note:        body.note,
      createdById: req.user?.id as string,
      eventAt:     body.eventAt ? new Date(body.eventAt) : undefined,
    });
  }
}
