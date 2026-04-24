import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CallLogService } from './call_log.service';
import { CreateCallLogDto } from './dto/create-call-log.dto';
import { AdminGuard } from 'src/auth/admin.guard';

interface JwtUser { userId: string; }

@Controller()
export class CallLogController {
  constructor(private readonly callLogService: CallLogService) {}

  /** GET /contact/:id/call-logs — historique complet d'un contact */
  @Get('contact/:id/call-logs')
  @UseGuards(AuthGuard('jwt'))
  findByContact(@Param('id') id: string) {
    return this.callLogService.findByContactId(id);
  }

  /** GET /call-logs/commercial/:id — tous les appels d'un commercial */
  @Get('call-logs/commercial/:id')
  @UseGuards(AuthGuard('jwt'))
  findByCommercial(@Param('id') id: string) {
    return this.callLogService.findByCommercialId(id);
  }

  /** PATCH /call-logs/:id — modification réservée aux admins */
  @Patch('call-logs/:id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: Partial<CreateCallLogDto>) {
    return this.callLogService.update(id, dto);
  }

  /** DELETE /call-logs/:id — suppression réservée aux admins */
  @Delete('call-logs/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.callLogService.remove(id);
  }

  /** GET /call-logs/mine/missed — appels en absence non traités du commercial connecté */
  @Get('call-logs/mine/missed')
  @UseGuards(AuthGuard('jwt'))
  missedMine(@Request() req: { user: JwtUser }) {
    return this.callLogService.findMissedByCommercial(req.user.userId);
  }

  /** PATCH /call-logs/:id/treat — marque un appel en absence comme traité */
  @Patch('call-logs/:id/treat')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  treat(@Param('id') id: string, @Request() req: { user: JwtUser }) {
    return this.callLogService.markTreated(id, req.user.userId);
  }
}
