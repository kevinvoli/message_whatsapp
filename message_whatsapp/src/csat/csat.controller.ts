import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CsatService } from './csat.service';

@Controller('csat')
export class CsatController {
  constructor(private readonly csatService: CsatService) {}

  @Get('stats')
  @UseGuards(AdminGuard)
  getStats() {
    return this.csatService.getStats();
  }
}
