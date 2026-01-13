import { PartialType } from '@nestjs/swagger';
import { CreateDispatcherDto } from './create-dispatcher.dto';

export class UpdateDispatcherDto extends PartialType(CreateDispatcherDto) {}
