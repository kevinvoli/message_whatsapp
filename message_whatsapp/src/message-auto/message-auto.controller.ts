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
import { CreateMessageAutoDto } from './dto/create-message-auto.dto';
import { UpdateMessageAutoDto } from './dto/update-message-auto.dto';
import { AdminGuard } from '../auth/admin.guard';
import { AutoMessageScopeConfigService } from './auto-message-scope-config.service';
import { AutoMessageScopeConfig, AutoMessageScopeType } from './entities/auto-message-scope-config.entity';
import { UpsertAutoMessageScopeDto } from './dto/upsert-auto-message-scope.dto';

@Controller('message-auto')
@UseGuards(AdminGuard)
export class MessageAutoController {
  constructor(
    private readonly messageAutoService: MessageAutoService,
    private readonly scopeConfigService: AutoMessageScopeConfigService,
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

  // ─── Template statuses (lecture seule) ───────────────────────────────────

  @Get('template-status')
  findAllTemplateStatuses() {
    return this.messageAutoService.findAllTemplateStatuses();
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
}
