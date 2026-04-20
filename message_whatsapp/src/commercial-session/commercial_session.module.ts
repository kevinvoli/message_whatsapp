import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialSession } from './entities/commercial_session.entity';
import { CommercialSessionService } from './commercial_session.service';
import { CommercialSessionController } from './commercial_session.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CommercialSession])],
  providers: [CommercialSessionService],
  controllers: [CommercialSessionController],
  exports: [CommercialSessionService],
})
export class CommercialSessionModule {}
