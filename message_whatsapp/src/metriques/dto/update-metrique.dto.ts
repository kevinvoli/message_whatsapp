import { PartialType } from '@nestjs/swagger';
import { CreateMetriqueDto } from './create-metrique.dto';

export class UpdateMetriqueDto extends PartialType(CreateMetriqueDto) {}
