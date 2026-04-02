import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/auth/admin.guard';
import {
  MetriquesGlobalesDto,
  PerformanceCommercialDto,
  PerformanceTemporelleDto,
  StatutChannelDto,
} from './dto/create-metrique.dto';
import { QueueMetricsDto } from './dto/create-metrique.dto';
import { MetriquesService } from './metriques.service';
import { AnalyticsSnapshotService } from './analytics-snapshot.service';

const STANDARD_PERIODS = new Set(['today', 'week', 'month', 'year']);

@ApiTags('Metriques')
@Controller('api/metriques')
@UseGuards(AdminGuard)
export class MetriquesController {
  constructor(
    private readonly metriquesService: MetriquesService,
    private readonly snapshotService: AnalyticsSnapshotService,
  ) {}

  @Get('globales')
  @ApiOperation({ summary: 'Recupere toutes les metriques globales' })
  @ApiResponse({
    status: 200,
    description: 'Metriques globales recuperees avec succes',
    type: MetriquesGlobalesDto,
  })
  async getMetriquesGlobales(
    @Query('periode') periode: string = 'today',
  ): Promise<MetriquesGlobalesDto> {
    return this.metriquesService.getMetriquesGlobales(periode);
  }

  @Get('commerciaux')
  @ApiOperation({ summary: 'Recupere la performance des commerciaux' })
  @ApiResponse({
    status: 200,
    description: 'Performance des commerciaux recuperee avec succes',
    type: [PerformanceCommercialDto],
  })
  async getPerformanceCommerciaux(
    @Query('periode') periode: string = 'today',
  ): Promise<PerformanceCommercialDto[]> {
    return this.metriquesService.getPerformanceCommerciaux(periode);
  }

  @Get('channels')
  @ApiOperation({ summary: 'Recupere le statut des channels' })
  @ApiResponse({
    status: 200,
    description: 'Statut des channels recupere avec succes',
    type: [StatutChannelDto],
  })
  async getStatutChannels(
    @Query('periode') periode: string = 'today',
  ): Promise<StatutChannelDto[]> {
    return this.metriquesService.getStatutChannels(periode);
  }

  @Get('performance-temporelle')
  @ApiOperation({ summary: 'Recupere la performance temporelle' })
  @ApiResponse({
    status: 200,
    description: 'Performance temporelle recuperee avec succes',
    type: [PerformanceTemporelleDto],
  })
  async getPerformanceTemporelle(
    @Query('jours') jours: number = 7,
  ): Promise<PerformanceTemporelleDto[]> {
    return this.metriquesService.getPerformanceTemporelle(jours);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Recupere les metriques de queue' })
  @ApiResponse({
    status: 200,
    description: 'Metriques queue recuperees avec succes',
    type: QueueMetricsDto,
  })
  async getQueueMetrics(): Promise<QueueMetricsDto> {
    return this.metriquesService.getQueueMetrics();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Recupere toutes les donnees du dashboard (ou une section)' })
  @ApiResponse({
    status: 200,
    description: 'Donnees du dashboard recuperees avec succes',
  })
  async getOverview(
    @Query('periode') periode: string = 'today',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('section') section?: 'globales' | 'commerciaux' | 'channels' | 'temporelle',
  ) {
    const joursMap: Record<string, number> = {
      today: 1,
      week: 7,
      month: 30,
      year: 365,
    };
    const jours = joursMap[periode] ?? 7;
    const isStandard = STANDARD_PERIODS.has(periode) && !dateFrom && !dateTo;

    // ── Lecture snapshot pour une section précise ──────────────────────────────
    if (section && isStandard) {
      const snap = await this.snapshotService.getLatest('global', periode);
      if (snap) {
        const d = snap.data as any;
        const sectionMap: Record<string, unknown> = {
          globales:    d.metriques,
          commerciaux: d.performanceCommercial,
          channels:    d.statutChannels,
          temporelle:  d.performanceTemporelle,
        };
        return {
          success: true,
          timestamp: new Date().toISOString(),
          computed_at: snap.computed_at,
          from_snapshot: true,
          section,
          data: sectionMap[section],
        };
      }
      // Snapshot expiré → calcul de la section uniquement
      const liveData = await this.computeSection(section, periode, jours, dateFrom, dateTo);
      return {
        success: true,
        timestamp: new Date().toISOString(),
        computed_at: new Date(),
        from_snapshot: false,
        section,
        data: liveData,
      };
    }

    // ── Lecture snapshot complète (comportement historique) ───────────────────
    if (isStandard) {
      const snap = await this.snapshotService.getLatest('global', periode);
      if (snap) {
        const d = snap.data as any;
        return {
          success: true,
          timestamp: new Date().toISOString(),
          computed_at: snap.computed_at,
          from_snapshot: true,
          data: {
            metriques: d.metriques,
            performanceCommercial: d.performanceCommercial,
            statutChannels: d.statutChannels,
            performanceTemporelle: d.performanceTemporelle,
          },
        };
      }
    }

    // ── Calcul complet (date custom ou snapshot expiré) ───────────────────────
    const [
      metriques,
      performanceCommercial,
      statutChannels,
      performanceTemporelle,
    ] = await Promise.all([
      this.metriquesService.getMetriquesGlobales(periode, dateFrom, dateTo),
      this.metriquesService.getPerformanceCommerciaux(periode, dateFrom, dateTo),
      this.metriquesService.getStatutChannels(periode, dateFrom, dateTo),
      this.metriquesService.getPerformanceTemporelle(jours, dateFrom, dateTo),
    ]);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      computed_at: new Date(),
      from_snapshot: false,
      data: {
        metriques,
        performanceCommercial,
        statutChannels,
        performanceTemporelle,
      },
    };
  }

  private async computeSection(
    section: 'globales' | 'commerciaux' | 'channels' | 'temporelle',
    periode: string,
    jours: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<unknown> {
    switch (section) {
      case 'globales':    return this.metriquesService.getMetriquesGlobales(periode, dateFrom, dateTo);
      case 'commerciaux': return this.metriquesService.getPerformanceCommerciaux(periode, dateFrom, dateTo);
      case 'channels':    return this.metriquesService.getStatutChannels(periode, dateFrom, dateTo);
      case 'temporelle':  return this.metriquesService.getPerformanceTemporelle(jours, dateFrom, dateTo);
    }
  }

  @Post('refresh-snapshots')
  @ApiOperation({ summary: 'Force le recalcul immédiat de tous les snapshots' })
  async refreshSnapshots() {
    await this.snapshotService.computeAll();
    return { success: true, message: 'Snapshots recalculés' };
  }

  @Get('snapshot-status')
  @ApiOperation({ summary: 'État des snapshots par période' })
  async getSnapshotStatus() {
    const periods = ['today', 'week', 'month', 'year'];
    const status = await Promise.all(
      periods.map(async (p) => {
        const [snap, raw] = await Promise.all([
          this.snapshotService.getLatest('global', p),
          this.snapshotService.getRaw('global', p),
        ]);
        const ageSeconds = raw
          ? Math.round((Date.now() - new Date(raw.computed_at).getTime()) / 1000)
          : null;
        return {
          period: p,
          has_valid_snapshot: snap !== null,
          age_seconds: ageSeconds,
          ttl_seconds: raw?.ttl_seconds ?? null,
          computed_at: raw?.computed_at ?? null,
        };
      }),
    );
    return { now: new Date().toISOString(), snapshots: status };
  }
}

