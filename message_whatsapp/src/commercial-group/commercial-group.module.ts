import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialGroup } from './entities/commercial-group.entity';
import { CommercialGroupService } from './commercial-group.service';
import { CommercialGroupController } from './commercial-group.controller';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CommercialGroup, WhatsappCommercial])],
  controllers: [CommercialGroupController],
  providers: [CommercialGroupService],
  exports: [CommercialGroupService],
})
export class CommercialGroupModule {}
