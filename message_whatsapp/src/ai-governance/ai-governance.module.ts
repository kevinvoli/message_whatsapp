import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModuleConfig } from './entities/ai-module-config.entity';
import { AiExecutionLog } from './entities/ai-execution-log.entity';
import { AiGovernanceService } from './ai-governance.service';
import { AiGovernanceController } from './ai-governance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiModuleConfig, AiExecutionLog])],
  providers: [AiGovernanceService],
  controllers: [AiGovernanceController],
  exports: [AiGovernanceService],
})
export class AiGovernanceModule {}
