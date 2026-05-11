import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from 'src/contact/entities/contact.entity';
import { ErpClientSyncService } from './erp-client-sync.service';
import { OrderCallSyncModule } from 'src/order-call-sync/order-call-sync.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact]),
    OrderCallSyncModule,
  ],
  providers: [ErpClientSyncService],
})
export class ErpClientSyncModule {}
