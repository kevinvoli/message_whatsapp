import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, In, LessThan, Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { NotificationService } from 'src/notification/notification.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MissedCallEvent } from './entities/missed-call-event.entity';
import { CommercialActionTask } from 'src/action-queue/entities/commercial-action-task.entity';

const DEFAULT_SLA_MINUTES = 30;
const DEFAULT_AUTO_CLOSE_HOURS = 24;

@Injectable()
export class MissedCallSlaJob implements OnModuleInit {
  private readonly logger = new Logger(MissedCallSlaJob.name);

  constructor(
    @InjectRepository(MissedCallEvent)
    private readonly missedCallRepo: Repository<MissedCallEvent>,

    @InjectRepository(CommercialActionTask)
    private readonly taskRepo: Repository<CommercialActionTask>,

    private readonly cronConfigService: CronConfigService,
    private readonly notificationService: NotificationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('missed-call-sla', () => this.run());
  }

  async run(): Promise<string> {
    let escalated = 0;
    let closed = 0;

    // US3.1 + US3.2 : SLA breach detection and escalation
    escalated = await this.checkSlaBreaches();

    // US3.3 : Auto-close after 24h without action
    closed = await this.autoCloseOldEvents();

    const msg = `MissedCallSlaJob — ${escalated} escalade(s), ${closed} fermeture(s) auto`;
    this.logger.log(msg);
    return msg;
  }

  // US3.1 : Find assigned events whose task dueAt has passed

  private async checkSlaBreaches(): Promise<number> {
    const overdue = await this.missedCallRepo.find({
      where: {
        status: 'assigned',
        slaBreachedAt: IsNull(),
      },
    });

    if (overdue.length === 0) return 0;

    let count = 0;
    const now = new Date();

    for (const mc of overdue) {
      try {
        const task = mc.callbackTaskId
          ? await this.taskRepo.findOne({ where: { id: mc.callbackTaskId } })
          : null;

        const isBreach =
          (task && task.dueAt && task.dueAt < now && task.status === 'pending') ||
          (!task &&
            mc.occurredAt < new Date(now.getTime() - DEFAULT_SLA_MINUTES * 60_000));

        if (!isBreach) continue;

        await this.missedCallRepo.update(mc.id, {
          slaBreachedAt: now,
          escalatedAt: now,
          status: 'escalated',
        });

        await this.escalate(mc);
        count++;
      } catch (err) {
        this.logger.error(
          `SLA_BREACH_ERROR missedId=${mc.id}: ${(err as Error).message}`,
        );
      }
    }

    return count;
  }

  // US3.2 : Emit event + notify supervisors

  private async escalate(mc: MissedCallEvent): Promise<void> {
    this.eventEmitter.emit('missed_call.sla_breached', {
      missedCallId: mc.id,
      clientPhone: mc.clientPhone,
      clientName: mc.clientName,
      posteId: mc.posteId,
      commercialId: mc.commercialId,
      occurredAt: mc.occurredAt,
      slaBreachedAt: new Date(),
    });

    const delay = mc.occurredAt
      ? Math.round((Date.now() - mc.occurredAt.getTime()) / 60_000)
      : null;

    const delayStr = delay !== null ? ` (${delay} min sans rappel)` : '';

    await this.notificationService
      .create(
        'alert',
        'Appel en absence — SLA dépassé',
        `Client ${mc.clientName ?? mc.clientPhone} n'a pas ete rappele dans le delai imparti${delayStr}. Poste : ${mc.posteId ?? 'inconnu'}.`,
      )
      .catch((err: Error) =>
        this.logger.warn(
          `ESCALATION_NOTIFY_FAILED missedId=${mc.id}: ${err.message}`,
        ),
      );

    this.logger.warn(
      `MISSED_CALL_ESCALATED id=${mc.id} phone=${mc.clientPhone} posteId=${mc.posteId ?? 'none'}`,
    );
  }

  // US3.3 : Auto-close events pending/assigned/escalated for > 24h

  private async autoCloseOldEvents(): Promise<number> {
    const cutoff = new Date(
      Date.now() - DEFAULT_AUTO_CLOSE_HOURS * 60 * 60_000,
    );

    const stale = await this.missedCallRepo.find({
      where: [
        { status: 'pending',   occurredAt: LessThan(cutoff) },
        { status: 'assigned',  occurredAt: LessThan(cutoff) },
        { status: 'escalated', occurredAt: LessThan(cutoff) },
      ],
    });

    if (stale.length === 0) return 0;

    let count = 0;
    for (const mc of stale) {
      try {
        await this.missedCallRepo.update(mc.id, { status: 'closed' });

        if (mc.callbackTaskId) {
          await this.taskRepo.update(
            { id: mc.callbackTaskId, status: In(['pending', 'in_progress']) },
            { status: 'skipped' },
          );
        }

        this.logger.log(
          `MISSED_CALL_AUTO_CLOSED id=${mc.id} phone=${mc.clientPhone} reason=no_action_${DEFAULT_AUTO_CLOSE_HOURS}h`,
        );
        count++;
      } catch (err) {
        this.logger.error(
          `AUTO_CLOSE_ERROR missedId=${mc.id}: ${(err as Error).message}`,
        );
      }
    }

    return count;
  }
}
