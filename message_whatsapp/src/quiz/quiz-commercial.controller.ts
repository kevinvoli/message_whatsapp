import { Body, Controller, Get, Param, Post, Request, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsUUID } from 'class-validator';
import { Response } from 'express';
import { QuizAttemptService } from './quiz-attempt.service';
import { QuizPdfService } from './quiz-pdf.service';
import { AnswerSubmission, SubmitAttemptDto } from './dto/submit-attempt.dto';

class SubmitBody {
  @IsUUID()
  attemptId: string;

  answers: AnswerSubmission[];
  timedOut: boolean;
}

@Controller('quiz')
@UseGuards(AuthGuard('jwt'))
export class QuizCommercialController {
  constructor(
    private readonly attemptService: QuizAttemptService,
    private readonly pdfService: QuizPdfService,
  ) {}

  @Get('today')
  getToday(@Request() req: { user: { userId: string; posteId?: string } }) {
    const { userId, posteId } = req.user;
    return this.attemptService.getTodaySession(userId, posteId ?? null);
  }

  @Post('today/start')
  startAttempt(
    @Request() req: { user: { userId: string } },
    @Body() body: { sessionId: string },
  ) {
    return this.attemptService.startAttempt(req.user.userId, body.sessionId);
  }

  @Post('today/submit')
  submitAttempt(
    @Request() req: { user: { userId: string } },
    @Body() body: SubmitBody,
  ) {
    const dto: SubmitAttemptDto = { answers: body.answers, timedOut: body.timedOut };
    return this.attemptService.submitAttempt(req.user.userId, body.attemptId, dto);
  }

  @Get('today/result/:attemptId')
  getResult(
    @Request() req: { user: { userId: string } },
    @Param('attemptId') attemptId: string,
  ) {
    return this.attemptService.getAttemptResult(req.user.userId, attemptId);
  }

  @Get('history')
  getHistory(@Request() req: { user: { userId: string } }) {
    return this.attemptService.getHistory(req.user.userId);
  }

  @Get('pdfs')
  findAccessiblePdfs() {
    return this.pdfService.findAccessibleForCommercial();
  }

  @Get('pdfs/:id/view')
  viewPdf(@Param('id') id: string, @Res() res: Response) {
    return this.pdfService.streamPdf(id, true, res);
  }

  @Get('pdfs/:id/download')
  downloadPdf(@Param('id') id: string, @Res() res: Response) {
    return this.pdfService.streamPdf(id, false, res);
  }
}
