import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingApplication } from './entities/messaging-application.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ApplicationService } from './application.service';
import { ApplicationController } from './application.controller';
import { ApplicationWebhookService } from './application-webhook.service';
import { AppLogger } from 'src/logging/app-logger.service';

@Module({
  imports: [TypeOrmModule.forFeature([MessagingApplication, WhapiChannel])],
  controllers: [ApplicationController],
  providers: [ApplicationService, ApplicationWebhookService, AppLogger],
  exports: [ApplicationService],
})
export class ApplicationModule {}
