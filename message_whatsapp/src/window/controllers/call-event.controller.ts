import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from 'src/auth/admin.guard';
import { CallEventService } from '../services/call-event.service';
import { ValidationEngineService } from '../services/validation-engine.service';
import { WindowRotationService } from '../services/window-rotation.service';
import { ValidationCriterionConfig } from '../entities/validation-criterion-config.entity';

@Controller('window')
export class WindowController {
  constructor(
    private readonly callEventService: CallEventService,
    private readonly validationEngine: ValidationEngineService,
    private readonly windowRotation: WindowRotationService,
    @InjectRepository(ValidationCriterionConfig)
    private readonly criterionRepo: Repository<ValidationCriterionConfig>,
  ) {}

  /**
   * Historique des appels — admin seulement.
   * GET /window/call-events
   */
  @Get('call-events')
  @UseGuards(AdminGuard)
  async getCallEvents(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const [data, total] = await this.callEventService.findAll(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
    return { data, total };
  }

  /**
   * Liste des critères de validation configurés — admin.
   * GET /window/criteria
   */
  @Get('criteria')
  @UseGuards(AdminGuard)
  getCriteria() {
    return this.validationEngine.getActiveCriteria();
  }

  /**
   * État de validation d'une conversation — admin.
   * GET /window/validation-state?chatId=xxx
   */
  @Get('validation-state')
  @UseGuards(AdminGuard)
  getValidationState(@Query('chatId') chatId: string) {
    return this.validationEngine.getValidationState(chatId);
  }

  /**
   * Mise à jour d'un critère de validation — admin.
   * PATCH /window/criteria/:id
   */
  @Patch('criteria/:id')
  @UseGuards(AdminGuard)
  async updateCriterion(
    @Param('id') id: string,
    @Body() body: { is_required?: boolean; is_active?: boolean; label?: string; sort_order?: number },
  ) {
    const criterion = await this.criterionRepo.findOne({ where: { id } });
    if (!criterion) throw new NotFoundException(`Critère ${id} introuvable`);

    const updates: Partial<ValidationCriterionConfig> = {};
    if (body.is_required !== undefined) updates.is_required = body.is_required;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.label !== undefined) updates.label = body.label;
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

    await this.criterionRepo.update({ id }, updates);
    return this.criterionRepo.findOne({ where: { id } });
  }

  /**
   * Force la rotation du bloc pour un poste — admin.
   * POST /window/rotate/:posteId
   */
  @Post('rotate/:posteId')
  @UseGuards(AdminGuard)
  async forceRotation(@Param('posteId') posteId: string) {
    const result = await this.windowRotation.performRotation(posteId);
    return { ok: true, ...result };
  }

  /**
   * Déclenche la vérification de rotation (soft) pour un poste bloqué — admin.
   * Ne force pas la rotation : exécute la même logique que la soumission de rapport.
   * POST /window/rotate-check/:posteId
   */
  @Post('rotate-check/:posteId')
  @UseGuards(AdminGuard)
  async triggerRotationCheck(@Param('posteId') posteId: string) {
    await this.windowRotation.checkAndTriggerRotation(posteId);
    return { ok: true };
  }

  /**
   * Diagnostic en lecture seule : état exact de la fenêtre d'un poste — admin.
   * Permet de voir pourquoi la rotation ne se déclenche pas.
   * GET /window/debug/:posteId
   */
  @Get('debug/:posteId')
  @UseGuards(AdminGuard)
  getDebugState(@Param('posteId') posteId: string) {
    return this.windowRotation.getDebugState(posteId);
  }

  /**
   * Déclenche le rattrapage immédiat : initialise les fenêtres manquantes
   * et vérifie la rotation pour tous les postes actifs.
   * Équivalent à forcer le cron autoCheckRotations maintenant.
   * POST /window/auto-check-all
   */
  @Post('auto-check-all')
  @UseGuards(AdminGuard)
  async autoCheckAll() {
    await this.windowRotation.autoCheckRotations();
    return { ok: true };
  }

  /**
   * Reconstruit la fenêtre d'un poste depuis zéro — admin.
   * POST /window/rebuild/:posteId
   */
  @Post('rebuild/:posteId')
  @UseGuards(AdminGuard)
  async rebuildWindow(@Param('posteId') posteId: string) {
    await this.windowRotation.buildWindowForPoste(posteId);
    const progress = await this.validationEngine.getBlockProgress(posteId);
    return { ok: true, blockProgress: progress };
  }

  /**
   * Progression du bloc pour un poste — admin.
   * GET /window/progress/:posteId
   */
  @Get('progress/:posteId')
  @UseGuards(AdminGuard)
  getProgress(@Param('posteId') posteId: string) {
    return this.validationEngine.getBlockProgress(posteId);
  }

  /**
   * Force la validation complète d'une conversation active — admin.
   * POST /window/force-validate/:chatId
   */
  @Post('force-validate/:chatId')
  @UseGuards(AdminGuard)
  async forceValidateConversation(
    @Param('chatId') chatId: string,
    @Body() body?: { posteId?: string },
  ) {
    const criteria = await this.validationEngine.getActiveCriteria();
    for (const c of criteria) {
      await this.validationEngine.markCriterionMet(chatId, c.criterion_type, 'admin_force');
    }
    const state = await this.validationEngine.getValidationState(chatId);
    if (body?.posteId) {
      await this.windowRotation.checkAndTriggerRotation(body.posteId);
    }
    return { ok: true, allRequiredMet: state.allRequiredMet, criteria: state.criteria };
  }
}
