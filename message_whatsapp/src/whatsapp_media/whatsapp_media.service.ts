import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMedia } from './entities/whatsapp_media.entity';
import { CreateWhatsappMediaDto } from './dto/create-whatsapp_media.dto';
import { UpdateWhatsappMediaDto } from './dto/update-whatsapp_media.dto';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Injectable()
export class WhatsappMediaService {
  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,

    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  // -------------------------
  // CREATE MEDIA
  // -------------------------
  async create(createDto: CreateWhatsappMediaDto): Promise<WhatsappMedia> {
    const { chat_id, message_id, type, media_id, url, mime_type, caption, file_name, file_size, duration_seconds } = createDto;

    const chat = await this.chatRepository.findOne({ where: { chat_id } });
    if (!chat) throw new NotFoundException(`Chat ${chat_id} not found`);

    const message = await this.messageRepository.findOne({ where: { id: message_id } });
    if (!message) throw new NotFoundException(`Message ${message_id} not found`);

    const media = this.mediaRepository.create({
      chat,
      message,
      media_type: type ,
      media_id,
      url,
      mime_type,
      caption: caption ?? null,
      file_name: file_name ?? null,
      file_size: file_size ?? null,
      duration_seconds: duration_seconds ?? null,
      view_once: '0',
      preview: null,
    });

    return await this.mediaRepository.save(media);
  }

  // -------------------------
  // FIND ALL MEDIAS
  // -------------------------
  async findAll(): Promise<WhatsappMedia[]> {
    return await this.mediaRepository.find({ relations: ['chat', 'message'] });
  }

  // -------------------------
  // FIND ONE MEDIA
  // -------------------------
  async findOne(id: string): Promise<WhatsappMedia> {
    const media = await this.mediaRepository.findOne({ where: { id }, relations: ['chat', 'message'] });
    if (!media) throw new NotFoundException(`Media ${id} not found`);
    return media;
  }

  // -------------------------
  // FIND MEDIAS BY MESSAGE
  // -------------------------
  async findByMessage(message_id: string): Promise<WhatsappMedia[]> {
    const message = await this.messageRepository.findOne({ where: { id: message_id } });
    if (!message) throw new NotFoundException(`Message ${message_id} not found`);

    return await this.mediaRepository.find({
      where: { message: { id: message_id } },
    });
  }

  // -------------------------
  // UPDATE MEDIA
  // -------------------------
  async update(id: string, updateDto: UpdateWhatsappMediaDto): Promise<WhatsappMedia> {
    const media = await this.findOne(id);
    Object.assign(media, updateDto);
    return await this.mediaRepository.save(media);
  }

  // -------------------------
  // REMOVE MEDIA
  // -------------------------
  async remove(id: string): Promise<void> {
    const media = await this.findOne(id);
    await this.mediaRepository.remove(media);
  }

   async removeByMessage(message_id: string) {
    const medias = await this.findByMessage(message_id);
    await this.mediaRepository.remove(medias);
    return { deletedCount: medias.length };
  }
}
