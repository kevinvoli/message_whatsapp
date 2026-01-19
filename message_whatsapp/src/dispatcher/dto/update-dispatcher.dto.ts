import { PartialType } from '@nestjs/mapped-types';
import { CreateDispatcherDto } from './create-dispatcher.dto';

export class UpdateDispatcherDto extends PartialType(CreateDispatcherDto) {}
