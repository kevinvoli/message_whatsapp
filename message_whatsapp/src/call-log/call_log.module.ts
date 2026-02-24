import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallLog } from './entities/call_log.entity';
import { CallLogService } from './call_log.service';
import { CallLogController } from './call_log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CallLog])],
  controllers: [CallLogController],
  providers: [CallLogService],
  exports: [CallLogService],
})
export class CallLogModule {}
