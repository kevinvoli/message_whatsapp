import { PartialType } from '@nestjs/swagger';
import { CreateWhapiDto } from './create-whapi.dto';

export class UpdateWhapiDto extends PartialType(CreateWhapiDto) {}
