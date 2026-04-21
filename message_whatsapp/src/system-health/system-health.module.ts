import { Module } from '@nestjs/common';
import { SystemHealthController } from './system-health.controller';

@Module({
  imports: [],
  controllers: [SystemHealthController],
})
export class SystemHealthModule {}
