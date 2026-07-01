import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommercialPlanningService } from './commercial-planning.service';
import { CreateSelfAbsenceDto } from './dto/create-planning.dto';

interface JwtUser { userId: string; }

@Controller('planning/self')
@UseGuards(AuthGuard('jwt'))
export class CommercialSelfPlanningController {
  constructor(private readonly planningService: CommercialPlanningService) {}

  @Post('absence')
  declareSelfAbsence(
    @Request() req: { user: JwtUser },
    @Body() dto: CreateSelfAbsenceDto,
  ) {
    return this.planningService.createAbsenceRange({
      commercialId: req.user.userId,
      dateStart:    dto.dateStart,
      dateEnd:      dto.dateEnd,
      reason:       dto.reason,
      declaredBy:   req.user.userId,
      timeSlot:     dto.timeSlot,
    });
  }

  @Get('today')
  getPlanningToday(@Request() req: { user: JwtUser }) {
    const today = new Date().toISOString().slice(0, 10);
    return this.planningService.findByCommercialAndDate(req.user.userId, today);
  }

  @Get('date/:date')
  getPlanningByDate(
    @Param('date') date: string,
    @Request() req: { user: JwtUser },
  ) {
    return this.planningService.findByCommercialAndDate(req.user.userId, date);
  }

  @Get('month/:year/:month')
  getPlanningMonth(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Request() req: { user: JwtUser },
  ) {
    return this.planningService.findByCommercialAndMonth(req.user.userId, year, month);
  }
}
