
import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('chats')
// @UseGuards(AuthGuard('jwt'))
export class WhatsappChatController {
  constructor(private readonly chatService: WhatsappChatService) {}

  @Get()
  async findAll(@Query('chat_id') chat_id?: string) {
    console.log("liste de chat");
    
    return this.chatService.findAll(chat_id);
  }

  @Get(':chat_id')
  async findOne(@Param('chat_id') chat_id: string) {
    return this.chatService.findBychat_id(chat_id);
  }
}
