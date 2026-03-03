import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronConfig } from './entities/cron-config.entity';
import { CronConfigService } from './cron-config.service';
import { CronConfigController } from './cron-config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CronConfig]),
  ],
  controllers: [CronConfigController],
  providers: [CronConfigService],
  exports: [CronConfigService],
})
export class JorbsModule {}
