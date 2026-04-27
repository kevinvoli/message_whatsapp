import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { CommercialDailyPerformance } from './entities/commercial-daily-performance.entity';
import { TargetsService } from './targets.service';

@Injectable()
export class CommercialDailySnapshotService {
  private readonly logger = new Logger(CommercialDailySnapshotService.name);

  constructor(
    @InjectRepository(CommercialDailyPerformance)
    private readonly snapshotRepo: Repository<CommercialDailyPerformance>,
    private readonly targetsService: TargetsService,
  ) {}

  /** Snapshot quotidien automatique à 23h55. */
  @Cron('55 23 * * *')
  async computeDailySnapshot(): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    await this.computeForDate(date);
  }

  /** Recalcul forcé pour une date donnée (YYYY-MM-DD). */
  async computeForDate(date: string): Promise<void> {
    this.logger.log(`Calcul snapshot commercial pour ${date}…`);
    try {
      const entries = await this.targetsService.getRanking('today');
      const now = new Date();

      for (const entry of entries) {
        await this.snapshotRepo.upsert(
          {
            commercialId:     entry.commercial_id,
            commercialName:   entry.commercial_name,
            snapshotDate:     date,
            messagesSent:     entry.messages_sent,
            conversations:    entry.conversations,
            calls:            entry.calls,
            followUpsDone:    entry.follow_ups,
            reportsSubmitted: 0,
            orders:           entry.orders,
            score:            entry.score,
            rankGlobal:       entry.rank,
            computedAt:       now,
          },
          { conflictPaths: ['commercialId', 'snapshotDate'] },
        );
      }
      this.logger.log(`Snapshot ${date} : ${entries.length} commercial(aux) enregistré(s)`);
    } catch (err) {
      this.logger.error(`Erreur snapshot commercial ${date}: ${(err as Error).message}`);
    }
  }

  /** Historique d'un commercial sur N jours. */
  async getHistory(commercialId: string, days = 30): Promise<CommercialDailyPerformance[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.commercialId = :id', { id: commercialId })
      .andWhere('s.snapshotDate >= :cutoff', { cutoff: cutoffStr })
      .orderBy('s.snapshotDate', 'DESC')
      .getMany();
  }

  /** Classement historique pour une date donnée. */
  async getRankingForDate(date: string): Promise<CommercialDailyPerformance[]> {
    return this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.snapshotDate = :date', { date })
      .orderBy('s.rankGlobal', 'ASC')
      .getMany();
  }
}
