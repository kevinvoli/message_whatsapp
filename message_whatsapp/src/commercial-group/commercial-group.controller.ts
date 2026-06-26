import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CommercialGroupService } from './commercial-group.service';
import { AdminGuard } from 'src/auth/admin.guard';
import { AddMemberDto, CreateCommercialGroupDto, UpdateCommercialGroupDto } from './dto/commercial-group.dto';
import { GenerateScheduleDto, ScheduleConfigDto } from './dto/schedule-config.dto';
import { GroupScheduleService } from './group-schedule.service';
import { CommercialPlanningService } from './commercial-planning.service';
import { CreateAbsenceDto, CreateAbsenceRangeDto, CreateExceptionalDto, CreateReplacementDto } from './dto/create-planning.dto';
import { CommercialSubGroupService } from './commercial-sub-group.service';
import { BreakScheduleService } from './break-schedule.service';
import { BreakExclusionService } from './break-exclusion.service';
import { CreateBreakExclusionDto, CreateSubGroupDto, UpdateSubGroupDto, UpsertBreakScheduleDto } from './dto/sub-group.dto';
import { BreakSupervisionService } from './break-supervision.service';
import { DisconnectMonitorJob } from './jobs/disconnect-monitor.job';

@Controller('commercial-groups')
@UseGuards(AdminGuard)
export class CommercialGroupController {
  constructor(
    private readonly service: CommercialGroupService,
    private readonly groupScheduleService: GroupScheduleService,
    private readonly planningService: CommercialPlanningService,
    private readonly subGroupService: CommercialSubGroupService,
    private readonly breakScheduleService: BreakScheduleService,
    private readonly breakExclusionService: BreakExclusionService,
    private readonly supervisionService: BreakSupervisionService,
    private readonly disconnectMonitor: DisconnectMonitorJob,
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

  // --- Routes sous-groupes & pauses (statiques — AVANT :id) ---

  @Post('sub-groups')
  createSubGroup(@Body() dto: CreateSubGroupDto) {
    return this.subGroupService.create(dto);
  }

  @Patch('sub-groups/:subId')
  updateSubGroup(@Param('subId') subId: string, @Body() dto: UpdateSubGroupDto) {
    return this.subGroupService.update(subId, dto);
  }

  @Delete('sub-groups/:subId')
  @HttpCode(204)
  deleteSubGroup(@Param('subId') subId: string) {
    return this.subGroupService.softDelete(subId);
  }

  @Post('sub-groups/:subId/members')
  addSubGroupMember(@Param('subId') subId: string, @Body() body: { commercialId: string }) {
    return this.subGroupService.addMember(subId, body.commercialId);
  }

  @Delete('sub-groups/:subId/members/:cId')
  removeSubGroupMember(@Param('subId') subId: string, @Param('cId') cId: string) {
    return this.subGroupService.removeMember(subId, cId);
  }

  @Put('sub-groups/:subId/break-schedule')
  upsertBreakSchedule(@Param('subId') subId: string, @Body() dto: UpsertBreakScheduleDto) {
    return this.breakScheduleService.upsert(subId, dto);
  }

  @Get('sub-groups/:subId/break-schedule')
  getBreakSchedule(@Param('subId') subId: string) {
    return this.breakScheduleService.findBySubGroup(subId);
  }

  @Get('sub-groups/:subId/exclusions')
  getExclusions(@Param('subId') subId: string) {
    return this.breakExclusionService.findBySubGroup(subId);
  }

  @Delete('sub-groups/:subId/exclusions/:eid')
  @HttpCode(204)
  deleteExclusionFromSubGroup(@Param('eid') eid: string) {
    return this.breakExclusionService.softDelete(eid);
  }

  @Post('sub-groups/:subId/exclusions')
  createExclusion(@Body() dto: CreateBreakExclusionDto) {
    return this.breakExclusionService.create(dto);
  }

  @Delete('break-schedule/:id')
  @HttpCode(204)
  deleteBreakSchedule(@Param('id') id: string) {
    return this.breakScheduleService.softDelete(id);
  }

  @Delete('exclusions/:id')
  @HttpCode(204)
  deleteExclusion(@Param('id') id: string) {
    return this.breakExclusionService.softDelete(id);
  }

  @Get('break-supervision')
  getSupervision() {
    return this.supervisionService.getSupervision();
  }

  @Get('disconnect-alerts')
  getDisconnectAlerts() {
    return this.disconnectMonitor.getActiveAlerts();
  }

  @Get('presence')
  getPresence() {
    return this.service.getPresence();
  }

  @Patch('presence/:id/working-today')
  setWorkingToday(
    @Param('id') id: string,
    @Body('isWorkingToday') isWorkingToday: boolean,
  ) {
    return this.service.setWorkingToday(id, isWorkingToday);
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

  @Get(':id/sub-groups')
  getSubGroups(@Param('id') id: string) {
    return this.subGroupService.findAll(id);
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
