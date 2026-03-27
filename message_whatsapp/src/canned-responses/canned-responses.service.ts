import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CannedResponse } from './entities/canned-response.entity';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';

@Injectable()
export class CannedResponsesService {
  constructor(
    @InjectRepository(CannedResponse)
    private readonly repo: Repository<CannedResponse>,
  ) {}

  async findAll(search?: string, category?: string): Promise<CannedResponse[]> {
    const where: any = {};
    if (category) where.category = category;
    if (search) {
      return this.repo.find({
        where: [
          { ...where, shortcut: ILike(`%${search}%`) },
          { ...where, title: ILike(`%${search}%`) },
          { ...where, content: ILike(`%${search}%`) },
        ],
        order: { category: 'ASC', shortcut: 'ASC' },
      });
    }
    return this.repo.find({ where, order: { category: 'ASC', shortcut: 'ASC' } });
  }

  async findByShortcutPrefix(prefix: string): Promise<CannedResponse[]> {
    if (!prefix) return this.repo.find({ order: { shortcut: 'ASC' }, take: 20 });
    return this.repo.find({
      where: { shortcut: ILike(`${prefix}%`) },
      order: { shortcut: 'ASC' },
      take: 10,
    });
  }

  async create(dto: CreateCannedResponseDto): Promise<CannedResponse> {
    const entity = this.repo.create({
      shortcut: dto.shortcut.startsWith('/') ? dto.shortcut : `/${dto.shortcut}`,
      title: dto.title,
      content: dto.content,
      category: dto.category ?? null,
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: Partial<CreateCannedResponseDto>): Promise<CannedResponse> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`CannedResponse ${id} not found`);
    if (dto.shortcut !== undefined) {
      existing.shortcut = dto.shortcut.startsWith('/') ? dto.shortcut : `/${dto.shortcut}`;
    }
    if (dto.title !== undefined) existing.title = dto.title;
    if (dto.content !== undefined) existing.content = dto.content;
    if (dto.category !== undefined) existing.category = dto.category ?? null;
    return this.repo.save(existing);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`CannedResponse ${id} not found`);
  }
}
