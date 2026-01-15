import { IsString } from 'class-validator';

export class GetConversationDto {
  @IsString()
  agentId: string;
}
