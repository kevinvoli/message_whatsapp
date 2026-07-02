import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Logger,
  Query,
  Req,
} from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp_commercial.service';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp_commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp_commercial.dto';
import { AdminGuard } from '../auth/admin.guard';
import { CommercialStatsService } from './commercial-stats.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AuditLog } from '../admin-audit/audit-log.decorator';

interface DisconnectCommercialResponse {
  disconnected: boolean;
  message: string;
}

@Controller('users')
@UseGuards(AdminGuard)
export class WhatsappCommercialController {
  private readonly logger = new Logger(WhatsappCommercialController.name);

  constructor(
    private readonly whatsappCommercialService: WhatsappCommercialService,
    private readonly commercialStatsService: CommercialStatsService,
    private readonly gateway: WhatsappMessageGateway,
    private readonly connectionLogService: ConnectionLogService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Post()
  async create(
    @Body() createWhatsappCommercialDto: CreateWhatsappCommercialDto,
  ) {
    return await this.whatsappCommercialService.create(
      createWhatsappCommercialDto,
    );
  }

  @Get()
  async findAll() {
    return await this.whatsappCommercialService.getCommercialsDashboard();
  }

  @Get(':id/stats')
  async getStats(
    @Param('id') id: string,
    @Query('periode') periode = 'today',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.commercialStatsService.getStats(id, periode, dateFrom, dateTo);
  }

  @Post(':id/disconnect')
  async disconnectCommercial(
    @Param('id') id: string,
  ): Promise<DisconnectCommercialResponse> {
    await this.whatsappCommercialService.findOne(id);

    const count = await this.gateway.disconnectAgentByCommercialId(id);
    await this.whatsappCommercialService.incrementTokenVersion(id);

    if (count === 0) {
      await this.whatsappCommercialService.updateStatus(id, false);
      await this.connectionLogService.logLogout(id, 'commercial');
    }

    this.logger.log(`Admin forced disconnect commercial ${id}: ${count} socket(s)`);

    return count > 0
      ? { disconnected: true, message: 'Commercial déconnecté.' }
      : { disconnected: false, message: "Le commercial n'était pas connecté." };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    this.logger.debug(`Get user ${id}`);
    return await this.whatsappCommercialService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateWhatsappCommercialDto: UpdateWhatsappCommercialDto,
  ) {
    this.logger.debug(`Update user ${id}`);
    return await this.whatsappCommercialService.update(
      id,
      updateWhatsappCommercialDto,
    );
  }

  @Delete(':id')
  @AuditLog({
    action: 'DELETE_COMMERCIAL',
    targetEntity: 'WhatsappCommercial',
    targetIdExtractor: (args) => (typeof args[0] === 'string' ? args[0] : null),
  })
  async remove(
    @Param('id') id: string,
    @Req() _req: { user: { userId: string } },
  ) {
    return await this.whatsappCommercialService.remove(id);
  }
}
