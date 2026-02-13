import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/auth/admin.guard';
import {
  MetriquesGlobalesDto,
  PerformanceCommercialDto,
  PerformanceTemporelleDto,
  StatutChannelDto,
} from './dto/create-metrique.dto';
import { MetriquesService } from './metriques.service';

@ApiTags('Metriques')
@Controller('api/metriques')
@UseGuards(AdminGuard)
export class MetriquesController {
  constructor(private readonly metriquesService: MetriquesService) {}

  @Get('globales')
  @ApiOperation({ summary: 'Recupere toutes les metriques globales' })
  @ApiResponse({
    status: 200,
    description: 'Metriques globales recuperees avec succes',
    type: MetriquesGlobalesDto,
  })
  async getMetriquesGlobales(): Promise<MetriquesGlobalesDto> {
    return this.metriquesService.getMetriquesGlobales();
  }

  @Get('commerciaux')
  @ApiOperation({ summary: 'Recupere la performance des commerciaux' })
  @ApiResponse({
    status: 200,
    description: 'Performance des commerciaux recuperee avec succes',
    type: [PerformanceCommercialDto],
  })
  async getPerformanceCommerciaux(): Promise<PerformanceCommercialDto[]> {
    return this.metriquesService.getPerformanceCommerciaux();
  }

  @Get('channels')
  @ApiOperation({ summary: 'Recupere le statut des channels' })
  @ApiResponse({
    status: 200,
    description: 'Statut des channels recupere avec succes',
    type: [StatutChannelDto],
  })
  async getStatutChannels(): Promise<StatutChannelDto[]> {
    return this.metriquesService.getStatutChannels();
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

  @Get('overview')
  @ApiOperation({ summary: 'Recupere toutes les donnees du dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Donnees du dashboard recuperees avec succes',
  })
  async getOverview() {
    const [
      metriques,
      performanceCommercial,
      statutChannels,
      performanceTemporelle,
    ] = await Promise.all([
      this.metriquesService.getMetriquesGlobales(),
      this.metriquesService.getPerformanceCommerciaux(),
      this.metriquesService.getStatutChannels(),
      this.metriquesService.getPerformanceTemporelle(7),
    ]);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        metriques,
        performanceCommercial,
        statutChannels,
        performanceTemporelle,
      },
    };
  }
}
