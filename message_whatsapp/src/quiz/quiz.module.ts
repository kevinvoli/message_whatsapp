import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizCategory } from './entities/quiz-category.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizSession } from './entities/quiz-session.entity';
import { QuizSessionQuestion } from './entities/quiz-session-question.entity';
import { QuizPdf } from './entities/quiz-pdf.entity';
import { QuizExemption } from './entities/quiz-exemption.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAnswerAttempt } from './entities/quiz-answer-attempt.entity';
import { QuizAdminController } from './quiz-admin.controller';
import { QuizAdminService } from './quiz-admin.service';
import { QuizSessionService } from './quiz-session.service';
import { QuizExemptionService } from './quiz-exemption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuizCategory,
      QuizQuestion,
      QuizAnswer,
      QuizSession,
      QuizSessionQuestion,
      QuizPdf,
      QuizExemption,
      QuizAttempt,
      QuizAnswerAttempt,
    ]),
  ],
  controllers: [QuizAdminController],
  providers: [QuizAdminService, QuizSessionService, QuizExemptionService],
  exports: [QuizExemptionService, QuizSessionService],
})
export class QuizModule {}
