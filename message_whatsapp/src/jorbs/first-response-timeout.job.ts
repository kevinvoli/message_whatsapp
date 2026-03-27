import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Repository } from 'typeorm';
import { CronConfigService } from './cron-config.service';

@Injectable()
export class FirstResponseTimeoutJob implements OnModuleInit {
  private readonly logger = new Logger(FirstResponseTimeoutJob.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly cronConfigService: CronConfigService,
  ) {}

  onModuleInit(): void {
    // Le handler utilise jobRunnerAllPostes() — indépendant de l'état socket
    this.cronConfigService.registerHandler('sla-checker', () =>
      this.dispatcher.jobRunnerAllPostes(),
    );
  }

  /** Appelé par la gateway à la connexion d'un agent : check immédiat pour ce poste. */
  async startAgentSlaMonitor(posteId: string): Promise<void> {
    this.logger.debug(`SLA immediate check on agent connect (poste ${posteId})`);
    try {
      await this.dispatcher.jobRunnertcheque(posteId);
    } catch (error) {
      this.logger.warn(`SLA immediate check error (${posteId}): ${String(error)}`);
    }
  }

  /** Appelé par la gateway à la déconnexion d'un agent (hook de nettoyage si besoin). */
  stopAgentSlaMonitor(posteId: string): void {
    this.logger.debug(`Agent disconnected, SLA monitor stopped (poste ${posteId})`);
  }
}
