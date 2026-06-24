import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CronConfigService } from './cron-config.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { DispatchSettings } from 'src/dispatcher/entities/dispatch-settings.entity';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';

@Injectable()
export class IdleDisconnectJob implements OnModuleInit {
  private readonly logger = new Logger(IdleDisconnectJob.name);

  constructor(
    private readonly cronConfigService: CronConfigService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    @InjectRepository(DispatchSettings)
    private readonly settingsRepository: Repository<DispatchSettings>,
    private readonly queueService: QueueService,
    private readonly gateway: WhatsappMessageGateway,
    private readonly connectionLogService: ConnectionLogService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('idle-disconnect', () => this.run());
  }

  async run(): Promise<string> {
    const settings = await this.settingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    const enabled = settings?.idleDisconnectEnabled ?? true;
    const minutes = settings?.idleDisconnectMinutes ?? 15;

    if (!enabled) {
      return 'Désactivé';
    }

    const threshold = new Date(Date.now() - minutes * 60_000);

    const idleCommercials = await this.commercialRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.poste', 'poste')
      .where('c.isConnected = :connected', { connected: true })
      .andWhere(
        '(c.lastActivityAt IS NULL OR c.lastActivityAt < :threshold)',
        { threshold },
      )
      // Ne jamais déconnecter un commercial sur poste dédié (canal WhapiChannel.poste_id IS NOT NULL)
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM whapi_channels ch
          WHERE ch.poste_id = poste.id
        )`,
      )
      .andWhere('c.bypassRestrictions = :bypassFalse', { bypassFalse: false })
      .andWhere(
        '(poste.id IS NULL OR poste.bypassRestrictions = :bypassFalse)',
        { bypassFalse: false },
      )
      .getMany();

    if (idleCommercials.length === 0) {
      return '0 commercial(aux) déconnecté(s)';
    }

    let disconnectedCount = 0;
    for (const commercial of idleCommercials) {
      try {
        if (commercial.poste?.id) {
          await this.queueService.removeFromQueue(commercial.poste.id);
        }
        commercial.isConnected = false;
        await this.commercialRepository.save(commercial);
        await this.connectionLogService.logLogout(commercial.id, 'commercial');
        await this.commercialRepository.increment({ id: commercial.id }, 'tokenVersion', 1);
        this.gateway.server.emit('commercial:force-disconnect', {
          commercialId: commercial.id,
        });
        disconnectedCount++;
        this.logger.log(
          `Idle disconnect: commercial=${commercial.id} poste=${commercial.poste?.id ?? 'none'}`,
        );
      } catch (err) {
        this.logger.warn(
          `Idle disconnect failed for commercial=${commercial.id}: ${String(err)}`,
        );
      }
    }

    return `${disconnectedCount} commercial(aux) déconnecté(s)`;
  }
}
