import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallDevice } from './entities/call-device.entity';
import { CallDeviceService } from './call-device.service';
import { CallDeviceController } from './call-device.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CallDevice])],
  controllers: [CallDeviceController],
  providers:   [CallDeviceService],
  exports:     [CallDeviceService, TypeOrmModule],
})
export class CallDeviceModule {}
