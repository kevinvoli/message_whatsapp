import { Module } from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { WhapiController } from './whapi.controller';

@Module({
  controllers: [WhapiController],
  providers: [WhapiService],
})
export class WhapiModule {}
