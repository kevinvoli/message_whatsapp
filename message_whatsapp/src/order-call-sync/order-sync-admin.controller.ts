import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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

  @Post('sync-commercial-mapping')
  @ApiOperation({ summary: 'Synchronise commercial_identity_mapping depuis DB2 (admin)' })
  async syncCommercialMapping() {
    return this.callSync.syncCommercialMapping();
  }

  @Post('sync-client-mapping')
  @ApiOperation({ summary: 'Synchronise client_identity_mapping (Contact DB1 ↔ GicopUser DB2) (admin)' })
  async syncClientMapping() {
    return this.callSync.syncClientMapping();
  }

  @Post('sync-calls')
  @ApiOperation({ summary: 'Déclenche manuellement la synchronisation des appels DB2 (admin)' })
  async syncCalls() {
    return this.callSync.syncNewCalls();
  }

  @Post('retry-obligations')
  @ApiOperation({ summary: 'Retente le matching obligations pour les appels historiques non validés (admin)' })
  async retryObligations() {
    return this.callSync.retryUnmatchedObligations();
  }
  @Post('clean-orphans')
  @ApiOperation({ summary: 'Supprime les mappings orphelins (contact/commercial supprimés de DB1) (admin)' })
  async cleanOrphans() {
    return this.callSync.cleanOrphanMappings();
  }

}
