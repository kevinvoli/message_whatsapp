import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllowedLocation } from './entities/allowed_location.entity';
import { WhatsappPoste } from '../whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { GeoAccessService } from './geo_access.service';
import { GeoAccessController } from './geo_access.controller';
import { IpAccessGuard } from './ip-access.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AllowedLocation, WhatsappPoste, WhatsappCommercial])],
  providers: [GeoAccessService, IpAccessGuard],
  controllers: [GeoAccessController],
  exports: [GeoAccessService, IpAccessGuard],
})
export class GeoAccessModule {}
