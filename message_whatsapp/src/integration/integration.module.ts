import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientIdentityMapping } from './entities/client-identity-mapping.entity';
import { CommercialIdentityMapping } from './entities/commercial-identity-mapping.entity';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { IntegrationListener } from './integration.listener';

@Module({
  imports: [TypeOrmModule.forFeature([ClientIdentityMapping, CommercialIdentityMapping])],
  controllers: [IntegrationController],
  providers: [IntegrationService, IntegrationListener],
  exports: [IntegrationService],
})
export class IntegrationModule {}
