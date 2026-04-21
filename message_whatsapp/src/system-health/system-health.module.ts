import { Module } from '@nestjs/common';
import { SystemHealthController } from './system-health.controller';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [SystemHealthController],
})
export class SystemHealthModule {}
