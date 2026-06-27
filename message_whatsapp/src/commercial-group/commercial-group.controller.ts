import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CommercialGroupService } from './commercial-group.service';
import { AdminGuard } from 'src/auth/admin.guard';
import { AddMemberDto, CreateCommercialGroupDto, PatchDisconnectReasonDto, UpdateCommercialGroupDto } from './dto/commercial-group.dto';
import { GenerateScheduleDto, ScheduleConfigDto } from './dto/schedule-config.dto';
import { GroupScheduleService } from './group-schedule.service';
import { CommercialPlanningService } from './commercial-planning.service';
import { CreateAbsenceDto, CreateAbsenceRangeDto, CreateExceptionalDto, CreateReplacementDto } from './dto/create-planning.dto';
import { CommercialPresenceHistoryService } from './commercial-presence-history.service';

@Controller('commercial-groups')
@UseGuards(AdminGuard)
export class CommercialGroupController {
  constructor(
    private readonly service: CommercialGroupService,
    private readonly groupScheduleService: GroupScheduleService,
    private readonly planningService: CommercialPlanningService,
    private readonly presenceHistoryService: CommercialPresenceHistoryService,
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

  @Post('planning/absence-range')
  createAbsenceRange(@Body() body: CreateAbsenceRangeDto) {
    return this.planningService.createAbsenceRange(body);
  }

  @Get('planning/month/:year/:month')
  getPlanningMonth(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.planningService.findByMonth(year, month);
  }

  @Get('planning/summary/:year/:month')
  getAbsenceSummary(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.planningService.getAbsenceSummary(year, month);
  }

  @Get('planning/audit')
  getAudit(
    @Query('commercialId') commercialId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.planningService.getAudit({ commercialId, from, to });
  }

  @Delete('planning/:id')
  removePlanning(@Param('id') id: string) {
    return this.planningService.remove(id);
  }

  @Get('sessions')
  getSessions(
    @Query('date') date?: string,
    @Query('commercialId') commercialId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getSessions({
      date,
      commercialId,
      status: status as 'active' | 'closed' | 'all' | undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('presence-history')
  getPresenceHistory(@Query('date') date?: string) {
    const tz = process.env['TZ'] ?? 'Africa/Abidjan';
    const today = new Intl.DateTimeFormat('fr-CA', { timeZone: tz }).format(new Date());
    return this.presenceHistoryService.getPresenceForDate(date ?? today);
  }

  @Get('disconnect-history')
  getDisconnectHistory(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getDisconnectHistory({
      from,
      to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('disconnect-history/:commercialId')
  getDisconnectHistoryByCommercial(
    @Param('commercialId') commercialId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getDisconnectHistory({
      commercialId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Patch('disconnect-history/:logId/reason')
  patchDisconnectReason(
    @Param('logId') logId: string,
    @Body() dto: PatchDisconnectReasonDto,
  ) {
    return this.service.patchDisconnectReason(logId, dto.reason);
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
