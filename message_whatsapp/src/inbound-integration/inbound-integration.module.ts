import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from 'src/contact/entities/contact.entity';
import { InboundIntegrationService } from './inbound-integration.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact])],
  providers: [InboundIntegrationService],
  exports: [InboundIntegrationService],
})
export class InboundIntegrationModule {}
