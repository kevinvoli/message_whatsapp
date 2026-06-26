import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { QuizSession } from './entities/quiz-session.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAnswerAttempt } from './entities/quiz-answer-attempt.entity';
import { QuizSessionQuestion } from './entities/quiz-session-question.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizExemptionService } from './quiz-exemption.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

export interface SessionQuestionDto {
  id: string;
  text: string;
  timeLimitSeconds: number | null;
  points: number;
  category: { name: string; color: string | null };
  answers: Array<{ id: string; text: string }>;
}

export interface TodaySessionResponse {
  sessionActive: boolean;
  isExempt: boolean;
  attemptCompleted: boolean;
  /** true dès que l'obligation du jour est remplie (soumission si requirePass=false, réussite si requirePass=true) */
  alreadySubmittedToday: boolean;
  /** ID de la session du jour (null si aucune session active) */
  sessionId: string | null;
  /** true = réussite obligatoire pour débloquer l'accès */
  requirePass: boolean;
  session?: {
    id: string;
    title: string;
    totalTimeMinutes: number | null;
    passingScore: number | null;
    maxAttempts: number;
    questions: SessionQuestionDto[];
  };
  currentAttempt?: { attemptId: string; attemptNumber: number; expiresAt: Date | null } | null;
  attemptsCount?: number;
  bestScore?: number | null;
}

export interface StartAttemptResponse {
  attemptId: string;
  attemptNumber: number;
  expiresAt: Date | null;
  questionOrder: string[];
}

export interface SubmitAttemptResponse {
  score: number;
  maxScore: number;
  isPassed: boolean | null;
  attemptNumber: number;
}

export interface AttemptResultResponse {
  score: number;
  maxScore: number;
  isPassed: boolean | null;
  timedOut: boolean;
  attemptNumber: number;
  questions: Array<{
    questionText: string;
    categoryName: string;
    pointsEarned: number;
    isCorrect: boolean;
    timedOut: boolean;
    selectedAnswer: { text: string } | null;
    correctAnswer: { text: string } | null;
  }>;
}

export interface HistoryEntry {
  attemptId: string;
  sessionDate: string;
  sessionTitle: string;
  score: number | null;
  maxScore: number | null;
  isPassed: boolean | null;
  completedAt: Date | null;
}

@Injectable()
export class QuizAttemptService {
  constructor(
    @InjectRepository(QuizSession)
    private readonly sessionRepo: Repository<QuizSession>,
    @InjectRepository(QuizAttempt)
    private readonly attemptRepo: Repository<QuizAttempt>,
    @InjectRepository(QuizAnswerAttempt)
    private readonly answerAttemptRepo: Repository<QuizAnswerAttempt>,
    @InjectRepository(QuizSessionQuestion)
    private readonly sqRepo: Repository<QuizSessionQuestion>,
    @InjectRepository(QuizQuestion)
    private readonly questionRepo: Repository<QuizQuestion>,
    private readonly exemptionService: QuizExemptionService,
  ) {}

  async getTodaySession(
    commercialId: string,
    posteId: string | null,
  ): Promise<TodaySessionResponse> {
    const session = await this.sessionRepo
      .createQueryBuilder('session')
      .where('DATE(session.sessionDate) = CURDATE()')
      .andWhere('session.isActive = 1')
      .andWhere('session.deletedAt IS NULL')
      .getOne();

    if (!session) {
      return { sessionActive: false, isExempt: false, attemptCompleted: false, alreadySubmittedToday: false, sessionId: null, requirePass: false };
    }

    const isExempt = await this.exemptionService.isExempt(commercialId, posteId);
    if (isExempt) {
      return { sessionActive: true, isExempt: true, attemptCompleted: true, alreadySubmittedToday: true, sessionId: session.id, requirePass: session.requirePass };
    }

    const attempts = await this.attemptRepo.find({
      where: { commercialId, sessionId: session.id },
      order: { attemptNumber: 'ASC' },
    });

    const attemptCompleted = this.resolveAttemptCompleted(session, attempts);
    // requirePass=true → obligation remplie seulement si score atteint (ou tentatives épuisées)
    // requirePass=false → toute soumission complétée suffit
    const alreadySubmittedToday = session.requirePass
      ? this.resolveAttemptCompleted(session, attempts)
      : attempts.some((a) => a.completedAt !== null);

    const sessionQuestions = await this.loadSessionQuestionsWithRelations(session.id);

    const currentAttempt = attempts.find((a) => a.completedAt === null) ?? null;

    const orderedQuestions = this.applyQuestionOrder(
      sessionQuestions,
      currentAttempt?.questionOrder ?? null,
    );

    const completedAttempts = attempts.filter((a) => a.completedAt !== null);
    const bestScore =
      completedAttempts.length > 0
        ? Math.max(...completedAttempts.map((a) => Number(a.score ?? 0)))
        : null;

    return {
      sessionActive: true,
      isExempt: false,
      attemptCompleted,
      alreadySubmittedToday,
      sessionId: session.id,
      requirePass: session.requirePass,
      session: {
        id: session.id,
        title: session.title,
        totalTimeMinutes: session.totalTimeMinutes,
        passingScore: session.passingScore,
        maxAttempts: session.maxAttempts,
        questions: orderedQuestions.map((sq) => ({
          id: sq.question.id,
          text: sq.question.text,
          timeLimitSeconds: sq.question.timeLimitSeconds,
          points: Number(sq.question.points),
          category: {
            name: sq.question.category.name,
            color: sq.question.category.color,
          },
          answers: sq.question.answers.map((a) => ({ id: a.id, text: a.text })),
        })),
      },
      currentAttempt: currentAttempt
        ? { attemptId: currentAttempt.id, attemptNumber: currentAttempt.attemptNumber, expiresAt: currentAttempt.expiresAt }
        : null,
      attemptsCount: attempts.length,
      bestScore,
    };
  }

  async startAttempt(commercialId: string, sessionId: string): Promise<StartAttemptResponse> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, isActive: true } });
    if (!session) throw new NotFoundException(`Session ${sessionId} introuvable ou inactive`);

    const existing = await this.attemptRepo.findOne({
      where: { commercialId, sessionId, completedAt: IsNull() },
    });
    if (existing) {
      return {
        attemptId: existing.id,
        attemptNumber: existing.attemptNumber,
        expiresAt: existing.expiresAt,
        questionOrder: existing.questionOrder,
      };
    }

    const count = await this.attemptRepo.count({ where: { commercialId, sessionId } });
    const attemptNumber = count + 1;

    if (session.maxAttempts !== 0 && count >= session.maxAttempts) {
      throw new ForbiddenException('Nombre maximum de tentatives atteint');
    }

    // Verrou anti-double-soumission : si une tentative complétée existe déjà et maxAttempts = 1
    if (session.maxAttempts === 1) {
      const completedExists = await this.attemptRepo.findOne({
        where: { commercialId, sessionId, completedAt: Not(IsNull()) },
        select: ['id'],
      });
      if (completedExists) {
        throw new ForbiddenException('QCM déjà soumis aujourd\'hui');
      }
    }

    const sqRows = await this.sqRepo.findBy({ sessionId });
    const questionIds = this.fisherYates(sqRows.map((sq) => sq.questionId));

    const expiresAt =
      session.totalTimeMinutes !== null
        ? new Date(Date.now() + session.totalTimeMinutes * 60 * 1000)
        : null;

    const attempt = this.attemptRepo.create({
      commercialId,
      sessionId,
      attemptNumber,
      questionOrder: questionIds,
      startedAt: new Date(),
      expiresAt,
      completedAt: null,
    });
    const saved = await this.attemptRepo.save(attempt);

    return {
      attemptId: saved.id,
      attemptNumber: saved.attemptNumber,
      expiresAt: saved.expiresAt,
      questionOrder: questionIds,
    };
  }

  async submitAttempt(
    commercialId: string,
    attemptId: string,
    dto: SubmitAttemptDto,
  ): Promise<SubmitAttemptResponse> {
    const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
    if (!attempt || attempt.completedAt !== null) {
      throw new NotFoundException(`Tentative ${attemptId} introuvable ou déjà complétée`);
    }
    if (attempt.commercialId !== commercialId) {
      throw new ForbiddenException('Accès refusé');
    }

    if (attempt.expiresAt !== null && !dto.timedOut && Date.now() > attempt.expiresAt.getTime() + 60_000) {
      throw new ForbiddenException('Délai dépassé');
    }

    const session = await this.sessionRepo.findOne({ where: { id: attempt.sessionId } });
    if (!session) throw new NotFoundException(`Session introuvable`);

    const questionIds = attempt.questionOrder;
    const questions = await this.questionRepo.find({
      where: { id: In(questionIds) },
      relations: ['answers'],
    });

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    let rawScore = 0;
    let rawMaxScore = 0;
    const answerAttempts: QuizAnswerAttempt[] = [];

    for (const submitted of dto.answers) {
      const question = questionMap.get(submitted.questionId);
      if (!question) continue;

      const selectedAnswer =
        submitted.answerId !== null
          ? question.answers.find((a) => a.id === submitted.answerId) ?? null
          : null;

      const isCorrect = selectedAnswer?.isCorrect ?? false;
      const pointsEarned = isCorrect ? Number(question.points) : 0;
      rawScore += pointsEarned;
      rawMaxScore += Number(question.points);

      answerAttempts.push(
        this.answerAttemptRepo.create({
          attemptId,
          questionId: submitted.questionId,
          answerId: submitted.answerId,
          isCorrect,
          pointsEarned,
          answeredAt: new Date(),
          timedOut: submitted.timedOut,
        }),
      );
    }

    // Normalisation sur 20 points quand l'admin n'a pas défini de points personnalisés
    const questionCount = questionIds.length;
    const isDefaultScoring = questionCount > 0 && rawMaxScore === questionCount;
    let score = rawScore;
    let maxScore = rawMaxScore;

    if (isDefaultScoring) {
      const factor = 20 / questionCount;
      maxScore = 20;
      score = Math.round(rawScore * factor * 100) / 100;
      const pointsPerQuestion = Math.round(factor * 100) / 100;
      for (const aa of answerAttempts) {
        if (aa.isCorrect) aa.pointsEarned = pointsPerQuestion;
      }
    }

    await this.answerAttemptRepo.save(answerAttempts);

    const isPassed =
      session.passingScore === null ? null : score >= Number(session.passingScore);

    await this.attemptRepo.update(attemptId, {
      completedAt: new Date(),
      score,
      maxScore,
      isPassed,
      timedOut: dto.timedOut,
    });

    return { score, maxScore, isPassed, attemptNumber: attempt.attemptNumber };
  }

  async getAttemptResult(
    commercialId: string,
    attemptId: string,
  ): Promise<AttemptResultResponse> {
    const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
    if (!attempt || attempt.completedAt === null) {
      throw new NotFoundException(`Tentative ${attemptId} introuvable ou non complétée`);
    }
    if (attempt.commercialId !== commercialId) {
      throw new ForbiddenException('Accès refusé');
    }

    const rawAnswerAttempts = await this.answerAttemptRepo.findBy({ attemptId });

    const questionIds = rawAnswerAttempts.map((aa) => aa.questionId);
    const questions = questionIds.length > 0
      ? await this.questionRepo.find({
          where: { id: In(questionIds) },
          relations: ['answers', 'category'],
        })
      : [];

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const orderMap = new Map(attempt.questionOrder.map((id, idx) => [id, idx]));
    rawAnswerAttempts.sort(
      (a, b) => (orderMap.get(a.questionId) ?? 0) - (orderMap.get(b.questionId) ?? 0),
    );

    // Détecte si la notation a été normalisée sur 20 (toutes les questions avaient 1pt par défaut)
    const questionCount = attempt.questionOrder.length;
    const allDefault = questions.length > 0 && questions.every((q) => Math.abs(Number(q.points) - 1) < 0.001);
    const questionMaxPoints = allDefault && questionCount > 0
      ? Math.round((20 / questionCount) * 100) / 100
      : null;

    return {
      score: Number(attempt.score),
      maxScore: Number(attempt.maxScore),
      isPassed: attempt.isPassed,
      timedOut: attempt.timedOut,
      attemptNumber: attempt.attemptNumber,
      questions: rawAnswerAttempts.map((aa) => {
        const question = questionMap.get(aa.questionId);
        const selectedAnswer = aa.answerId && question
          ? (question.answers.find((a) => a.id === aa.answerId) ?? null)
          : null;
        const correctAnswer = question
          ? (question.answers.find((a) => a.isCorrect) ?? null)
          : null;

        return {
          questionText: question?.text ?? '',
          categoryName: question?.category?.name ?? '',
          pointsEarned: Number(aa.pointsEarned),
          questionMaxPoints: questionMaxPoints ?? Number(question?.points ?? 1),
          isCorrect: aa.isCorrect,
          timedOut: aa.timedOut,
          selectedAnswer: selectedAnswer ? { text: selectedAnswer.text } : null,
          correctAnswer: correctAnswer ? { text: correctAnswer.text } : null,
        };
      }),
    };
  }

  async getHistory(commercialId: string): Promise<HistoryEntry[]> {
    const rows = await this.attemptRepo
      .createQueryBuilder('attempt')
      .leftJoin(QuizSession, 'session', 'session.id = attempt.sessionId')
      .select([
        'attempt.id AS attemptId',
        'session.sessionDate AS sessionDate',
        'session.title AS sessionTitle',
        'attempt.score AS score',
        'attempt.maxScore AS maxScore',
        'attempt.isPassed AS isPassed',
        'attempt.completedAt AS completedAt',
      ])
      .where('attempt.commercialId = :commercialId', { commercialId })
      .andWhere('session.historyVisible = 1')
      .orderBy('attempt.startedAt', 'DESC')
      .getRawMany<{
        attemptId: string;
        sessionDate: string;
        sessionTitle: string;
        score: string | null;
        maxScore: string | null;
        isPassed: number | null;
        completedAt: Date | null;
      }>();

    return rows.map((r) => ({
      attemptId: r.attemptId,
      sessionDate: r.sessionDate,
      sessionTitle: r.sessionTitle,
      score: r.score !== null ? Number(r.score) : null,
      maxScore: r.maxScore !== null ? Number(r.maxScore) : null,
      isPassed: r.isPassed !== null ? Boolean(r.isPassed) : null,
      completedAt: r.completedAt,
    }));
  }

  private resolveAttemptCompleted(session: QuizSession, attempts: QuizAttempt[]): boolean {
    if (session.maxAttempts !== 0 && attempts.length >= session.maxAttempts) return true;

    const completed = attempts.filter((a) => a.completedAt !== null);
    if (completed.length === 0) return false;

    if (session.passingScore === null) return true;

    return completed.some((a) => a.score !== null && Number(a.score) >= Number(session.passingScore));
  }

  private async loadSessionQuestionsWithRelations(sessionId: string): Promise<QuizSessionQuestion[]> {
    return this.sqRepo
      .createQueryBuilder('sq')
      .leftJoinAndSelect('sq.question', 'question')
      .leftJoinAndSelect('question.category', 'category')
      .leftJoinAndSelect('question.answers', 'answer')
      .where('sq.sessionId = :sessionId', { sessionId })
      .orderBy('sq.position', 'ASC')
      .getMany();
  }

  private applyQuestionOrder(
    sessionQuestions: QuizSessionQuestion[],
    questionOrder: string[] | null,
  ): QuizSessionQuestion[] {
    if (questionOrder === null) {
      const ids = this.fisherYates(sessionQuestions.map((sq) => sq.questionId));
      const map = new Map(sessionQuestions.map((sq) => [sq.questionId, sq]));
      return ids.map((id) => map.get(id)).filter((sq): sq is QuizSessionQuestion => sq !== undefined);
    }

    const map = new Map(sessionQuestions.map((sq) => [sq.questionId, sq]));
    return questionOrder
      .map((id) => map.get(id))
      .filter((sq): sq is QuizSessionQuestion => sq !== undefined);
  }

  private fisherYates<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
