import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationNote } from './entities/conversation-note.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class ConversationNotesService {
  constructor(
    @InjectRepository(ConversationNote)
    private readonly noteRepo: Repository<ConversationNote>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  async findByChatId(chatId: string): Promise<ConversationNote[]> {
    return this.noteRepo.find({
      where: { chatId },
      order: { createdAt: 'ASC' },
    });
  }

  async createByCommercial(
    chatId: string,
    commercialId: string,
    content: string,
  ): Promise<ConversationNote> {
    const commercial = await this.commercialRepo.findOne({ where: { id: commercialId } });
    const note = this.noteRepo.create({
      chatId,
      authorId: commercialId,
      authorName: commercial?.name ?? null,
      authorType: 'commercial',
      content,
    });
    return this.noteRepo.save(note);
  }

  async createByAdmin(
    chatId: string,
    adminId: string,
    adminName: string | null,
    content: string,
  ): Promise<ConversationNote> {
    const note = this.noteRepo.create({
      chatId,
      authorId: adminId,
      authorName: adminName,
      authorType: 'admin',
      content,
    });
    return this.noteRepo.save(note);
  }

  async softDelete(noteId: string): Promise<void> {
    const result = await this.noteRepo.softDelete(noteId);
    if (result.affected === 0) throw new NotFoundException(`Note ${noteId} not found`);
  }
}
