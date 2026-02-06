
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('messages')
@UseGuards(AuthGuard('jwt'))
export class WhatsappMessageController {
  constructor(private readonly messageService: WhatsappMessageService) {}

  @Get(':chat_id')
  async findByChatId(@Param('chat_id') chat_id: string) {
    return this.messageService.findBychat_id(chat_id);
  }
}
