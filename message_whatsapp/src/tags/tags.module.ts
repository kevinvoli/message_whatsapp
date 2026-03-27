import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';
import { ChatTag } from './entities/chat-tag.entity';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, ChatTag])],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
