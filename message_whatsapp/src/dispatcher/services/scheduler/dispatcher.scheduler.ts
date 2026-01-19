import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class DispatcherScheduler {
  constructor() {}

  /**
   * Periodically checks for conversations that have exceeded the response timeout.
   */
  @Cron('*/30 * * * *') // Runs every 30 minutes
  async checkResponseTimeout() {
    // TODO: Implement logic to lock conversations after 24h of inactivity.
    console.log('Checking for timed out conversations...');
  }

  /**
   * Runs the scheduled distribution of pending messages.
   * The time will be configurable from the settings.
   */
  // @Cron('0 9 * * *') // Example: Runs daily at 9:00 AM
  async scheduledDistribution() {
    // TODO: Implement the call to the orchestrator to distribute pending messages.
    console.log('Running scheduled distribution of pending messages...');
  }
}
