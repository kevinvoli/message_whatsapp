import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CommercialGroupService } from './commercial-group.service';
import { AdminGuard } from 'src/auth/admin.guard';
import { AddMemberDto, CreateCommercialGroupDto, UpdateCommercialGroupDto } from './dto/commercial-group.dto';
import { GenerateScheduleDto, ScheduleConfigDto } from './dto/schedule-config.dto';
import { GroupScheduleService } from './group-schedule.service';
import { CommercialPlanningService } from './commercial-planning.service';
import { CreateAbsenceDto, CreateExceptionalDto, CreateReplacementDto } from './dto/create-planning.dto';

@Controller('commercial-groups')
@UseGuards(AdminGuard)
export class CommercialGroupController {
  constructor(
    private readonly service: CommercialGroupService,
    private readonly groupScheduleService: GroupScheduleService,
    private readonly planningService: CommercialPlanningService,
  ) {}

  @Post()
  create(@Body() body: CreateCommercialGroupDto) {
    return this.service.create(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  // --- Routes statiques AVANT les routes paramétrées (:id) ---

  @Post('schedule/generate-all')
  generateAll() {
    return this.groupScheduleService.generateForAllGroups();
  }

  @Get('planning/calendar-health')
  getCalendarHealth() {
    return this.groupScheduleService.getGroupsWithExpiringCalendar(7);
  }

  @Get('planning')
  getPlanningByDate(@Query('date') date?: string) {
    return this.planningService.findByDate(date ?? this.planningService.getTodayString());
  }

  @Post('planning')
  createPlanning(@Body() body: CreateAbsenceDto | CreateExceptionalDto) {
    if ((body as any).type === 'exceptional') {
      return this.planningService.createExceptional(body as CreateExceptionalDto);
    }
    return this.planningService.createAbsence(body as CreateAbsenceDto);
  }

  @Post('planning/replacement')
  createReplacement(@Body() body: CreateReplacementDto) {
    return this.planningService.createReplacement(body);
  }

  @Delete('planning/:id')
  removePlanning(@Param('id') id: string) {
    return this.planningService.remove(id);
  }

  // --- Routes paramétrées ---

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
