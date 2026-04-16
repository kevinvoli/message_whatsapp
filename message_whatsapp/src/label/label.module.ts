import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Label } from './entities/label.entity';
import { ChatLabelAssignment } from './entities/chat-label-assignment.entity';
import { LabelService } from './label.service';
import {
  LabelAdminController,
  ChatLabelAdminController,
  LabelAgentController,
  ChatLabelAgentController,
} from './label.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Label, ChatLabelAssignment])],
  controllers: [
    LabelAdminController,
    ChatLabelAdminController,
    LabelAgentController,
    ChatLabelAgentController,
  ],
  providers: [LabelService],
  exports: [LabelService],
})
export class LabelModule {}
