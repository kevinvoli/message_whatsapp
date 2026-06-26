import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GroupScheduleService } from '../group-schedule.service';

@Injectable()
export class CalendarRegenJob {
  private readonly logger = new Logger(CalendarRegenJob.name);

  constructor(private readonly groupScheduleService: GroupScheduleService) {}

  @Cron('0 1 1 * *', { timeZone: process.env['TZ'] ?? 'Africa/Abidjan' })
  async regenerateAll(): Promise<void> {
    this.logger.log('CalendarRegenJob: démarrage régénération calendriers');
    const results = await this.groupScheduleService.generateForAllGroups(3);
    const total = results.reduce((acc, r) => acc + r.daysGenerated, 0);
    this.logger.log(
      `CalendarRegenJob: ${results.length} groupe(s) traité(s), ${total} jours générés`,
    );
  }
}
