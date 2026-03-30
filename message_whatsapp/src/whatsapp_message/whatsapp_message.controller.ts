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
  UnprocessableEntityException,
  Req,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { WhapiOutboundError } from 'src/communication_whapi/errors/whapi-outbound.error';
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
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
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
    private readonly messengerService: CommunicationMessengerService,
    private readonly whapiService: CommunicationWhapiService,
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
      chat.last_msg_client_channel_id ?? chat.channel_id ?? null;

    if (!channelId) {
      const lastMessage = await this.messageService.findLastMessageBychat_id(
        chat.chat_id,
      );
      if (!lastMessage?.channel_id) {
        throw new BadRequestException('Cannot resolve channel for this chat');
      }
    }

    const resolvedChannelId =
      channelId ??
      (await this.messageService.findLastMessageBychat_id(chat.chat_id))
        ?.channel_id;

    if (!resolvedChannelId) {
      throw new BadRequestException('Cannot resolve channel for this chat');
    }

    const mediaType = detectMediaType(file.mimetype);
    const user = req.user;

    let message;
    try {
      message = await this.messageService.createAgentMediaMessage({
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
    } catch (error) {
      if (error instanceof WhapiOutboundError) {
        if (error.statusCode === 415) {
          throw new UnprocessableEntityException(error.message);
        }
        throw new BadRequestException(error.message);
      }
      throw error;
    }

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
      // relations: ['channel', 'message', 'message.channel', 'message.chat'],
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

    const channel =
      await this.channelService.findByChannelId(resolvedChannelId);
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

  @Get('media/whapi/:messageId')
  async streamWhapiMedia(
    @Param('messageId') messageId: string,
    @Query('channelId') channelId: string | undefined,
    @Res() res: Response,
  ) {
    if (!messageId) {
      throw new BadRequestException('messageId is required');
    }

    // Résolution du channelId depuis la DB si absent du query string
    const resolvedChannelId =
      channelId ??
      (
        await this.mediaRepository.findOne({
          where: { whapi_media_id: messageId, provider: 'whapi' },
          relations: ['message'],
        })
      )?.message?.channel_id ??
      null;

    if (!resolvedChannelId) {
      throw new NotFoundException('Channel non résolu pour ce média Whapi');
    }

    const downloaded = await this.whapiService.downloadMedia(
      messageId,
      resolvedChannelId,
    );

    if (!downloaded) {
      throw new NotFoundException('Média Whapi introuvable');
    }

    res.setHeader('Content-Type', downloaded.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(downloaded.buffer);
  }

  @Get('media/messenger/:messageId')
  async streamMessengerMedia(
    @Param('messageId') messageId: string,
    @Query('channelId') channelId: string | undefined,
    @Res() res: Response,
  ) {
    if (!messageId) {
      throw new BadRequestException('messageId is required');
    }

    const media = await this.mediaRepository.findOne({
      where: { provider_media_id: messageId, provider: 'messenger' },
      relations: ['message'],
    });

    const resolvedChannelId =
      media?.message?.channel_id ??
      media?.message?.chat?.last_msg_client_channel_id ??
      channelId ??
      null;

    if (!resolvedChannelId) {
      throw new NotFoundException('Channel non résolu pour ce média Messenger');
    }

    const channel = await this.channelService.findByChannelId(resolvedChannelId);
    if (!channel?.token) {
      throw new NotFoundException('Token du canal Messenger introuvable');
    }

    const downloaded = await this.messengerService.downloadMedia(
      messageId,
      channel.token.trim(),
    );

    if (!downloaded) {
      throw new NotFoundException('Média Messenger introuvable');
    }

    res.setHeader('Content-Type', downloaded.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(downloaded.buffer);
  }

  @Get(':chat_id/count')
  @UseGuards(AdminGuard)
  async countByChatId(@Param('chat_id') chat_id: string) {
    const count = await this.messageService.countBychat_id(chat_id);
    return { count };
  }

  @Get(':chat_id')
  @UseGuards(AdminGuard)
  async findByChatId(@Param('chat_id') chat_id: string) {
    const messages = await this.messageService.findBychat_id(chat_id);
    return messages.map((msg) => ({
      ...msg,
      medias: msg.medias?.map((m) => ({
        id: m.id,
        type: m.media_type,
        url: this.resolveAdminMediaUrl(msg, m),
        mime_type: m.mime_type,
        caption: m.caption,
        file_name: m.file_name,
        file_size: m.file_size,
        seconds: m.duration_seconds,
        latitude: m.latitude,
        longitude: m.longitude,
      })) ?? [],
    }));
  }

  private resolveAdminMediaUrl(
    message: { provider?: string | null; channel_id?: string | null },
    media: { provider_media_id?: string | null; media_id: string; url?: string | null },
  ): string | null {
    const channelQuery = message.channel_id
      ? `?channelId=${encodeURIComponent(message.channel_id)}`
      : '';

    if (message.provider === 'meta') {
      const providerMediaId = media.provider_media_id ?? media.media_id;
      if (!providerMediaId) return null;
      return `/messages/media/meta/${providerMediaId}${channelQuery}`;
    }

    if (message.provider === 'messenger') {
      const providerMediaId = media.provider_media_id ?? media.media_id;
      if (!providerMediaId) return null;
      return `/messages/media/messenger/${providerMediaId}${channelQuery}`;
    }

    const directUrl = media.url ?? null;
    if (directUrl) {
      if (directUrl.startsWith('/')) return directUrl;
      try {
        const parsed = new URL(directUrl);
        if (parsed.pathname.startsWith('/messages/media/')) {
          return `${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // URL invalide → retourner telle quelle
      }
    }

    return directUrl;
  }

  @Get()
  @UseGuards(AdminGuard)
  async findAll(
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
    return await this.messageService.findAll(
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
      dateStart,
    );
  }
}
