import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CannedResponse } from './entities/canned-response.entity';
import { CannedResponseService } from './canned-response.service';
import {
  CannedResponseAdminController,
  CannedResponseAgentController,
} from './canned-response.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CannedResponse])],
  controllers: [CannedResponseAdminController, CannedResponseAgentController],
  providers: [CannedResponseService],
  exports: [CannedResponseService],
})
export class CannedResponseModule {}
