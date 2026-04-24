import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationReportService, UpsertReportDto } from './conversation-report.service';
import { ReportSubmissionService } from './report-submission.service';

interface JwtUser { userId: string; posteId?: string; }

@ApiTags('GICOP Report')
@Controller('gicop-report')
@UseGuards(AuthGuard('jwt'))
export class ConversationReportController {
  constructor(
    private readonly service: ConversationReportService,
    private readonly submissionService: ReportSubmissionService,
  ) {}

  @Get(':chatId')
  @ApiOperation({ summary: 'Récupère le rapport GICOP d\'une conversation' })
  findOne(@Param('chatId') chatId: string) {
    return this.service.findByChatId(chatId);
  }

  @Put(':chatId')
  @ApiOperation({ summary: 'Crée ou met à jour le rapport GICOP (autosave)' })
  upsert(
    @Param('chatId') chatId: string,
    @Body() dto: UpsertReportDto,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.upsert(chatId, {
      ...dto,
      commercialId: req.user.userId,
    });
  }

  @Patch(':chatId/validate')
  @ApiOperation({ summary: 'Valide le rapport GICOP (superviseur)' })
  validate(
    @Param('chatId') chatId: string,
    @Request() req: { user: JwtUser },
  ) {
    return this.service.validate(chatId, req.user.userId);
  }

  @Post(':chatId/submit')
  @ApiOperation({ summary: 'Soumet le rapport vers la plateforme de gestion des commandes' })
  submit(
    @Param('chatId') chatId: string,
    @Request() req: { user: JwtUser },
  ) {
    return this.submissionService.submitReport(chatId, req.user.userId);
  }

  @Get(':chatId/submission-status')
  @ApiOperation({ summary: 'Statut de soumission du rapport' })
  submissionStatus(@Param('chatId') chatId: string) {
    return this.submissionService.getSubmissionStatus(chatId);
  }

  @Get('admin/failed-submissions')
  @ApiOperation({ summary: 'Liste des rapports en échec de soumission (admin)' })
  failedSubmissions() {
    return this.submissionService.getFailedReports();
  }

  @Post('admin/:chatId/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Relance la soumission d\'un rapport en échec (admin)' })
  retrySubmission(@Param('chatId') chatId: string) {
    return this.submissionService.retryReport(chatId);
  }
}
