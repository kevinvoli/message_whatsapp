import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { LessThan, Repository } from 'typeorm';

@Injectable()
export class DispatcherScheduler {
    private readonly logger = new Logger(DispatcherScheduler.name);

    constructor(
        @InjectRepository(WhatsappChat)
        private readonly chatRepository: Repository<WhatsappChat>,
    ) {}

  /**
   * Periodically checks for conversations that have exceeded the response timeout.
   */
  @Cron('*/30 * * * *') // Runs every 30 minutes
  async checkResponseTimeout() {
    this.logger.log('Running job to close inactive conversations...');
    const timeout = new Date();
    timeout.setHours(timeout.getHours() - 24);

    const result = await this.chatRepository.update(
        {
            last_activity_at: LessThan(timeout),
            status: WhatsappChatStatus.ACTIF
        },
        { status: WhatsappChatStatus.FERME }
    );

    if (result.affected && result.affected > 0) {
        this.logger.log(`Closed ${result.affected} inactive conversations.`);
    }
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
