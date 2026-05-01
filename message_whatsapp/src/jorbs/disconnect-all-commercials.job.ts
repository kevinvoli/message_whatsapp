import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronConfigService } from './cron-config.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class DisconnectAllCommercialsJob implements OnModuleInit {
  private readonly logger = new Logger(DisconnectAllCommercialsJob.name);

  constructor(
    private readonly cronConfigService: CronConfigService,
    private readonly gateway: WhatsappMessageGateway,
    private readonly connectionLogService: ConnectionLogService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('disconnect-all', () => this.run());
  }

  async run(): Promise<string> {
    // Récupérer les IDs des commerciaux actuellement connectés avant la déconnexion
    const connectedCommerciaux = await this.commercialRepository.find({
      where: { isConnected: true },
      select: ['id'],
    });

    const count = await this.gateway.disconnectAllAgents();

    // Loguer le logout pour chaque commercial connecté
    if (connectedCommerciaux.length > 0) {
      await Promise.allSettled(
        connectedCommerciaux.map((c) =>
          this.connectionLogService.logLogout(c.id, 'commercial'),
        ),
      );
    }

    this.logger.log(
      `Fin de journée : ${count} commercial(aux) déconnecté(s), ${connectedCommerciaux.length} logout(s) loggés`,
    );
    return `${count} commercial(aux) déconnecté(s)`;
  }
}
