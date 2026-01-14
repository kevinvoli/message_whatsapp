import { Module } from '@nestjs/common';
import { DispatcherService } from './dispatcher.service';

@Module({
  controllers: [],
  providers: [DispatcherService],
})
export class DispatcherModule {}
