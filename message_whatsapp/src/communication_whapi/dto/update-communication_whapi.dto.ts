import { PartialType } from '@nestjs/mapped-types';
import { CreateCommunicationWhapiDto } from './create-communication_whapi.dto';

export class UpdateCommunicationWhapiDto extends PartialType(
  CreateCommunicationWhapiDto,
) {}
