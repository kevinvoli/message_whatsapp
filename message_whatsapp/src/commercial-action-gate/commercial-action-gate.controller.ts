import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommercialActionGateService } from './commercial-action-gate.service';

@Controller('commercial-action-gate')
@UseGuards(AuthGuard('jwt'))
export class CommercialActionGateController {
  constructor(private readonly gateService: CommercialActionGateService) {}

  @Get('status')
  getStatus(@Request() req) {
    return this.gateService.evaluate(req.user.userId as string);
  }
}
