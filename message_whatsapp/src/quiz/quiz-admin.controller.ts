import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/admin.guard';
import { QuizAdminService } from './quiz-admin.service';
import { QuizSessionService } from './quiz-session.service';
import { QuizExemptionService } from './quiz-exemption.service';
import { QuizPdfService } from './quiz-pdf.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { DuplicateSessionDto } from './dto/duplicate-session.dto';
import { CreateExemptionDto } from './dto/create-exemption.dto';
import { CreatePdfDto } from './dto/create-pdf.dto';
import { UpdatePdfDto } from './dto/update-pdf.dto';

const pdfUploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

@Controller('quiz/admin')
@UseGuards(AdminGuard)
export class QuizAdminController {
  constructor(
    private readonly adminService: QuizAdminService,
    private readonly sessionService: QuizSessionService,
    private readonly exemptionService: QuizExemptionService,
    private readonly pdfService: QuizPdfService,
  ) {}

  @Get('categories')
  findAllCategories() {
    return this.adminService.findAllCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.adminService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.adminService.removeCategory(id);
  }

  @Get('questions')
  findAllQuestions(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.adminService.findAllQuestions({
      categoryId,
      search,
      activeOnly: activeOnly === 'true',
    });
  }

  @Post('questions')
  createQuestion(@Body() dto: CreateQuestionDto) {
    return this.adminService.createQuestion(dto);
  }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.adminService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  archiveQuestion(@Param('id') id: string) {
    return this.adminService.archiveQuestion(id);
  }

  @Get('sessions')
  findAllSessions() {
    return this.sessionService.findAllSessions();
  }

  @Post('sessions')
  createSession(@Body() dto: CreateSessionDto) {
    return this.sessionService.createSession(dto);
  }

  @Patch('sessions/:id')
  updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.sessionService.updateSession(id, dto);
  }

  @Delete('sessions/:id')
  removeSession(@Param('id') id: string) {
    return this.sessionService.removeSession(id);
  }

  @Post('sessions/:id/duplicate')
  duplicateSession(@Param('id') id: string, @Body() dto: DuplicateSessionDto) {
    return this.sessionService.duplicateSession(id, dto.targetDates);
  }

  @Get('sessions/:id/results')
  getSessionResults(@Param('id') id: string) {
    return this.adminService.getSessionResults(id);
  }

  @Get('exemptions')
  findAllExemptions() {
    return this.exemptionService.findAllExemptions();
  }

  @Post('exemptions')
  createExemption(@Body() dto: CreateExemptionDto) {
    return this.exemptionService.createExemption(dto);
  }

  @Delete('exemptions/:id')
  removeExemption(@Param('id') id: string) {
    return this.exemptionService.removeExemption(id);
  }

  @Post('pdfs')
  @UseInterceptors(pdfUploadInterceptor)
  uploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreatePdfDto,
  ) {
    return this.pdfService.uploadPdf(file, dto);
  }

  @Post('sessions/:id/pdf')
  @UseInterceptors(pdfUploadInterceptor)
  uploadPdfForSession(
    @Param('id') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreatePdfDto,
  ) {
    return this.pdfService.uploadPdf(file, { ...dto, sessionId });
  }

  @Get('pdfs')
  findAllPdfs() {
    return this.pdfService.findAll();
  }

  @Patch('pdfs/:id')
  updatePdf(@Param('id') id: string, @Body() dto: UpdatePdfDto) {
    return this.pdfService.update(id, dto);
  }

  @Delete('pdfs/:id')
  deletePdf(@Param('id') id: string) {
    return this.pdfService.softDelete(id);
  }
}
