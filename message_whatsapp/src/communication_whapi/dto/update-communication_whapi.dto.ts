import { PartialType } from '@nestjs/swagger';
import { CreateCommunicationWhapiDto } from './create-communication_whapi.dto';

export class UpdateCommunicationWhapiDto extends PartialType(CreateCommunicationWhapiDto) {}
