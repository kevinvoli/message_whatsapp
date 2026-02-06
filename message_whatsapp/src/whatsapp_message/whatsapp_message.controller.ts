
import { Controller, Get, Param, UseGuards, Post, Body } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { AdminGuard } from '../auth/admin.guard'; // Import AdminGuard
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto'; // Import DTO

@Controller('messages')
@UseGuards(AdminGuard) // Use AdminGuard
export class WhatsappMessageController {
  constructor(private readonly messageService: WhatsappMessageService) {}

  @Post()
  async create(@Body() createMessageDto: CreateWhatsappMessageDto) {
    return this.messageService.createAgentMessage({
      chat_id: createMessageDto.chat_id,
      text: createMessageDto.text,
      poste_id: createMessageDto.poste_id,
      timestamp: new Date(),
      channel_id: createMessageDto.channel_id,
    });
  }

  @Get(':chat_id')
  async findByChatId(@Param('chat_id') chat_id: string) {
    return this.messageService.findBychat_id(chat_id);
  }
}
