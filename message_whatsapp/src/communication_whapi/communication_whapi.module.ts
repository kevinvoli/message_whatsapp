import { Module } from '@nestjs/common';
import { CommunicationWhapiService } from './communication_whapi.service';
import { CommunicationWhapiController } from './communication_whapi.controller';

@Module({
  controllers: [CommunicationWhapiController],
  providers: [CommunicationWhapiService],
})
export class CommunicationWhapiModule {}
