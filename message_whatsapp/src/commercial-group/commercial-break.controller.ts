import { Body, Controller, NotFoundException, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TakeBreakDto } from './dto/sub-group.dto';
import { BreakSessionService } from './break-session.service';
import { BreakScheduleService } from './break-schedule.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { BREAK_EVENTS } from 'src/realtime/events/socket-events.constants';

@Controller('commercial')
@UseGuards(AuthGuard('jwt'))
export class CommercialBreakController {
  constructor(
    private readonly sessionService: BreakSessionService,
    private readonly breakScheduleService: BreakScheduleService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  @Post('break/take')
  async takeBreak(
    @Body() dto: TakeBreakDto,
    @Request() req: { user: { userId: string } },
  ): Promise<{ ok: true }> {
    const commercialId = req.user.userId;

    const schedule = await this.breakScheduleService.findOne(dto.breakScheduleId);
    if (!schedule) throw new NotFoundException('Plage de pause introuvable');

    await this.sessionService.takeBreak(commercialId, dto.breakScheduleId);

    this.gateway.server
      .to(`commercial:${commercialId}`)
      .emit(BREAK_EVENTS.BREAK_PROMPT_CLEAR, { breakScheduleId: dto.breakScheduleId, reason: 'taken' });

    return { ok: true };
  }
}
