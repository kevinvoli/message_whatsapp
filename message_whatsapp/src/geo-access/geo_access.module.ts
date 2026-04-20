import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllowedLocation } from './entities/allowed_location.entity';
import { GeoAccessService } from './geo_access.service';
import { GeoAccessController } from './geo_access.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AllowedLocation])],
  providers: [GeoAccessService],
  controllers: [GeoAccessController],
  exports: [GeoAccessService],
})
export class GeoAccessModule {}
