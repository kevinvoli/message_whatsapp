
import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('chats')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WhatsappChatController {
  constructor(private readonly chatService: WhatsappChatService) {}

  @Get()
  @Roles('ADMIN')
  async findAll(@Query('chat_id') chat_id?: string) {
    return this.chatService.findAll(chat_id);
  }

  @Get(':chat_id')
  @Roles('ADMIN')
  async findOne(@Param('chat_id') chat_id: string) {
    return this.chatService.findBychat_id(chat_id);
  }
}
