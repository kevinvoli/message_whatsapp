import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConversationNotesService } from './conversation-notes.service';
import { CreateNoteDto } from './dto/create-note.dto';

@Controller('conversations/:chatId/notes')
export class ConversationNotesController {
  constructor(private readonly service: ConversationNotesService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll(@Param('chatId') chatId: string) {
    return this.service.findByChatId(chatId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(
    @Param('chatId') chatId: string,
    @Body() dto: CreateNoteDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.service.createByCommercial(chatId, req.user.userId, dto.content);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':noteId')
  remove(@Param('noteId') noteId: string) {
    return this.service.softDelete(noteId);
  }
}
