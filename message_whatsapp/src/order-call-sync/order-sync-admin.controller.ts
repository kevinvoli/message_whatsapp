import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/auth/admin.guard';
import { OrderCallSyncService } from './order-call-sync.service';
import { IntegrationSyncLogService } from 'src/integration-sync/integration-sync-log.service';

@ApiTags('Order Sync Admin')
@Controller('admin/order-sync')
@UseGuards(AdminGuard)
export class OrderSyncAdminController {
  constructor(
    private readonly callSync: OrderCallSyncService,
    private readonly syncLog: IntegrationSyncLogService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Statut global des synchronisations DB2 (admin)' })
  async getStatus() {
    const [callStatus, logCounts] = await Promise.all([
      this.callSync.getStatus(),
      this.syncLog.countByStatus(),
    ]);

    return {
      db2:     callStatus,
      syncLog: logCounts,
    };
  }

  @Get('failed')
  @ApiOperation({ summary: 'Entrées du journal de sync en échec (admin)' })
  async getFailed() {
    return this.syncLog.findFailed(50);
  }
}
