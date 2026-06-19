import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
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
import { QuizCommercialController } from './quiz-commercial.controller';
import { QuizAdminService } from './quiz-admin.service';
import { QuizSessionService } from './quiz-session.service';
import { QuizExemptionService } from './quiz-exemption.service';
import { QuizAttemptService } from './quiz-attempt.service';
import { QuizPdfService } from './quiz-pdf.service';

@Module({
  imports: [
    MulterModule.register({}),
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
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '3600s' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [QuizAdminController, QuizCommercialController],
  providers: [QuizAdminService, QuizSessionService, QuizExemptionService, QuizAttemptService, QuizPdfService],
  exports: [QuizExemptionService, QuizSessionService],
})
export class QuizModule {}
