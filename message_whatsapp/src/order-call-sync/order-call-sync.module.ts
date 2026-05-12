import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderCallSyncCursor } from './entities/order-call-sync-cursor.entity';
import { OrderCallSyncService } from './order-call-sync.service';
import { OrderCallSyncJob } from './order-call-sync.job';
import { OrderSyncAdminController } from './order-sync-admin.controller';
import { IntegrationSyncModule } from 'src/integration-sync/integration-sync.module';
import { CallObligationModule } from 'src/call-obligations/call-obligation.module';
import { WindowModule } from 'src/window/window.module';
import { RedisModule } from 'src/redis/redis.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { CallDeviceModule } from 'src/call-device/call-device.module';
import { CallEventUnresolved } from './entities/call-event-unresolved.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { WorkScheduleModule } from 'src/work-schedule/work-schedule.module';
import { MissedCallModule } from 'src/missed-calls/missed-call.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderCallSyncCursor,
      WhatsappCommercial,
      CommercialIdentityMapping,
      ClientIdentityMapping,
      Contact,
      CallEventUnresolved,
      CallLog,
    ]),
    CallDeviceModule,
    IntegrationSyncModule,
    CallObligationModule,
    WindowModule,
    RedisModule,
    WorkScheduleModule,
    MissedCallModule,
  ],
  controllers: [OrderSyncAdminController],
  providers: [OrderCallSyncService, OrderCallSyncJob],
  exports:   [OrderCallSyncService],
})
export class OrderCallSyncModule {}
