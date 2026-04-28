import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Complaint, ComplaintCategory, ComplaintPriority, ComplaintStatus } from './entities/complaint.entity';
import {
  AssignComplaintDto,
  CreateComplaintDto,
  RejectComplaintDto,
  ResolveComplaintDto,
} from './dto/create-complaint.dto';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    @InjectRepository(Complaint)
    private readonly complaintRepo: Repository<Complaint>,
  ) {}

  async create(dto: CreateComplaintDto, commercialId: string, commercialName?: string): Promise<Complaint> {
    const complaint = this.complaintRepo.create({
      category:       dto.category,
      priority:       dto.priority ?? ComplaintPriority.NORMALE,
      description:    dto.description,
      chatId:         dto.chatId ?? null,
      contactId:      dto.contactId ?? null,
      orderIdDb2:     dto.orderIdDb2 ?? null,
      commercialId,
      commercialName: commercialName ?? null,
      status:         ComplaintStatus.OUVERTE,
    });

    const saved = await this.complaintRepo.save(complaint);
    this.logger.log(`COMPLAINT_CREATED id=${saved.id} cat=${dto.category} commercial=${commercialId}`);
    return saved;
  }

  async findAll(options: {
    status?:      ComplaintStatus;
    category?:    ComplaintCategory;
    priority?:    ComplaintPriority;
    commercialId?: string;
    limit?:       number;
    offset?:      number;
  } = {}): Promise<{ items: Complaint[]; total: number }> {
    const qb = this.complaintRepo.createQueryBuilder('c');
    if (options.status)       qb.andWhere('c.status = :st',   { st: options.status });
    if (options.category)     qb.andWhere('c.category = :cat', { cat: options.category });
    if (options.priority)     qb.andWhere('c.priority = :p',   { p: options.priority });
    if (options.commercialId) qb.andWhere('c.commercialId = :cid', { cid: options.commercialId });
    qb.orderBy('c.priority', 'DESC').addOrderBy('c.createdAt', 'DESC');
    qb.take(options.limit ?? 50).skip(options.offset ?? 0);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findOne(id: string): Promise<Complaint> {
    const c = await this.complaintRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Plainte ${id} introuvable.`);
    return c;
  }

  /** E09-T02 — Assigner la plainte à un responsable (ouverte → assignée). */
  async assign(id: string, dto: AssignComplaintDto): Promise<Complaint> {
    const c = await this.findOne(id);
    if (c.status !== ComplaintStatus.OUVERTE && c.status !== ComplaintStatus.ASSIGNEE) {
      throw new BadRequestException(`Impossible d'assigner une plainte en status "${c.status}".`);
    }
    c.status         = ComplaintStatus.ASSIGNEE;
    c.assignedTo     = dto.assignedTo;
    c.assignedToName = dto.assignedToName ?? null;
    const saved = await this.complaintRepo.save(c);
    this.logger.log(`COMPLAINT_ASSIGNED id=${id} to=${dto.assignedTo}`);
    return saved;
  }

  /** Passer en traitement (assignée → en_traitement). */
  async startProcessing(id: string): Promise<Complaint> {
    const c = await this.findOne(id);
    if (c.status !== ComplaintStatus.ASSIGNEE) {
      throw new BadRequestException(`La plainte doit être assignée pour passer en traitement (status: ${c.status}).`);
    }
    c.status = ComplaintStatus.EN_TRAITEMENT;
    const saved = await this.complaintRepo.save(c);
    this.logger.log(`COMPLAINT_PROCESSING id=${id}`);
    return saved;
  }

  /** E09-T02 — Résoudre la plainte (en_traitement → résolue). */
  async resolve(id: string, dto: ResolveComplaintDto): Promise<Complaint> {
    const c = await this.findOne(id);
    const resolvableStatuses = [ComplaintStatus.ASSIGNEE, ComplaintStatus.EN_TRAITEMENT];
    if (!resolvableStatuses.includes(c.status)) {
      throw new BadRequestException(`La plainte ne peut pas être résolue (status: ${c.status}).`);
    }
    c.status         = ComplaintStatus.RESOLUE;
    c.resolutionNote = dto.resolutionNote;
    c.resolvedAt     = new Date();
    const saved = await this.complaintRepo.save(c);
    this.logger.log(`COMPLAINT_RESOLVED id=${id}`);
    return saved;
  }

  /** Rejeter la plainte. */
  async reject(id: string, dto: RejectComplaintDto): Promise<Complaint> {
    const c = await this.findOne(id);
    if (c.status === ComplaintStatus.RESOLUE || c.status === ComplaintStatus.REJETEE) {
      throw new BadRequestException(`La plainte est déjà clôturée (status: ${c.status}).`);
    }
    c.status         = ComplaintStatus.REJETEE;
    c.resolutionNote = dto.resolutionNote ?? null;
    c.resolvedAt     = new Date();
    const saved = await this.complaintRepo.save(c);
    this.logger.log(`COMPLAINT_REJECTED id=${id}`);
    return saved;
  }

  async getStats(): Promise<{
    byStatus:   Record<ComplaintStatus, number>;
    byCategory: Record<ComplaintCategory, number>;
    byCritiqueOpen: number;
  }> {
    const [statusRows, catRows] = await Promise.all([
      this.complaintRepo
        .createQueryBuilder('c')
        .select('c.status', 'status').addSelect('COUNT(*)', 'cnt')
        .groupBy('c.status').getRawMany<{ status: ComplaintStatus; cnt: string }>(),
      this.complaintRepo
        .createQueryBuilder('c')
        .select('c.category', 'cat').addSelect('COUNT(*)', 'cnt')
        .groupBy('c.category').getRawMany<{ cat: ComplaintCategory; cnt: string }>(),
    ]);

    const byStatus = Object.values(ComplaintStatus).reduce((acc, s) => {
      acc[s] = 0; return acc;
    }, {} as Record<ComplaintStatus, number>);
    for (const row of statusRows) byStatus[row.status] = parseInt(row.cnt, 10);

    const byCategory = Object.values(ComplaintCategory).reduce((acc, c) => {
      acc[c] = 0; return acc;
    }, {} as Record<ComplaintCategory, number>);
    for (const row of catRows) byCategory[row.cat] = parseInt(row.cnt, 10);

    const byCritiqueOpen = await this.complaintRepo.count({
      where: { priority: ComplaintPriority.CRITIQUE, status: ComplaintStatus.OUVERTE },
    });

    return { byStatus, byCategory, byCritiqueOpen };
  }
}
