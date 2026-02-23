import {
  Controller,
  Get,
  Param,
  UseGuards,
  Query,
  Patch,
  Body,
} from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('chats')
@UseGuards(AdminGuard)
export class WhatsappChatController {
  constructor(private readonly chatService: WhatsappChatService) {}

  @Get()
  async findAll(
    @Query('chat_id') chat_id?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.chatService.findAll(
      chat_id,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get(':chat_id')
  async findOne(@Param('chat_id') chat_id: string) {
    return this.chatService.findBychat_id(chat_id);
  }

  @Patch(':chat_id')
  async update(@Param('chat_id') chat_id: string, @Body() data: any) {
    return this.chatService.update(chat_id, data);
  }
}
