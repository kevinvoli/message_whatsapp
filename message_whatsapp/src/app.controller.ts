import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { AdminGuard } from './auth/admin.guard'; // Import AdminGuard

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('stats')
  @UseGuards(AdminGuard) // Use AdminGuard
  async getStats() {
    return this.appService.getStats();
  }
}
