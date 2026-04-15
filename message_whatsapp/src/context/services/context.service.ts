import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Context } from '../entities/context.entity';
import { ContextBinding } from '../entities/context-binding.entity';
import { ChatContext } from '../entities/chat-context.entity';
import { ContextResolverService } from './context-resolver.service';

export interface UpdateChatContextDto {
  posteId?: string | null;
  unreadCount?: number;
  readOnly?: boolean;
  lastClientMessageAt?: Date | null;
  lastPosteMessageAt?: Date | null;
  lastActivityAt?: Date | null;
  whatsappChatId?: string | null;
}

export interface FindChatContextsPage {
  items: ChatContext[];
  nextCursor: string | null;
}

/**
 * CTX-B2 — ContextService
 *
 * CRUD sur Context / ContextBinding + findOrCreate + updateChatContext.
 */
@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);

  constructor(
    @InjectRepository(Context)
    private readonly contextRepo: Repository<Context>,
    @InjectRepository(ContextBinding)
    private readonly bindingRepo: Repository<ContextBinding>,
    @InjectRepository(ChatContext)
    private readonly chatContextRepo: Repository<ChatContext>,
    private readonly dataSource: DataSource,
    private readonly resolver: ContextResolverService,
  ) {}

  // ─── Context CRUD ─────────────────────────────────────────────────────────

  findAll(): Promise<Context[]> {
    return this.contextRepo.find({ relations: ['bindings'] });
  }

  async findById(id: string): Promise<Context> {
    const ctx = await this.contextRepo.findOne({ where: { id }, relations: ['bindings'] });
    if (!ctx) throw new NotFoundException(`Context ${id} introuvable`);
    return ctx;
  }

  async createContext(dto: Partial<Context>): Promise<Context> {
    const ctx = this.contextRepo.create(dto);
    return this.contextRepo.save(ctx);
  }

  async updateContext(id: string, dto: Partial<Context>): Promise<Context> {
    await this.findById(id); // throws if not found
    await this.contextRepo.update(id, dto);
    return this.findById(id);
  }

  async deleteContext(id: string): Promise<void> {
    await this.findById(id);
    await this.contextRepo.delete(id);
  }

  // ─── ContextBinding CRUD ──────────────────────────────────────────────────

  async addBinding(contextId: string, dto: Partial<ContextBinding>): Promise<ContextBinding> {
    await this.findById(contextId);
    const binding = this.bindingRepo.create({ ...dto, contextId });
    try {
      return await this.bindingRepo.save(binding);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === 'ER_DUP_ENTRY') {
        throw new ConflictException(
          `Un binding ${dto.bindingType}/${dto.refValue} existe déjà`,
        );
      }
      throw err;
    } finally {
      if (dto.refValue) this.resolver.invalidate(dto.refValue);
    }
  }

  async removeBinding(bindingId: string): Promise<void> {
    const binding = await this.bindingRepo.findOne({ where: { id: bindingId } });
    if (!binding) throw new NotFoundException(`Binding ${bindingId} introuvable`);
    await this.bindingRepo.delete(bindingId);
    this.resolver.invalidate(binding.refValue);
  }

  // ─── ChatContext findOrCreate ─────────────────────────────────────────────

  /**
   * CTX-B3 — findOrCreateChatContext
   *
   * Retourne le ChatContext existant pour (chatId × contextId),
   * ou en crée un nouveau si absent.
   * Gère la race condition duplicate-key : en cas de conflit, re-fetch.
   */
  async findOrCreateChatContext(
    chatId: string,
    contextId: string,
    defaults: Partial<ChatContext> = {},
  ): Promise<ChatContext> {
    const existing = await this.chatContextRepo.findOne({
      where: { chatId, contextId },
    });
    if (existing) return existing;

    try {
      const cc = this.chatContextRepo.create({ chatId, contextId, ...defaults });
      return await this.chatContextRepo.save(cc);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === 'ER_DUP_ENTRY') {
        // Race condition — un autre worker a créé entre-temps
        const refetched = await this.chatContextRepo.findOne({ where: { chatId, contextId } });
        if (refetched) return refetched;
      }
      throw err;
    }
  }

  /**
   * CTX-B4 — updateChatContext
   *
   * Met à jour les compteurs d'un ChatContext par son ID.
   * Contrairement à chatService.update(chat_id, …) qui modifie TOUTES les
   * conversations d'un contact, cette méthode est isolée par contexte.
   */
  async updateChatContext(id: string, dto: UpdateChatContextDto): Promise<ChatContext> {
    await this.chatContextRepo.update(id, dto);
    const updated = await this.chatContextRepo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException(`ChatContext ${id} introuvable`);
    return updated;
  }

  /**
   * Récupère les ChatContexts d'un poste avec pagination par curseur.
   * @param posteId  ID du poste
   * @param limit    Taille de page (défaut 20)
   * @param cursor   ID du dernier item de la page précédente (optionnel)
   */
  async findChatContextsByPoste(
    posteId: string,
    limit = 20,
    cursor?: string,
  ): Promise<FindChatContextsPage> {
    const qb = this.chatContextRepo
      .createQueryBuilder('cc')
      .where('cc.posteId = :posteId', { posteId })
      .orderBy('cc.lastActivityAt', 'DESC')
      .addOrderBy('cc.id', 'ASC')
      .take(limit + 1);

    if (cursor) {
      // Récupère le dernier item du curseur pour paginer
      const pivot = await this.chatContextRepo.findOne({ where: { id: cursor } });
      if (pivot) {
        qb.andWhere(
          '(cc.lastActivityAt < :lat OR (cc.lastActivityAt = :lat AND cc.id > :cid))',
          { lat: pivot.lastActivityAt, cid: pivot.id },
        );
      }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor };
  }
}
