import { Controller, Get, Query,  } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse,  } from '@nestjs/swagger';
import { MetriquesService } from './metriques.service';
import { MetriquesGlobalesDto, PerformanceCommercialDto, PerformanceTemporelleDto, StatutChannelDto } from './dto/create-metrique.dto';

// import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // Votre guard d'authentification

@ApiTags('Métriques')
@Controller('api/metriques')
// @UseGuards(JwtAuthGuard) // Décommenter si vous utilisez l'authentification
// @ApiBearerAuth()
export class MetriquesController {
  constructor(private readonly metriquesService: MetriquesService) {}

  /**
   * GET /api/metriques/globales
   * Récupère toutes les métriques globales du dashboard
   */
  @Get('globales')
  @ApiOperation({ summary: 'Récupère toutes les métriques globales' })
  @ApiResponse({ 
    status: 200, 
    description: 'Métriques globales récupérées avec succès',
    type: MetriquesGlobalesDto
  })
  async getMetriquesGlobales(): Promise<MetriquesGlobalesDto> {
    return await this.metriquesService.getMetriquesGlobales();
  }

  /**
   * GET /api/metriques/commerciaux
   * Récupère la performance détaillée de tous les commerciaux
   */
  @Get('commerciaux')
  @ApiOperation({ summary: 'Récupère la performance des commerciaux' })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance des commerciaux récupérée avec succès',
    type: [PerformanceCommercialDto]
  })
  async getPerformanceCommerciaux(): Promise<PerformanceCommercialDto[]> {
    return await this.metriquesService.getPerformanceCommerciaux();
  }

  /**
   * GET /api/metriques/channels
   * Récupère le statut de tous les channels WhatsApp
   */
  @Get('channels')
  @ApiOperation({ summary: 'Récupère le statut des channels' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statut des channels récupéré avec succès',
    type: [StatutChannelDto]
  })
  async getStatutChannels(): Promise<StatutChannelDto[]> {
    return await this.metriquesService.getStatutChannels();
  }

  /**
   * GET /api/metriques/performance-temporelle
   * Récupère les données de performance sur une période
   */
  @Get('performance-temporelle')
  @ApiOperation({ summary: 'Récupère la performance temporelle' })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance temporelle récupérée avec succès',
    type: [PerformanceTemporelleDto]
  })
  async getPerformanceTemporelle(
    @Query('jours') jours: number = 7
  ): Promise<PerformanceTemporelleDto[]> {
    return await this.metriquesService.getPerformanceTemporelle(jours);
  }

  /**
   * GET /api/metriques/overview
   * Récupère toutes les données nécessaires pour le dashboard en une seule requête
   */
  @Get('overview')
  @ApiOperation({ summary: 'Récupère toutes les données du dashboard' })
  @ApiResponse({ 
    status: 200, 
    description: 'Données du dashboard récupérées avec succès'
  })
  async getOverview() {
    const [
      metriques,
      performanceCommercial,
      statutChannels,
      performanceTemporelle
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