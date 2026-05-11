import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class DailyResetJob {
  private readonly logger = new Logger(DailyResetJob.name);

  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  @Cron('0 0 * * *', { timeZone: process.env['TZ'] ?? 'Africa/Douala' })
  async resetWorkingToday(): Promise<void> {
    const result = await this.commercialRepo
      .createQueryBuilder()
      .update()
      .set({ isWorkingToday: false, workingTodaySince: null })
      .where('isWorkingToday = :val', { val: true })
      .execute();
    this.logger.log(`resetWorkingToday: ${result.affected ?? 0} commercial(s) remis à absent`);
  }
}
