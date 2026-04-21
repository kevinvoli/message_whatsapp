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
import { ValidationCriterionConfig } from '../entities/validation-criterion-config.entity';

@Controller('window')
export class WindowController {
  constructor(
    private readonly callEventService: CallEventService,
    private readonly validationEngine: ValidationEngineService,
    @InjectRepository(ValidationCriterionConfig)
    private readonly criterionRepo: Repository<ValidationCriterionConfig>,
  ) {}

  /**
   * Webhook entrant — plateforme externe de gestion des commandes.
   * POST /window/call-event
   */
  @Post('call-event')
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
}
