import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronConfigService } from './cron-config.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';

@Injectable()
export class DisconnectAllCommercialsJob implements OnModuleInit {
  private readonly logger = new Logger(DisconnectAllCommercialsJob.name);

  constructor(
    private readonly cronConfigService: CronConfigService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('disconnect-all', () => this.run());
  }

  async run(): Promise<string> {
    const count = await this.gateway.disconnectAllAgents();
    this.logger.log(`Fin de journée : ${count} commercial(aux) déconnecté(s)`);
    return `${count} commercial(aux) déconnecté(s)`;
  }
}
