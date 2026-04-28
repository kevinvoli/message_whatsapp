import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ComplaintCategory, ComplaintPriority } from '../entities/complaint.entity';

export class CreateComplaintDto {
  @IsEnum(ComplaintCategory)
  category: ComplaintCategory;

  @IsOptional() @IsEnum(ComplaintPriority)
  priority?: ComplaintPriority;

  @IsString() @MaxLength(2000)
  description: string;

  @IsOptional() @IsString() @MaxLength(100)
  chatId?: string;

  @IsOptional() @IsString() @MaxLength(36)
  contactId?: string;

  @IsOptional() @IsString() @MaxLength(100)
  orderIdDb2?: string;
}

export class AssignComplaintDto {
  @IsString() @MaxLength(36)
  assignedTo: string;

  @IsOptional() @IsString() @MaxLength(100)
  assignedToName?: string;
}

export class ResolveComplaintDto {
  @IsString() @MaxLength(2000)
  resolutionNote: string;
}

export class RejectComplaintDto {
  @IsOptional() @IsString() @MaxLength(2000)
  resolutionNote?: string;
}
