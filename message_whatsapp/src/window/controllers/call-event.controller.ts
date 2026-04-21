import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CallEventService, CreateCallEventDto } from '../services/call-event.service';
import { ValidationEngineService } from '../services/validation-engine.service';
import { WindowRotationService } from '../services/window-rotation.service';
import { ValidationCriterionConfig } from '../entities/validation-criterion-config.entity';
import { CallEventApiKeyGuard } from '../guards/call-event-api-key.guard';

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
   * Webhook entrant — plateforme externe de gestion des commandes.
   * POST /window/call-event
   * Requiert le header x-api-key (CALL_EVENT_API_KEY en env).
   */
  @Post('call-event')
  @UseGuards(CallEventApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async receiveCallEvent(@Body() dto: CreateCallEventDto) {
    try {
      const event = await this.callEventService.receiveCallEvent(dto);
      return { ok: true, id: event.id };
    } catch (err) {
      if (err instanceof ConflictException) {
        return { ok: true, duplicate: true };
      }
      throw err;
    }
  }

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
   * Utile quand une conversation est bloquée (critère externe jamais reçu).
   * POST /window/force-validate/:chatId
   * Body optionnel : { posteId: string }
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
    if (state.allRequiredMet && body?.posteId) {
      await this.windowRotation.onConversationValidated(chatId, body.posteId);
    }
    return { ok: true, allRequiredMet: state.allRequiredMet, criteria: state.criteria };
  }
}
