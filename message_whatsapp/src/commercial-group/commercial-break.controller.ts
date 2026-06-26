import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TakeBreakDto } from './dto/sub-group.dto';

@Controller('commercial')
@UseGuards(AuthGuard('jwt'))
export class CommercialBreakController {
  @Post('break/take')
  takeBreak(@Body() _dto: TakeBreakDto): { ok: boolean } {
    return { ok: true };
  }
}
