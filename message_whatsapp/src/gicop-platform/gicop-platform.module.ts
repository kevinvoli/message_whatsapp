import { Module } from '@nestjs/common';
import { GicopPlatformService } from './gicop-platform.service';

@Module({
  providers: [GicopPlatformService],
  exports:   [GicopPlatformService],
})
export class GicopPlatformModule {}
