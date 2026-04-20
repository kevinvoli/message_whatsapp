import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUp } from './entities/follow_up.entity';
import { FollowUpService } from './follow_up.service';
import { FollowUpController } from './follow_up.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FollowUp])],
  controllers: [FollowUpController],
  providers: [FollowUpService],
  exports: [FollowUpService],
})
export class FollowUpModule {}
