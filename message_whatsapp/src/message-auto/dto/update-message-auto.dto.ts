import { PartialType } from '@nestjs/swagger';
import { CreateMessageAutoDto } from './create-message-auto.dto';

export class UpdateMessageAutoDto extends PartialType(CreateMessageAutoDto) {}
