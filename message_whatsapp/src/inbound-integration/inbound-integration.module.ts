import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from 'src/contact/entities/contact.entity';
import { InboundIntegrationService } from './inbound-integration.service';
import { InboundIntegrationController } from './inbound-integration.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contact])],
  controllers: [InboundIntegrationController],
  providers: [InboundIntegrationService],
  exports: [InboundIntegrationService],
})
export class InboundIntegrationModule {}
