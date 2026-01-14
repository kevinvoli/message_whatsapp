import { PartialType } from '@nestjs/mapped-types';
import { CreateWhapiDto } from './create-whapi.dto';

export class UpdateWhapiDto extends PartialType(CreateWhapiDto) {}
