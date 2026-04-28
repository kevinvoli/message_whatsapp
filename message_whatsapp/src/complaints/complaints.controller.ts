import {
  Body, Controller, Get, HttpCode, Param, Patch, Post,
  Query, Request, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';
import { ComplaintsService } from './complaints.service';
import { ComplaintCategory, ComplaintPriority, ComplaintStatus } from './entities/complaint.entity';
import {
  AssignComplaintDto,
  CreateComplaintDto,
  RejectComplaintDto,
  ResolveComplaintDto,
} from './dto/create-complaint.dto';

interface JwtUser { userId: string; username?: string; name?: string; }

/** Commerciaux : créer des plaintes depuis une conversation. */
@Controller('complaints')
@UseGuards(AuthGuard('jwt'))
export class ComplaintsController {
  constructor(private readonly service: ComplaintsService) {}

  @Post()
  create(@Body() dto: CreateComplaintDto, @Request() req: { user: JwtUser }) {
    return this.service.create(dto, req.user.userId, req.user.name ?? req.user.username);
  }

  @Get()
  findMine(
    @Request() req: { user: JwtUser },
    @Query('status')   status?:   ComplaintStatus,
    @Query('category') category?: ComplaintCategory,
  ) {
    return this.service.findAll({ commercialId: req.user.userId, status, category });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}

/** Admin / superviseur : assigner, traiter, résoudre, rejeter. */
@Controller('admin/complaints')
@UseGuards(AdminGuard)
export class ComplaintsAdminController {
  constructor(private readonly service: ComplaintsService) {}

  @Get()
  findAll(
    @Query('status')    status?:    ComplaintStatus,
    @Query('category')  category?:  ComplaintCategory,
    @Query('priority')  priority?:  ComplaintPriority,
    @Query('limit')     limit?:     string,
    @Query('offset')    offset?:    string,
  ) {
    return this.service.findAll({
      status, category, priority,
      limit:  limit  ? parseInt(limit,  10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/assign')
  @HttpCode(200)
  assign(@Param('id') id: string, @Body() dto: AssignComplaintDto) {
    return this.service.assign(id, dto);
  }

  @Patch(':id/start')
  @HttpCode(200)
  startProcessing(@Param('id') id: string) {
    return this.service.startProcessing(id);
  }

  @Patch(':id/resolve')
  @HttpCode(200)
  resolve(@Param('id') id: string, @Body() dto: ResolveComplaintDto) {
    return this.service.resolve(id, dto);
  }

  @Patch(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: RejectComplaintDto) {
    return this.service.reject(id, dto);
  }
}
