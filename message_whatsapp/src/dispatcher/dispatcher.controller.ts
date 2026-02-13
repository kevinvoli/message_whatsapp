import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/auth/admin.guard';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { QueuePosition } from './entities/queue-position.entity';

@ApiTags('Queue')
@Controller('queue')
@UseGuards(AdminGuard)
export class DispatcherController {
  constructor(
    private readonly queueService: QueueService,
    private readonly gateway: WhatsappMessageGateway,
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
}
