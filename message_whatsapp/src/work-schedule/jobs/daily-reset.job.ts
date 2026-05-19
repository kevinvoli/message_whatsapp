import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { GroupScheduleService } from 'src/commercial-group/group-schedule.service';
import { CommercialPlanningService } from 'src/commercial-group/commercial-planning.service';

@Injectable()
export class DailyResetJob {
  private readonly logger = new Logger(DailyResetJob.name);

  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    private readonly groupScheduleService: GroupScheduleService,
    private readonly planningService: CommercialPlanningService,
  ) {}

  @Cron('0 0 * * *', { timeZone: process.env['TZ'] ?? 'Africa/Douala' })
  async resetWorkingToday(): Promise<void> {
    const workingGroupIds = await this.groupScheduleService.getTodayWorkingGroupIds();

    if (workingGroupIds.length > 0) {
      const activated = await this.commercialRepo
        .createQueryBuilder()
        .update()
        .set({ isWorkingToday: true, workingTodaySince: () => 'NOW()' })
        .where('group_id IN (:...ids)', { ids: workingGroupIds })
        .andWhere('deleted_at IS NULL')
        .execute();
      this.logger.log('resetWorkingToday: ' + (activated.affected ?? 0) + ' commercial(s) activés');

      const deactivated = await this.commercialRepo
        .createQueryBuilder()
        .update()
        .set({ isWorkingToday: false, workingTodaySince: null })
        .where('(group_id NOT IN (:...ids) OR group_id IS NULL)', { ids: workingGroupIds })
        .andWhere('deleted_at IS NULL')
        .execute();
      this.logger.log('resetWorkingToday: ' + (deactivated.affected ?? 0) + ' commercial(s) désactivés');
    } else {
      const result = await this.commercialRepo
        .createQueryBuilder()
        .update()
        .set({ isWorkingToday: false, workingTodaySince: null })
        .where('deleted_at IS NULL')
        .execute();
      this.logger.log('resetWorkingToday: aucun groupe actif - ' + (result.affected ?? 0) + ' commercial(s) remis à absent');
    }

    // Étape 4 — Absences → forcer is_working_today = false
    const absenceIds = await this.planningService.getTodayAbsenceIds();
    if (absenceIds.length > 0) {
      const forcedAbsent = await this.commercialRepo
        .createQueryBuilder()
        .update()
        .set({ isWorkingToday: false, workingTodaySince: null })
        .whereInIds(absenceIds)
        .execute();
      this.logger.log('resetWorkingToday: ' + (forcedAbsent.affected ?? 0) + ' commercial(s) forcés absents (override)');
    }

    // Étape 5 — Exceptionnels → forcer is_working_today = true
    const exceptionalIds = await this.planningService.getTodayExceptionalIds();
    if (exceptionalIds.length > 0) {
      const forcedActive = await this.commercialRepo
        .createQueryBuilder()
        .update()
        .set({ isWorkingToday: true, workingTodaySince: () => 'NOW()' })
        .whereInIds(exceptionalIds)
        .execute();
      this.logger.log('resetWorkingToday: ' + (forcedActive.affected ?? 0) + ' commercial(s) forcés actifs (override)');
    }
  }
}
