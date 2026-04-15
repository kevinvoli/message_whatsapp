import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { ContextService } from './services/context.service';
import { Context } from './entities/context.entity';
import { ContextBinding } from './entities/context-binding.entity';

/**
 * CTX-E3 — ContextController
 *
 * REST CRUD pour Context et ContextBinding, utilisé par le panel admin.
 * Tous les endpoints sont protégés par AdminGuard.
 */
@Controller('contexts')
@UseGuards(AdminGuard)
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  // ─── Contexts ─────────────────────────────────────────────────────────────

  @Get()
  findAll() {
    return this.contextService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contextService.findById(id);
  }

  @Post()
  create(@Body() dto: Partial<Context>) {
    return this.contextService.createContext(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<Context>) {
    return this.contextService.updateContext(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contextService.deleteContext(id);
  }

  // ─── Bindings ──────────────────────────────────────────────────────────────

  @Post(':contextId/bindings')
  addBinding(
    @Param('contextId') contextId: string,
    @Body() dto: Partial<ContextBinding>,
  ) {
    return this.contextService.addBinding(contextId, dto);
  }

  @Delete('bindings/:bindingId')
  removeBinding(@Param('bindingId') bindingId: string) {
    return this.contextService.removeBinding(bindingId);
  }

  // ─── ChatContexts par poste ───────────────────────────────────────────────

  @Get('poste/:posteId/chat-contexts')
  getChatContextsByPoste(
    @Param('posteId') posteId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.contextService.findChatContextsByPoste(
      posteId,
      limit ? parseInt(limit, 10) : 20,
      cursor,
    );
  }
}
