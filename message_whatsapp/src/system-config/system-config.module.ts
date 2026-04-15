import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { SystemConfigService } from './system-config.service';
import { SystemConfigController } from './system-config.controller';
import { ChannelModule } from 'src/channel/channel.module';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig]), forwardRef(() => ChannelModule)],
  controllers: [SystemConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
