import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
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
}
