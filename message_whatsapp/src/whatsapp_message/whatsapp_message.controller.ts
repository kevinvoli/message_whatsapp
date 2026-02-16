
import {
  Controller,
  Get,
  Param,
  UseGuards,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { AdminGuard } from '../auth/admin.guard';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';

type MediaType = 'image' | 'video' | 'audio' | 'document';

function detectMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

@Controller('messages')
export class WhatsappMessageController {
  constructor(
    private readonly messageService: WhatsappMessageService,
    private readonly gateway: WhatsappMessageGateway,
    private readonly chatService: WhatsappChatService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() createMessageDto: CreateWhatsappMessageDto) {
    return this.messageService.createAgentMessage({
      chat_id: createMessageDto.chat_id,
      text: createMessageDto.text,
      poste_id: createMessageDto.poste_id,
      timestamp: new Date(),
      channel_id: createMessageDto.channel_id,
    });
  }

  @Post('media')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { chat_id: string; caption?: string },
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!body.chat_id) {
      throw new BadRequestException('chat_id is required');
    }

    const chat = await this.chatService.findBychat_id(body.chat_id);
    if (!chat) {
      throw new BadRequestException(`Chat ${body.chat_id} not found`);
    }

    // Resolve channel
    const channelId =
      chat.last_msg_client_channel_id ??
      chat.channel_id ??
      null;

    if (!channelId) {
      const lastMessage = await this.messageService.findLastMessageBychat_id(chat.chat_id);
      if (!lastMessage?.channel_id) {
        throw new BadRequestException('Cannot resolve channel for this chat');
      }
    }

    const resolvedChannelId =
      channelId ??
      (await this.messageService.findLastMessageBychat_id(chat.chat_id))?.channel_id;

    if (!resolvedChannelId) {
      throw new BadRequestException('Cannot resolve channel for this chat');
    }

    const mediaType = detectMediaType(file.mimetype);
    const user = req.user;

    const message = await this.messageService.createAgentMediaMessage({
      chat_id: body.chat_id,
      poste_id: user?.posteId,
      timestamp: new Date(),
      commercial_id: user?.userId,
      channel_id: resolvedChannelId,
      mediaBuffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      mediaType,
      caption: body.caption,
    });

    // Notify via WebSocket
    await this.gateway.notifyNewMessage(message, chat);

    return { success: true, message_id: message.id };
  }

  @Get(':chat_id')
  @UseGuards(AdminGuard)
  async findByChatId(@Param('chat_id') chat_id: string) {
    return this.messageService.findBychat_id(chat_id);
  }

  @Get()
  @UseGuards(AdminGuard)
  async findAll() {
    return await this.messageService.findAll();
  }
}
