import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { GeoAccessService, CreateLocationDto } from './geo_access.service';

@Controller('geo-access')
@UseGuards(AdminGuard)
export class GeoAccessController {
  constructor(private readonly svc: GeoAccessService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateLocationDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
