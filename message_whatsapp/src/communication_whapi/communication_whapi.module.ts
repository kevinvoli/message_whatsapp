import { Module } from '@nestjs/common';
import { CommunicationWhapiService } from './communication_whapi.service';
import { CommunicationWhapiController } from './communication_whapi.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

@Module({
  imports: [
      TypeOrmModule.forFeature([
        WhapiChannel
      ]),
    ],
  controllers: [CommunicationWhapiController],
  providers: [CommunicationWhapiService],
  exports: [CommunicationWhapiService],
})
export class CommunicationWhapiModule {}
