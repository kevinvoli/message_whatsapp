import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderSegmentationReadService } from './services/order-segmentation-read.service';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientIdentityMapping, CommercialIdentityMapping]),
  ],
  providers: [OrderSegmentationReadService],
  exports:   [OrderSegmentationReadService],
})
export class OrderReadModule {}
