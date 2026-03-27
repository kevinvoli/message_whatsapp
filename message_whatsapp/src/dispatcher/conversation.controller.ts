import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DispatcherService } from './dispatcher.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { TransferConversationDto } from './dto/transfer-conversation.dto';
import { TagsService } from 'src/tags/tags.service';

@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
export class ConversationController {
  constructor(
    private readonly dispatcherService: DispatcherService,
    private readonly posteService: WhatsappPosteService,
    private readonly tagsService: TagsService,
  ) {}

  @Get('postes/available')
  async getAvailablePostes() {
    const postes = await this.posteService.findAll();
    return postes.map((p) => ({ id: p.id, name: p.name, code: p.code }));
  }

  @Post(':chatId/transfer')
  async transfer(
    @Param('chatId') chatId: string,
    @Body() dto: TransferConversationDto,
  ) {
    return this.dispatcherService.transferConversation(chatId, dto.to_poste_id);
  }

  @Get(':chatId/tags')
  getTagsForConversation(@Param('chatId') chatId: string) {
    return this.tagsService.getTagsForChat(chatId);
  }

  @Post(':chatId/tags/:tagId')
  @HttpCode(204)
  async addTag(@Param('chatId') chatId: string, @Param('tagId') tagId: string) {
    await this.tagsService.addTagToChat(chatId, tagId);
  }

  @Delete(':chatId/tags/:tagId')
  @HttpCode(204)
  async removeTag(@Param('chatId') chatId: string, @Param('tagId') tagId: string) {
    await this.tagsService.removeTagFromChat(chatId, tagId);
  }
}
