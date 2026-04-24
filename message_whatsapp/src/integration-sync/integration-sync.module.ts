import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationSyncLog } from './entities/integration-sync-log.entity';
import { IntegrationSyncLogService } from './integration-sync-log.service';

@Module({
  imports:   [TypeOrmModule.forFeature([IntegrationSyncLog])],
  providers: [IntegrationSyncLogService],
  exports:   [IntegrationSyncLogService],
})
export class IntegrationSyncModule {}
