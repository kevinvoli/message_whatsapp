import { IsString } from 'class-validator';

export class GetMessagesDto {
  @IsString()
  conversationId: string;
}
