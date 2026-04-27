import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationOutbox } from './entities/integration-outbox.entity';
import { IntegrationOutboxService } from './integration-outbox.service';
import { OutboxAdminController } from './outbox-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IntegrationOutbox])],
  controllers: [OutboxAdminController],
  providers: [IntegrationOutboxService],
  exports: [IntegrationOutboxService],
})
export class IntegrationOutboxModule {}
