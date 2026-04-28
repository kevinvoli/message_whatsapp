import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { LoginLogService } from './login-log.service';

@Controller('admin/login-logs')
@UseGuards(AdminGuard)
export class LoginLogController {
  constructor(private readonly service: LoginLogService) {}

  @Get()
  findAll(
    @Query('user_id') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAll({
      userId,
      limit:  limit  ? Number(limit)  : 50,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Delete('purge')
  purge(@Query('days') days?: string) {
    return this.service.purgeOld(days ? Number(days) : 90).then((count) => ({ deleted: count }));
  }
}
