import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CommercialGroupService } from './commercial-group.service';
import { AdminGuard } from 'src/auth/admin.guard';
import { AddMemberDto, CreateCommercialGroupDto, UpdateCommercialGroupDto } from './dto/commercial-group.dto';
import { GenerateScheduleDto, ScheduleConfigDto } from './dto/schedule-config.dto';
import { GroupScheduleService } from './group-schedule.service';

@Controller('commercial-groups')
@UseGuards(AdminGuard)
export class CommercialGroupController {
  constructor(
    private readonly service: CommercialGroupService,
    private readonly groupScheduleService: GroupScheduleService,
  ) {}

  @Post()
  create(@Body() body: CreateCommercialGroupDto) {
    return this.service.create(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCommercialGroupDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('schedule/generate-all')
  generateAll() {
    return this.groupScheduleService.generateForAllGroups();
  }

  @Patch(':id/schedule-config')
  setScheduleConfig(@Param('id') id: string, @Body() dto: ScheduleConfigDto) {
    return this.service.setScheduleConfig(id, dto);
  }

  @Post(':id/schedule/generate')
  generateSchedule(@Param('id') id: string, @Body() dto: GenerateScheduleDto) {
    return this.service.generateSchedule(id, dto?.months).then(daysGenerated => ({ daysGenerated }));
  }

  @Get(':id/schedule')
  getSchedule(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getSchedule(id, from, to);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() body: AddMemberDto) {
    return this.service.addMember(id, body.commercialId);
  }

  @Delete(':id/members/:commercialId')
  removeMember(@Param('id') id: string, @Param('commercialId') commercialId: string) {
    return this.service.removeMember(id, commercialId);
  }
}
