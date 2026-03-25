import { Global, Module } from '@nestjs/common';
import { AgentStateService } from './agent-state.service';

@Global()
@Module({
  providers: [AgentStateService],
  exports: [AgentStateService],
})
export class AgentStateModule {}
