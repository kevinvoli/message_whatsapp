import { Injectable, OnModuleInit } from '@nestjs/common';
import { CronConfigService } from './cron-config.service';
import { AgentConnectionService } from 'src/realtime/connections/agent-connection.service';

@Injectable()
export class DisconnectAllCommercialsJob implements OnModuleInit {
  constructor(
    private readonly cronConfigService: CronConfigService,
    private readonly agentConnectionService: AgentConnectionService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('disconnect-all', () => this.run());
  }

  async run(): Promise<string> {
    const count = await this.agentConnectionService.disconnectAllAgents();
    return `${count} commercial(aux) déconnecté(s)`;
  }
}
