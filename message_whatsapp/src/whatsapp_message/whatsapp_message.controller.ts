
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('messages')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WhatsappMessageController {
  constructor(private readonly messageService: WhatsappMessageService) {}

  @Get(':chat_id')
  @Roles('ADMIN')
  async findByChatId(@Param('chat_id') chat_id: string) {
    return this.messageService.findByChatId(chat_id);
  }
}
