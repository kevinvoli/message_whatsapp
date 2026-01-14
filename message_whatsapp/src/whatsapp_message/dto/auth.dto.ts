import { IsString } from 'class-validator';

export class AuthDto {
  @IsString()
  commercialId: string;

  @IsString()
  token: string;
}
