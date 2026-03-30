import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/auth/admin.guard';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { QueuePosition } from './entities/queue-position.entity';
import { DispatcherService } from './dispatcher.service';
import { DispatchSettingsService } from './services/dispatch-settings.service';
import { DispatchSettings } from './entities/dispatch-settings.entity';
import { UpdateDispatchSettingsDto } from './dto/update-dispatch-settings.dto';

@ApiTags('Queue')
@Controller('queue')
@UseGuards(AdminGuard)
export class DispatcherController {
  constructor(
    private readonly queueService: QueueService,
    private readonly gateway: WhatsappMessageGateway,
    private readonly dispatcherService: DispatcherService,
    private readonly dispatchSettingsService: DispatchSettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Recupere la file d'attente" })
  @ApiResponse({ status: 200, description: 'Queue recuperee' })
  async getQueue(): Promise<QueuePosition[]> {
    return this.queueService.getQueuePositions();
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset complet de la queue' })
  @ApiResponse({ status: 200, description: 'Queue reset' })
  async resetQueue(): Promise<{ success: boolean }> {
    await this.queueService.resetQueueState();
    this.gateway.emitQueueUpdatePublic('admin_reset');
    return { success: true };
  }

  @Post('block/:posteId')
  @ApiOperation({ summary: 'Bloquer un poste de la queue' })
  @ApiResponse({ status: 200, description: 'Poste bloque' })
  async blockPoste(
    @Param('posteId') posteId: string,
  ): Promise<{ success: boolean }> {
    await this.queueService.blockPoste(posteId);
    this.gateway.emitQueueUpdatePublic('admin_block');
    return { success: true };
  }

  @Post('unblock/:posteId')
  @ApiOperation({ summary: 'Debloquer un poste de la queue' })
  @ApiResponse({ status: 200, description: 'Poste debloque' })
  async unblockPoste(
    @Param('posteId') posteId: string,
  ): Promise<{ success: boolean }> {
    await this.queueService.unblockPoste(posteId);
    this.gateway.emitQueueUpdatePublic('admin_unblock');
    return { success: true };
  }

  @Post('dispatch/redispatch-all')
  @ApiOperation({ summary: 'Redispatcher manuellement toutes les conversations en attente' })
  @ApiResponse({ status: 200, description: 'Conversations redispatchées' })
  async redispatchAll(): Promise<{ dispatched: number; still_waiting: number }> {
    return this.dispatcherService.redispatchWaiting();
  }

  @Post('dispatch/reset-stuck')
  @ApiOperation({ summary: 'Remet en EN_ATTENTE les conversations ACTIF dont l\'agent est hors ligne' })
  @ApiResponse({ status: 200, description: 'Conversations réinitialisées' })
  async resetStuck(): Promise<{ reset: number }> {
    return this.dispatcherService.resetStuckActiveToWaiting();
  }

  @Get('dispatch')
  @ApiOperation({ summary: 'Snapshot dispatch (queue + en attente)' })
  @ApiResponse({ status: 200, description: 'Snapshot dispatch recupere' })
  async getDispatchSnapshot(): Promise<{
    queue_size: number;
    waiting_count: number;
    waiting_items: unknown[];
  }> {
    return this.dispatcherService.getDispatchSnapshot();
  }

  @Get('dispatch/settings')
  @ApiOperation({ summary: 'Recupere les parametres dispatch' })
  @ApiResponse({ status: 200, description: 'Parametres dispatch' })
  async getDispatchSettings(): Promise<DispatchSettings> {
    return this.dispatchSettingsService.getSettings();
  }

  @Post('dispatch/settings')
  @ApiOperation({ summary: 'Met a jour les parametres dispatch' })
  @ApiResponse({ status: 200, description: 'Parametres dispatch mis a jour' })
  async updateDispatchSettings(
    @Body() payload: UpdateDispatchSettingsDto,
  ): Promise<DispatchSettings> {
    return this.dispatchSettingsService.updateSettings(payload);
  }

  @Post('dispatch/settings/reset')
  @ApiOperation({ summary: 'Reset parametres dispatch' })
  @ApiResponse({ status: 200, description: 'Parametres dispatch reset' })
  async resetDispatchSettings(): Promise<DispatchSettings> {
    return this.dispatchSettingsService.resetDefaults();
  }

  @Get('dispatch/settings/audit')
  @ApiOperation({ summary: 'Historique parametres dispatch' })
  @ApiResponse({ status: 200, description: 'Historique dispatch' })
  async getDispatchSettingsAudit(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('reset_only') resetOnly?: string,
    @Query('q') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<unknown[]> {
    const parsed = limit ? Number(limit) : 50;
    const parsedOffset = offset ? Number(offset) : 0;
    const resetFlag = resetOnly === 'true';
    return this.dispatchSettingsService.getAudit(
      Number.isFinite(parsed) ? parsed : 50,
      Number.isFinite(parsedOffset) ? parsedOffset : 0,
      resetFlag,
      search,
      from,
      to,
    );
  }

  @Get('dispatch/settings/audit/page')
  @ApiOperation({ summary: 'Historique dispatch (page/limit)' })
  @ApiResponse({ status: 200, description: 'Historique dispatch pagine' })
  async getDispatchSettingsAuditPage(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('reset_only') resetOnly?: string,
    @Query('q') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ data: unknown[]; total: number }> {
    const parsedPage = page ? Number(page) : 1;
    const parsedLimit = limit ? Number(limit) : 50;
    const resetFlag = resetOnly === 'true';
    return this.dispatchSettingsService.getAuditPage(
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedLimit) ? parsedLimit : 50,
      resetFlag,
      search,
      from,
      to,
    );
  }
}
