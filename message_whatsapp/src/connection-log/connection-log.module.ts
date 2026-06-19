import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectionLog } from './entities/connection-log.entity';
import { ConnectionLogService } from './connection-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConnectionLog])],
  providers: [ConnectionLogService],
  exports: [ConnectionLogService, TypeOrmModule],
})
export class ConnectionLogModule {}
