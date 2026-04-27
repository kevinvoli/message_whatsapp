import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/admin.guard';
import { TargetsService } from './targets.service';
import { CommercialDailySnapshotService } from './commercial-daily-snapshot.service';
import { CreateTargetDto } from './dto/create-target.dto';

@Controller('targets')
export class TargetsController {
  constructor(
    private readonly targetsService: TargetsService,
    private readonly snapshotService: CommercialDailySnapshotService,
  ) {}

  @UseGuards(AdminGuard)
  @Get()
  findAll(@Query('commercial_id') commercial_id?: string) {
    return this.targetsService.findAll(commercial_id);
  }

  @UseGuards(AdminGuard)
  @Get('progress/all')
  getProgressAll() {
    return this.targetsService.getProgressAll();
  }

  @UseGuards(AdminGuard)
  @Get('ranking')
  getRanking(@Query('period') period?: 'today' | 'week' | 'month') {
    return this.targetsService.getRanking(period ?? 'month');
  }

  @UseGuards(AdminGuard)
  @Get('ranking/formula')
  getRankingFormula() {
    return this.targetsService.getRankingWeights();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-progress')
  getMyProgress(@Request() req) {
    return this.targetsService.getProgress(req.user.userId);
  }

  @UseGuards(AdminGuard)
  @Get('snapshot/history')
  getSnapshotHistory(
    @Query('commercial_id') commercialId: string,
    @Query('days') days = 30,
  ) {
    return this.snapshotService.getHistory(commercialId, Number(days));
  }

  @UseGuards(AdminGuard)
  @Post('snapshot/compute')
  computeSnapshot(@Body('date') date?: string) {
    const target = date ?? new Date().toISOString().slice(0, 10);
    return this.snapshotService.computeForDate(target).then(() => ({ computed: true, date: target }));
  }

  @UseGuards(AdminGuard)
  @Post()
  create(@Body() dto: CreateTargetDto, @Request() req) {
    return this.targetsService.create(dto, req.user?.email ?? 'admin');
  }

  @UseGuards(AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateTargetDto>) {
    return this.targetsService.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.targetsService.remove(id);
  }
}
