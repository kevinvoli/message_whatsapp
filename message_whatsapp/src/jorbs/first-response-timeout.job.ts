import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Repository } from 'typeorm';

@Injectable()
export class FirstResponseTimeoutJob {
  private readonly logger = new Logger(FirstResponseTimeoutJob.name);
  // âœ… DÃ‰CLARATION OBLIGATOIRE
  private readonly agentSlaIntervals = new Map<string, NodeJS.Timeout>();
  private readonly activePostes = new Set<string>();
  private readonly autoMessageIntervals = new Map<string, NodeJS.Timeout>();
  private currentIntervalMinutes = 5;

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly messageAutoService: MessageAutoService,
  ) {}

  async startAgentSlaMonitor(posteId: string, intervalMinutes?: number) {
    if (this.agentSlaIntervals.has(posteId)) return;
    this.activePostes.add(posteId);

    const resolvedMinutes =
      typeof intervalMinutes === 'number'
        ? intervalMinutes
        : this.currentIntervalMinutes;
    const intervalMs = Math.max(1, resolvedMinutes) * 60 * 1000;

    const interval = setInterval(() => {
      // âœ… encapsulation propre de lâ€™async
      this.logger.debug(`SLA runner tick (${posteId})`);

      void (async () => {
        try {
          await this.dispatcher.jobRunnertcheque(posteId);
        } catch (error) {
          this.logger.warn(
            `SLA runner error (${posteId}): ${String(error)}`,
          );
        }
      })();
    }, intervalMs);

    this.agentSlaIntervals.set(posteId, interval);
  }
  stopAgentSlaMonitor(agentId: string) {
    const interval = this.agentSlaIntervals.get(agentId);

    if (interval) {
      clearInterval(interval);
      this.agentSlaIntervals.delete(agentId);
    }
    this.activePostes.delete(agentId);
  }

  async refreshSlaIntervals(intervalMinutes: number): Promise<void> {
    this.currentIntervalMinutes = intervalMinutes;
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

    for (const posteId of this.activePostes) {
      const existing = this.agentSlaIntervals.get(posteId);
      if (existing) {
        clearInterval(existing);
        this.agentSlaIntervals.delete(posteId);
      }
      const interval = setInterval(() => {
        this.logger.debug(`SLA runner tick (${posteId})`);
        void (async () => {
          try {
            await this.dispatcher.jobRunnertcheque(posteId);
          } catch (error) {
            this.logger.warn(
              `SLA runner error (${posteId}): ${String(error)}`,
            );
          }
        })();
      }, intervalMs);
      this.agentSlaIntervals.set(posteId, interval);
    }
  }

  testAutoMessage(chatId: string, position: number) {
  if (this.autoMessageIntervals.has(chatId)) return;

  // Marquer que le message a Ã©tÃ© envoyÃ© pour ne pas rÃ©exÃ©cuter
  // this.autoMessageIntervals.set(chatId, true)

  // console.log('Envoi dâ€™un seul message', chatId);

  // void this.messageAutoService.sendAutoMessage(chatId, position);
}
  // testAutoMessage(chatId: string, position: number) {
  //   if (this.autoMessageIntervals.has(chatId)) return;
  //   const interval = setInterval(() => {
  //     console.log(
  //       Math.floor(Math.random() * 10),
  //       chatId,
  //       this.autoMessageIntervals.has(chatId),
  //     );

  //     void this.messageAutoService.sendAutoMessage(chatId, position);
  //   }, 60_00);
  //   this.autoMessageIntervals.set(chatId, interval);
  // }

  // stopAutoMessage(chatId: string) {
  //   const interval = this.autoMessageIntervals.get(chatId);
  //   if (!interval) return;

  //   clearInterval(interval);
  //   this.autoMessageIntervals.delete(chatId);

  //   console.log('ðŸ›‘ auto message arrÃªtÃ©', chatId);
  // }
}

