import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientIdentityMapping } from './entities/client-identity-mapping.entity';
import { CommercialIdentityMapping } from './entities/commercial-identity-mapping.entity';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ClientIdentityMapping, CommercialIdentityMapping])],
  controllers: [IntegrationController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
