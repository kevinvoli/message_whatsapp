import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { CreateMessageAutoDto, CreateAutoMessageKeywordDto } from './dto/create-message-auto.dto';
import { UpdateMessageAutoDto } from './dto/update-message-auto.dto';
import { AdminGuard } from '../auth/admin.guard';
import { AutoMessageScopeConfigService } from './auto-message-scope-config.service';
import { AutoMessageScopeConfig, AutoMessageScopeType } from './entities/auto-message-scope-config.entity';
import { UpsertAutoMessageScopeDto } from './dto/upsert-auto-message-scope.dto';
import { AutoMessageTriggerType } from './entities/message-auto.entity';
import { BusinessHoursService, UpdateBusinessHoursDto } from './business-hours.service';

@Controller('message-auto')
@UseGuards(AdminGuard)
export class MessageAutoController {
  constructor(
    private readonly messageAutoService: MessageAutoService,
    private readonly scopeConfigService: AutoMessageScopeConfigService,
    private readonly businessHoursService: BusinessHoursService,
  ) {}

  // ─── Messages auto CRUD ───────────────────────────────────────────────────

  @Post()
  create(@Body() createMessageAutoDto: CreateMessageAutoDto) {
    return this.messageAutoService.create(createMessageAutoDto);
  }

  @Get()
  findAll() {
    return this.messageAutoService.findAll();
  }

  // ─── Filtrage par trigger — avant `:id` pour éviter la collision NestJS ──

  @Get('by-trigger/:trigger')
  findByTrigger(@Param('trigger') trigger: AutoMessageTriggerType) {
    return this.messageAutoService.findByTrigger(trigger);
  }

  // ─── Business hours ────────────────────────────────────────────────────────

  @Get('business-hours')
  getBusinessHours() {
    return this.businessHoursService.getAll();
  }

  @Patch('business-hours/:dayOfWeek')
  updateBusinessHours(
    @Param('dayOfWeek') dayOfWeek: string,
    @Body() dto: UpdateBusinessHoursDto,
  ) {
    return this.businessHoursService.updateDay(parseInt(dayOfWeek, 10), dto);
  }

  // ─── Scope config — routes avant `:id` pour éviter la collision NestJS ───

  /** Liste tous les overrides (poste + canal + provider) */
  @Get('scope-config')
  findAllScopeConfig(): Promise<AutoMessageScopeConfig[]> {
    return this.scopeConfigService.findAll();
  }

  /** Liste les overrides filtrés par type : poste | canal | provider */
  @Get('scope-config/type/:type')
  findScopeConfigByType(
    @Param('type') type: AutoMessageScopeType,
  ): Promise<AutoMessageScopeConfig[]> {
    return this.scopeConfigService.findByType(type);
  }

  /** Crée ou met à jour un override (upsert sur scope_type + scope_id) */
  @Post('scope-config')
  upsertScopeConfig(
    @Body() dto: UpsertAutoMessageScopeDto,
  ): Promise<AutoMessageScopeConfig> {
    return this.scopeConfigService.upsert(dto);
  }

  /** Supprime un override par son ID */
  @Delete('scope-config/:id')
  removeScopeConfig(@Param('id') id: string): Promise<void> {
    return this.scopeConfigService.remove(id);
  }

  // ─── Messages auto CRUD (suite) ───────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messageAutoService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMessageAutoDto: UpdateMessageAutoDto,
  ) {
    return this.messageAutoService.update(id, updateMessageAutoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messageAutoService.remove(id);
  }

  // ─── Mots-clés ────────────────────────────────────────────────────────────

  @Get(':id/keywords')
  getKeywords(@Param('id') id: string) {
    return this.messageAutoService.getKeywords(id);
  }

  @Post(':id/keywords')
  addKeyword(
    @Param('id') id: string,
    @Body() dto: CreateAutoMessageKeywordDto,
  ) {
    return this.messageAutoService.addKeyword(id, dto);
  }

  @Delete(':id/keywords/:keywordId')
  removeKeyword(
    @Param('id') id: string,
    @Param('keywordId') keywordId: string,
  ) {
    return this.messageAutoService.removeKeyword(id, keywordId);
  }
}
