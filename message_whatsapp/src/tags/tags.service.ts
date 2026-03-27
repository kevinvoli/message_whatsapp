import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { ChatTag } from './entities/chat-tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag) private readonly tagRepo: Repository<Tag>,
    @InjectRepository(ChatTag) private readonly chatTagRepo: Repository<ChatTag>,
  ) {}

  findAll(): Promise<Tag[]> {
    return this.tagRepo.find({ order: { name: 'ASC' } });
  }

  async create(dto: CreateTagDto): Promise<Tag> {
    const tag = this.tagRepo.create({
      name: dto.name,
      color: dto.color ?? '#6b7280',
    });
    return this.tagRepo.save(tag);
  }

  async remove(id: string): Promise<void> {
    const result = await this.tagRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Tag ${id} introuvable`);
  }

  async getTagsForChat(chatId: string): Promise<Tag[]> {
    const chatTags = await this.chatTagRepo.find({ where: { chat_id: chatId } });
    return chatTags.map((ct) => ct.tag);
  }

  async addTagToChat(chatId: string, tagId: string): Promise<void> {
    const tag = await this.tagRepo.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException(`Tag ${tagId} introuvable`);
    const existing = await this.chatTagRepo.findOne({ where: { chat_id: chatId, tag_id: tagId } });
    if (existing) throw new ConflictException('Ce tag est déjà associé à cette conversation');
    await this.chatTagRepo.save(this.chatTagRepo.create({ chat_id: chatId, tag_id: tagId }));
  }

  async removeTagFromChat(chatId: string, tagId: string): Promise<void> {
    const result = await this.chatTagRepo.delete({ chat_id: chatId, tag_id: tagId });
    if (result.affected === 0) throw new NotFoundException('Association tag/conversation introuvable');
  }
}
