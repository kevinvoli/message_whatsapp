import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { QuizSession } from './entities/quiz-session.entity';
import { QuizSessionQuestion } from './entities/quiz-session-question.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

export interface SessionWithCount extends QuizSession {
  questionCount: number;
}

@Injectable()
export class QuizSessionService {
  constructor(
    @InjectRepository(QuizSession)
    private readonly sessionRepo: Repository<QuizSession>,
    @InjectRepository(QuizSessionQuestion)
    private readonly sqRepo: Repository<QuizSessionQuestion>,
    private readonly dataSource: DataSource,
  ) {}

  async createSession(dto: CreateSessionDto): Promise<QuizSession> {
    const existing = await this.sessionRepo.findOne({ where: { sessionDate: dto.sessionDate } });
    if (existing) {
      throw new ConflictException(`Une session existe deja pour la date ${dto.sessionDate}`);
    }

    return this.dataSource.transaction(async (manager) => {
      const session = manager.create(QuizSession, {
        title: dto.title,
        sessionDate: dto.sessionDate,
        isActive: dto.isActive ?? true,
        passingScore: dto.passingScore ?? null,
        maxAttempts: dto.maxAttempts ?? 1,
        totalTimeMinutes: dto.totalTimeMinutes ?? null,
        historyVisible: dto.historyVisible ?? true,
      });
      const savedSession = await manager.save(QuizSession, session);

      if (dto.questionIds.length > 0) {
        const sessionQuestions = dto.questionIds.map((qId, index) =>
          manager.create(QuizSessionQuestion, {
            sessionId: savedSession.id,
            questionId: qId,
            position: index,
          }),
        );
        await manager.save(QuizSessionQuestion, sessionQuestions);
      }

      return savedSession;
    });
  }

  async findAllSessions(): Promise<SessionWithCount[]> {
    const rows = await this.sessionRepo
      .createQueryBuilder('s')
      .loadRelationCountAndMap('s.questionCount', 's.sessionQuestions')
      .orderBy('s.sessionDate', 'DESC')
      .getMany();

    return rows as SessionWithCount[];
  }

  async findSessionByDate(date: string): Promise<QuizSession | null> {
    return this.sessionRepo
      .createQueryBuilder('session')
      .where('session.sessionDate = :date', { date })
      .andWhere('session.isActive = 1')
      .getOne();
  }

  private async findSessionOrFail(id: string): Promise<QuizSession> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} introuvable`);
    return session;
  }

  async updateSession(id: string, dto: UpdateSessionDto): Promise<QuizSession> {
    const session = await this.findSessionOrFail(id);

    if (dto.sessionDate !== undefined && dto.sessionDate !== session.sessionDate) {
      const conflict = await this.sessionRepo.findOne({ where: { sessionDate: dto.sessionDate } });
      if (conflict) {
        throw new ConflictException(`Une session existe deja pour la date ${dto.sessionDate}`);
      }
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.title !== undefined) session.title = dto.title;
      if (dto.sessionDate !== undefined) session.sessionDate = dto.sessionDate;
      if (dto.isActive !== undefined) session.isActive = dto.isActive;
      if (dto.passingScore !== undefined) session.passingScore = dto.passingScore;
      if (dto.maxAttempts !== undefined) session.maxAttempts = dto.maxAttempts;
      if (dto.totalTimeMinutes !== undefined) session.totalTimeMinutes = dto.totalTimeMinutes;
      if (dto.historyVisible !== undefined) session.historyVisible = dto.historyVisible;
      const savedSession = await manager.save(QuizSession, session);

      if (dto.questionIds !== undefined) {
        await manager.delete(QuizSessionQuestion, { sessionId: id });
        if (dto.questionIds.length > 0) {
          const sessionQuestions = dto.questionIds.map((qId, index) =>
            manager.create(QuizSessionQuestion, {
              sessionId: id,
              questionId: qId,
              position: index,
            }),
          );
          await manager.save(QuizSessionQuestion, sessionQuestions);
        }
      }

      return savedSession;
    });
  }

  async removeSession(id: string): Promise<void> {
    await this.findSessionOrFail(id);
    await this.sessionRepo.softDelete(id);
  }

  async duplicateSession(
    id: string,
    targetDates: string[],
  ): Promise<{ created: string[]; skipped: string[] }> {
    const source = await this.findSessionOrFail(id);
    const sourceQuestions = await this.sqRepo.find({ where: { sessionId: id } });

    const existing = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.sessionDate IN (:...dates)', { dates: targetDates })
      .getMany();

    const existingDates = new Set(existing.map((s) => s.sessionDate));

    const created: string[] = [];
    const skipped: string[] = [];

    for (const date of targetDates) {
      if (existingDates.has(date)) {
        skipped.push(date);
        continue;
      }

      try {
        await this.dataSource.transaction(async (manager) => {
          const newSession = manager.create(QuizSession, {
            title: source.title,
            sessionDate: date,
            isActive: source.isActive,
            passingScore: source.passingScore,
            maxAttempts: source.maxAttempts,
            totalTimeMinutes: source.totalTimeMinutes,
          });
          const saved = await manager.save(QuizSession, newSession);

          if (sourceQuestions.length > 0) {
            const newQuestions = sourceQuestions.map((sq) =>
              manager.create(QuizSessionQuestion, {
                sessionId: saved.id,
                questionId: sq.questionId,
                position: sq.position,
              }),
            );
            await manager.save(QuizSessionQuestion, newQuestions);
          }
        });
        created.push(date);
      } catch (err) {
        if (err instanceof QueryFailedError && (err as QueryFailedError & { code: string }).code === 'ER_DUP_ENTRY') {
          skipped.push(date);
        } else {
          throw err;
        }
      }
    }

    return { created, skipped };
  }
}
