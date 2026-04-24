import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderCallSyncCursor } from './entities/order-call-sync-cursor.entity';
import { OrderCallSyncService } from './order-call-sync.service';
import { OrderCallSyncJob } from './order-call-sync.job';
import { OrderSyncAdminController } from './order-sync-admin.controller';
import { IntegrationSyncModule } from 'src/integration-sync/integration-sync.module';
import { CallObligationModule } from 'src/call-obligations/call-obligation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderCallSyncCursor]),
    IntegrationSyncModule,
    CallObligationModule,
  ],
  controllers: [OrderSyncAdminController],
  providers: [OrderCallSyncService, OrderCallSyncJob],
  exports:   [OrderCallSyncService],
})
export class OrderCallSyncModule {}
