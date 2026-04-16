import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { SystemAlertService } from 'src/system-alert/system-alert.service';
import { MetaAccountUpdateEvent, MetaEventContext } from './meta-event.interface';

/**
 * P4.1.4 — Handler événement Meta `account_update`.
 *
 * Si l'événement contient `restriction_info` → marquer le channel comme restreint.
 * Si `ban_info` → alerte critique.
 */
@Injectable()
export class AccountUpdateHandler {
  private readonly logger = new Logger(AccountUpdateHandler.name);

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    private readonly systemAlert: SystemAlertService,
  ) {}

  async handle(event: MetaAccountUpdateEvent, ctx: MetaEventContext): Promise<void> {
    this.logger.log(
      `META_ACCOUNT_UPDATE tenant=${ctx.tenantId} channel=${ctx.channelId} event=${event.event ?? 'unknown'}`,
    );

    if (event.ban_info) {
      await this.systemAlert.onSecurityEvent({
        source: 'meta_account_update',
        tenantId: ctx.tenantId,
        channelId: ctx.channelId,
        message: `Compte Meta banni — état: ${event.ban_info.waba_ban_state}`,
        severity: 'critical',
      });
    }

    if (event.restriction_info && event.restriction_info.length > 0) {
      this.logger.warn(
        `META channel ${ctx.channelId} restreint: ${JSON.stringify(event.restriction_info)}`,
      );
      await this.systemAlert.onSecurityEvent({
        source: 'meta_account_update',
        tenantId: ctx.tenantId,
        channelId: ctx.channelId,
        message: `Channel Meta restreint: ${event.restriction_info.map((r) => r.restriction_type).join(', ')}`,
        severity: 'high',
      });
    }
  }
}
