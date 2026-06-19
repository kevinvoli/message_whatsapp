import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { QuizCategory } from './entities/quiz-category.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

export interface SessionResultEntry {
  commercialId: string;
  commercialName: string;
  posteName: string | null;
  attemptsCount: number;
  bestScore: number;
  maxScore: number;
  isPassed: boolean | null;
  completedAt: Date;
}

@Injectable()
export class QuizAdminService {
  constructor(
    @InjectRepository(QuizCategory)
    private readonly categoryRepo: Repository<QuizCategory>,
    @InjectRepository(QuizQuestion)
    private readonly questionRepo: Repository<QuizQuestion>,
    @InjectRepository(QuizAnswer)
    private readonly answerRepo: Repository<QuizAnswer>,
    @InjectRepository(QuizAttempt)
    private readonly attemptRepo: Repository<QuizAttempt>,
    private readonly dataSource: DataSource,
  ) {}

  async createCategory(dto: CreateCategoryDto): Promise<QuizCategory> {
    const category = this.categoryRepo.create({
      name: dto.name,
      color: dto.color ?? null,
    });
    return this.categoryRepo.save(category);
  }

  async findAllCategories(): Promise<QuizCategory[]> {
    return this.categoryRepo.find({
      where: { deletedAt: IsNull() },
      order: { name: 'ASC' },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<QuizCategory> {
    const category = await this.categoryRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!category) throw new NotFoundException(`Categorie ${id} introuvable`);
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async removeCategory(id: string): Promise<void> {
    await this.categoryRepo.softDelete(id);
  }

  async createQuestion(dto: CreateQuestionDto): Promise<QuizQuestion> {
    const correctCount = dto.answers.filter((a) => a.isCorrect).length;
    if (correctCount !== 1) {
      throw new BadRequestException('La question doit avoir exactement 1 reponse correcte');
    }

    return this.dataSource.transaction(async (manager) => {
      const question = manager.create(QuizQuestion, {
        categoryId: dto.categoryId,
        text: dto.text,
        points: dto.points ?? 1,
        timeLimitSeconds: dto.timeLimitSeconds ?? null,
        isActive: true,
      });
      const savedQuestion = await manager.save(QuizQuestion, question);

      const answers = dto.answers.map((a, index) =>
        manager.create(QuizAnswer, {
          questionId: savedQuestion.id,
          text: a.text,
          isCorrect: a.isCorrect,
          position: a.position ?? index,
        }),
      );
      await manager.save(QuizAnswer, answers);
      savedQuestion.answers = answers;
      return savedQuestion;
    });
  }

  async findAllQuestions(filters: {
    categoryId?: string;
    search?: string;
    activeOnly?: boolean;
  }): Promise<QuizQuestion[]> {
    const qb = this.questionRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.answers', 'answer')
      .leftJoinAndSelect('q.category', 'category')
      .where('q.deletedAt IS NULL');

    if (filters.categoryId) {
      qb.andWhere('q.categoryId = :categoryId', { categoryId: filters.categoryId });
    }
    if (filters.search) {
      qb.andWhere('q.text LIKE :search', { search: `%${filters.search}%` });
    }
    if (filters.activeOnly) {
      qb.andWhere('q.isActive = 1');
    }

    return qb.orderBy('q.createdAt', 'DESC').getMany();
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto): Promise<QuizQuestion> {
    const question = await this.questionRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!question) throw new NotFoundException(`Question ${id} introuvable`);

    if (dto.answers !== undefined) {
      const correctCount = dto.answers.filter((a) => a.isCorrect).length;
      if (correctCount !== 1) {
        throw new BadRequestException('La question doit avoir exactement 1 reponse correcte');
      }
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.categoryId !== undefined) question.categoryId = dto.categoryId;
      if (dto.text !== undefined) question.text = dto.text;
      if (dto.points !== undefined) question.points = dto.points;
      if (dto.timeLimitSeconds !== undefined) question.timeLimitSeconds = dto.timeLimitSeconds;
      const savedQuestion = await manager.save(QuizQuestion, question);

      if (dto.answers !== undefined) {
        await manager.delete(QuizAnswer, { questionId: id });
        const answers = dto.answers.map((a, index) =>
          manager.create(QuizAnswer, {
            questionId: id,
            text: a.text,
            isCorrect: a.isCorrect,
            position: a.position ?? index,
          }),
        );
        savedQuestion.answers = await manager.save(QuizAnswer, answers);
      }

      return savedQuestion;
    });
  }

  async archiveQuestion(id: string): Promise<void> {
    await this.questionRepo.softDelete(id);
  }

  async getSessionResults(sessionId: string): Promise<SessionResultEntry[]> {
    // Étape 1 : agréger le nombre de tentatives et le score MAX par commercial (1 requête)
    const aggregates = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.commercialId', 'commercialId')
      .addSelect('COUNT(a.id)', 'attemptsCount')
      .addSelect('MAX(a.score)', 'bestScore')
      .where('a.sessionId = :sessionId', { sessionId })
      .andWhere('a.completedAt IS NOT NULL')
      .groupBy('a.commercialId')
      .getRawMany<{ commercialId: string; attemptsCount: string; bestScore: string | null }>();

    if (aggregates.length === 0) return [];

    // Étape 2 : pour chaque commercial, récupérer la tentative avec le score MAX
    const commercialIds = aggregates.map((r) => r.commercialId);

    const bestAttempts = await this.attemptRepo
      .createQueryBuilder('attempt')
      .leftJoin('whatsapp_commercial', 'c', 'c.id = attempt.commercialId')
      .leftJoin('whatsapp_poste', 'p', 'p.id = c.poste_id')
      .select([
        'attempt.commercialId AS commercialId',
        'c.name AS commercialName',
        'p.name AS posteName',
        'attempt.score AS bestScore',
        'attempt.maxScore AS maxScore',
        'attempt.isPassed AS isPassed',
        'attempt.completedAt AS completedAt',
      ])
      .where('attempt.sessionId = :sessionId', { sessionId })
      .andWhere('attempt.completedAt IS NOT NULL')
      .andWhere('attempt.commercialId IN (:...commercialIds)', { commercialIds })
      .andWhere(
        'attempt.score = (' +
          'SELECT MAX(a2.score) FROM quiz_attempt a2 ' +
          'WHERE a2.commercial_id = attempt.commercialId ' +
          'AND a2.session_id = :sessionId ' +
          'AND a2.completed_at IS NOT NULL' +
          ')',
      )
      .orderBy('attempt.score', 'DESC')
      .getRawMany<{
        commercialId: string;
        commercialName: string | null;
        posteName: string | null;
        bestScore: string | null;
        maxScore: string | null;
        isPassed: number | null;
        completedAt: Date;
      }>();

    // Dédoublonner par commercialId (si ex-æquo, garder la première ligne)
    const seen = new Set<string>();
    const deduped = bestAttempts.filter((r) => {
      if (seen.has(r.commercialId)) return false;
      seen.add(r.commercialId);
      return true;
    });

    const countMap = new Map(aggregates.map((r) => [r.commercialId, Number(r.attemptsCount)]));

    return deduped.map((r) => ({
      commercialId: r.commercialId,
      commercialName: r.commercialName ?? r.commercialId,
      posteName: r.posteName,
      attemptsCount: countMap.get(r.commercialId) ?? 1,
      bestScore: r.bestScore !== null ? Number(r.bestScore) : 0,
      maxScore: r.maxScore !== null ? Number(r.maxScore) : 0,
      isPassed: r.isPassed !== null ? Boolean(r.isPassed) : null,
      completedAt: r.completedAt,
    }));
  }
}
