import { IsString } from 'class-validator';

export class AgentMessageDto {
  @IsString()
  conversationId: string;

  @IsString()
  content: string;

  @IsString()
  author: string;

  @IsString()
  chat_id: string;
}
