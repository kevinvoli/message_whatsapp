import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CommercialSubGroupService } from './commercial-sub-group.service';
import { BreakScheduleService } from './break-schedule.service';
import { BreakExclusionService } from './break-exclusion.service';
import {
  CreateSubGroupDto,
  UpdateSubGroupDto,
  UpsertBreakScheduleDto,
  CreateBreakExclusionDto,
} from './dto/sub-group.dto';
import { AddMemberDto } from './dto/commercial-group.dto';

@Controller('commercial-groups')
@UseGuards(AdminGuard)
export class CommercialSubGroupController {
  constructor(
    private readonly subGroupService: CommercialSubGroupService,
    private readonly breakScheduleService: BreakScheduleService,
    private readonly breakExclusionService: BreakExclusionService,
  ) {}

  // --- Routes statiques avant les routes paramétrées ---

  @Post('sub-groups')
  create(@Body() dto: CreateSubGroupDto) {
    return this.subGroupService.create(dto);
  }

  @Get(':groupId/sub-groups')
  findAll(@Param('groupId') groupId: string) {
    return this.subGroupService.findAll(groupId);
  }

  @Delete('break-schedule/:scheduleId')
  deleteBreakSchedule(@Param('scheduleId') scheduleId: string) {
    return this.breakScheduleService.softDelete(scheduleId);
  }

  @Delete('exclusions/:exclusionId')
  deleteExclusion(@Param('exclusionId') exclusionId: string) {
    return this.breakExclusionService.softDelete(exclusionId);
  }

  // --- Routes paramétrées sous-groupes ---

  @Get('sub-groups/:subId')
  findOne(@Param('subId') subId: string) {
    return this.subGroupService.findOne(subId);
  }

  @Patch('sub-groups/:subId')
  update(@Param('subId') subId: string, @Body() dto: UpdateSubGroupDto) {
    return this.subGroupService.update(subId, dto);
  }

  @Delete('sub-groups/:subId')
  softDelete(@Param('subId') subId: string) {
    return this.subGroupService.softDelete(subId);
  }

  @Post('sub-groups/:subId/members')
  addMember(@Param('subId') subId: string, @Body() body: AddMemberDto) {
    return this.subGroupService.addMember(subId, body.commercialId);
  }

  @Delete('sub-groups/:subId/members/:commercialId')
  removeMember(
    @Param('subId') subId: string,
    @Param('commercialId') commercialId: string,
  ) {
    return this.subGroupService.removeMember(subId, commercialId);
  }

  // --- Plages de pause par sous-groupe ---

  @Get('sub-groups/:subId/break-schedule')
  getBreakSchedule(@Param('subId') subId: string) {
    return this.breakScheduleService.findBySubGroup(subId);
  }

  @Put('sub-groups/:subId/break-schedule')
  upsertBreakSchedule(
    @Param('subId') subId: string,
    @Body() dto: UpsertBreakScheduleDto,
  ) {
    return this.breakScheduleService.upsert(subId, dto);
  }

  // --- Exclusions de pause par sous-groupe ---

  @Get('sub-groups/:subId/exclusions')
  getExclusions(@Param('subId') subId: string) {
    return this.breakExclusionService.findBySubGroup(subId);
  }

  @Post('sub-groups/:subId/exclusions')
  createExclusion(
    @Param('subId') subId: string,
    @Body() dto: CreateBreakExclusionDto,
  ) {
    return this.breakExclusionService.create({ ...dto, subGroupId: subId });
  }
}
