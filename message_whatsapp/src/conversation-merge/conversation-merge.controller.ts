import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ConversationMergeService } from './conversation-merge.service';
import { MergeConversationsDto } from './dto/merge-conversations.dto';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

/**
 * P3.6 — Merge de conversations
 * POST /admin/conversations/merge  (admin)
 * POST /conversations/merge         (agent JWT — si permission accordée)
 */

@Controller('admin/conversations/merge')
@UseGuards(AdminGuard)
export class ConversationMergeAdminController {
  constructor(private readonly service: ConversationMergeService) {}

  @Post()
  merge(@Body() dto: MergeConversationsDto) {
    return this.service.merge(dto.source_chat_id, dto.target_chat_id, dto.reason);
  }
}

@Controller('conversations/merge')
@UseGuards(AuthGuard('jwt'))
export class ConversationMergeController {
  constructor(private readonly service: ConversationMergeService) {}

  @Post()
  merge(@Body() dto: MergeConversationsDto) {
    return this.service.merge(dto.source_chat_id, dto.target_chat_id, dto.reason);
  }
}
