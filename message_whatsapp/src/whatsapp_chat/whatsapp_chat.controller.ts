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
    @Query('periode') periode?: string,
  ) {
    let dateStart: Date | undefined;
    if (periode) {
      const now = new Date();
      const joursMap: Record<string, number> = { today: 0, week: 7, month: 30, year: 365 };
      const jours = joursMap[periode];
      if (jours !== undefined) {
        dateStart = new Date(now);
        if (jours === 0) {
          dateStart.setHours(0, 0, 0, 0);
        } else {
          dateStart.setDate(dateStart.getDate() - jours);
          dateStart.setHours(0, 0, 0, 0);
        }
      }
    }
    return this.chatService.findAll(
      chat_id,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
      dateStart,
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
