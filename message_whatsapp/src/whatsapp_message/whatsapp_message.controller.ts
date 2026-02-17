
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
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { AdminGuard } from '../auth/admin.guard';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { Repository } from 'typeorm';
import { ChannelService } from 'src/channel/channel.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { Response } from 'express';

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
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
    private readonly channelService: ChannelService,
    private readonly metaService: CommunicationMetaService,
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

  @Get('media/meta/:providerMediaId')
  async streamMetaMedia(
    @Param('providerMediaId') providerMediaId: string,
    @Query('channelId') channelId: string | undefined,
    @Res() res: Response,
  ) {
    if (!providerMediaId) {
      throw new BadRequestException('providerMediaId is required');
    }

    const media = await this.mediaRepository.findOne({
      where: { provider_media_id: providerMediaId, provider: 'meta' },
      relations: ['channel', 'message', 'message.channel', 'message.chat'],
    });

    const resolvedChannelId =
      media?.channel?.channel_id ??
      media?.message?.channel_id ??
      media?.message?.chat?.last_msg_client_channel_id ??
      channelId ??
      null;

    if (!resolvedChannelId) {
      throw new NotFoundException('Channel not resolved for media');
    }

    const channel = await this.channelService.findByChannelId(resolvedChannelId);
    if (!channel?.token) {
      throw new NotFoundException('Channel token not found');
    }

    let mediaUrl = media?.url ?? null;

    // Try direct URL from webhook if present
    let downloaded =
      mediaUrl && channel?.token
        ? await this.metaService.downloadMediaByUrl(mediaUrl, channel.token)
        : null;

    // If direct URL is missing or expired, refresh via Meta API
    if (!downloaded) {
      const refreshedUrl = await this.metaService.getMediaUrl(
        providerMediaId,
        channel.token,
        channel.channel_id,
      );
      if (refreshedUrl) {
        if (media && refreshedUrl !== media.url) {
          await this.mediaRepository.update(media.id, { url: refreshedUrl });
        }
        mediaUrl = refreshedUrl;
        downloaded = await this.metaService.downloadMediaByUrl(
          refreshedUrl,
          channel.token,
        );
      }
    }

    // Final fallback: resolve URL then download (handles transient Meta API issues)
    if (!downloaded) {
      downloaded = await this.metaService.downloadMedia(
        providerMediaId,
        channel.token,
        channel.channel_id,
      );
    }

    if (!downloaded) {
      throw new NotFoundException('Meta media not found');
    }

    res.setHeader('Content-Type', downloaded.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(downloaded.buffer);
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
