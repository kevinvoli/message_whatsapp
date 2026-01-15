import { IsString } from 'class-validator';

export class LeaveConversationDto {
  @IsString()
  conversationId: string;
}
