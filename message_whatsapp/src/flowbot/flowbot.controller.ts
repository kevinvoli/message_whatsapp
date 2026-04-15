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
import { FlowCrudService } from './services/flow-crud.service';
import { FlowAnalyticsService } from './services/flow-analytics.service';
import { FlowMonitorService } from './services/flow-monitor.service';
import { BotProviderAdapterRegistry } from './services/bot-provider-adapter-registry.service';
import { FlowBot } from './entities/flow-bot.entity';
import { FlowNode } from './entities/flow-node.entity';
import { FlowEdge } from './entities/flow-edge.entity';
import { FlowTrigger } from './entities/flow-trigger.entity';
import { AdminGuard } from 'src/auth/admin.guard';

@Controller('flowbot')
@UseGuards(AdminGuard)
export class FlowBotController {
  constructor(
    private readonly crudService: FlowCrudService,
    private readonly analyticsService: FlowAnalyticsService,
    private readonly monitorService: FlowMonitorService,
    private readonly adapterRegistry: BotProviderAdapterRegistry,
  ) {}

  // ─── Flows ───────────────────────────────────────────────────────────────

  @Get('flows')
  findAll() {
    return this.crudService.findAllFlows();
  }

  @Get('flows/:id')
  findOne(@Param('id') id: string) {
    return this.crudService.findFlowById(id);
  }

  @Post('flows')
  create(@Body() dto: Partial<FlowBot>) {
    return this.crudService.createFlow(dto);
  }

  @Patch('flows/:id')
  update(@Param('id') id: string, @Body() dto: Partial<FlowBot>) {
    return this.crudService.updateFlow(id, dto);
  }

  @Patch('flows/:id/active')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.crudService.setActive(id, isActive);
  }

  @Delete('flows/:id')
  remove(@Param('id') id: string) {
    return this.crudService.deleteFlow(id);
  }

  // ─── Nœuds ───────────────────────────────────────────────────────────────

  @Post('flows/:flowId/nodes')
  upsertNodes(@Param('flowId') flowId: string, @Body() nodes: Partial<FlowNode>[]) {
    return this.crudService.upsertNodes(flowId, nodes);
  }

  @Delete('nodes/:id')
  removeNode(@Param('id') id: string) {
    return this.crudService.deleteNode(id);
  }

  // ─── Arêtes ───────────────────────────────────────────────────────────────

  @Post('flows/:flowId/edges')
  upsertEdges(@Param('flowId') flowId: string, @Body() edges: Partial<FlowEdge>[]) {
    return this.crudService.upsertEdges(flowId, edges);
  }

  @Delete('edges/:id')
  removeEdge(@Param('id') id: string) {
    return this.crudService.deleteEdge(id);
  }

  // ─── Triggers ─────────────────────────────────────────────────────────────

  @Post('flows/:flowId/triggers')
  upsertTriggers(@Param('flowId') flowId: string, @Body() triggers: Partial<FlowTrigger>[]) {
    return this.crudService.upsertTriggers(flowId, triggers);
  }

  @Delete('triggers/:id')
  removeTrigger(@Param('id') id: string) {
    return this.crudService.deleteTrigger(id);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  @Get('flows/:flowId/analytics')
  getAnalytics(@Param('flowId') flowId: string) {
    return this.analyticsService.findByFlow(flowId);
  }

  // ─── Monitoring sessions ──────────────────────────────────────────────────

  @Get('flows/:flowId/sessions')
  getFlowSessions(
    @Param('flowId') flowId: string,
    @Query('limit') limit?: string,
  ) {
    return this.monitorService.findRecentByFlow(flowId, limit ? parseInt(limit, 10) : 20);
  }

  @Get('flows/:flowId/sessions/active')
  getFlowActiveSessions(@Param('flowId') flowId: string) {
    return this.monitorService.findActiveByFlow(flowId);
  }

  @Get('sessions/:sessionId/logs')
  getSessionLogs(@Param('sessionId') sessionId: string) {
    return this.monitorService.findSessionLogs(sessionId);
  }

  @Delete('sessions/:sessionId')
  cancelSession(@Param('sessionId') sessionId: string) {
    return this.monitorService.cancelSession(sessionId);
  }

  // ─── Providers enregistrés ────────────────────────────────────────────────

  @Get('providers')
  listProviders() {
    return { providers: this.adapterRegistry.listProviders() };
  }
}
