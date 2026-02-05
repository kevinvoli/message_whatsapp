import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AutoMessageChannel } from '../entities/message-auto.entity';

export class CreateMessageAutoDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsInt()
  delai?: number;

  @IsOptional()
  @IsEnum(AutoMessageChannel)
  canal?: AutoMessageChannel;

  @IsInt()
  @Min(0)
  position: number;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  conditions?: any;
}
