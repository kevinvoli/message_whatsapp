import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CallLogService } from './call_log.service';
import { CreateCallLogDto } from './dto/create-call-log.dto';
import { AdminGuard } from 'src/auth/admin.guard';

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
}
