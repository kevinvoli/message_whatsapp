// tasks.service.ts
import { Injectable,  } from '@nestjs/common';

@Injectable()
export class TasksService {
  // private readonly logger = new Logger(TasksService.name);

  // // Toutes les 10 secondes
  // @Cron(CronExpression.EVERY_10_SECONDS)
  // handleCron() {
  //   this.logger.debug('Tâche exécutée toutes les 10 secondes');
  // }

  // // Toutes les minutes (à la seconde 0)
  // @Cron(CronExpression.EVERY_MINUTE)
  // handleCronEveryMinute() {
  //   this.logger.debug('Tâche exécutée à chaque minute');
  // }

  // // Tous les jours à minuit
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // handleCronEveryDayAtMidnight() {
  //   this.logger.debug('Tâche exécutée tous les jours à minuit');
  // }

  // // Expression cron personnalisée
  // @Cron('45 * * * * *')
  // handleCronWithCustomExpression() {
  //   this.logger.debug('Tâche exécutée à la 45ème seconde de chaque minute');
  // }
}