import { Module } from '@nestjs/common';
import { GicopPlatformService } from './gicop-platform.service';
import { GicopPlatformController } from './gicop-platform.controller';

@Module({
  controllers: [GicopPlatformController],
  providers:   [GicopPlatformService],
  exports:     [GicopPlatformService],
})
export class GicopPlatformModule {}
