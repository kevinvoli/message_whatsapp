import { Controller, Get, Param, Delete } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly messageService: WhatsappMessageService,
    private readonly chatService: WhatsappChatService,
  ) {}

  @Get(':id')
  findAll(@Param('id') chatId: string) {
    console.log('tantaltive de selection de message', chatId);

    return this.chatService.findAll(chatId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    console.log('get on user', id);

    return this.messageService.findOne(id);
  }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
  //   return this.messageService.update(id, updateUserDto);
  // }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messageService.remove(id);
  }
}
