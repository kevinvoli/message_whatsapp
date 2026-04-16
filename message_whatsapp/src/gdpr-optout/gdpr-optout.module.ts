import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GdprOptout } from './entities/gdpr-optout.entity';
import { GdprOptoutService } from './gdpr-optout.service';
import {
  GdprOptoutAdminController,
  GdprOptoutAgentController,
} from './gdpr-optout.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GdprOptout])],
  controllers: [GdprOptoutAdminController, GdprOptoutAgentController],
  providers: [GdprOptoutService],
  exports: [GdprOptoutService],
})
export class GdprOptoutModule {}
