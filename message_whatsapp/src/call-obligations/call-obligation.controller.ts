import { Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';
import { CallObligationService } from './call-obligation.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

interface JwtUser { userId: string; }

@ApiTags('Call Obligations')
@Controller('call-obligations')
export class CallObligationController {
  constructor(
    private readonly service: CallObligationService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  /**
   * Statut du batch courant pour le commercial connecté.
   * GET /call-obligations/mine
   */
  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Batch obligations du commercial connecté' })
  async getMine(@Request() req: { user: JwtUser }) {
    const commercial = await this.commercialRepo.findOne({
      where: { id: req.user.userId },
      relations: { poste: true },
    });
    if (!commercial?.poste?.id) return null;
    return this.service.getStatus(commercial.poste.id);
  }

  /**
   * Statut du batch courant pour un poste — admin.
   * GET /call-obligations/poste/:posteId
   */
  @Get('poste/:posteId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Batch obligations d\'un poste (admin)' })
  getByPoste(@Param('posteId') posteId: string) {
    return this.service.getStatus(posteId);
  }

  /**
   * Crée les batches manquants pour tous les postes — admin.
   * POST /call-obligations/init-all
   */
  @Post('init-all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Initialiser les batches manquants pour tous les postes (admin)' })
  initAll() {
    return this.service.initAllBatches();
  }

  /**
   * Lance le contrôle qualité messages pour un poste — admin.
   * POST /call-obligations/quality-check/:posteId
   */
  @Post('quality-check/:posteId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Contrôle qualité messages pour un poste (admin)' })
  async qualityCheck(@Param('posteId') posteId: string) {
    const passed = await this.service.runQualityCheck(posteId);
    return { posteId, qualityCheckPassed: passed };
  }
}
